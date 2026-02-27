import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type SwrEnvelope<T> = {
    value: T;
    freshUntil: number;
    staleUntil: number;
    updatedAt: number;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis | null = null;
    private readonly redisUrl: string | null;
    private readonly defaultTtlSeconds: number;
    private readonly fallbackSWRLocks = new Set<string>();

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
    ) {
        this.redisUrl = this.configService.get<string>('REDIS_URL')?.trim() ?? null;
        this.defaultTtlSeconds = this.resolveDefaultTtlSeconds();
    }

    async onModuleInit() {
        if (!this.redisUrl) {
            this.logger.log('Redis disabled: REDIS_URL not configured');
            return;
        }

        const client = new Redis(this.redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableReadyCheck: true,
        });

        client.on('error', (error) => {
            this.logger.warn(`Redis error: ${error.message}`);
        });

        try {
            await client.connect();
            this.client = client;
            this.logger.log('Redis cache connected');
        } catch (error) {
            this.logger.warn(
                `Redis unavailable; continuing without distributed cache (${error instanceof Error ? error.message : String(error)})`,
            );
            client.disconnect();
            this.client = null;
        }
    }

    async onModuleDestroy() {
        if (!this.client) {
            return;
        }

        await this.client.quit();
        this.client = null;
    }

    isReady(): boolean {
        return this.client !== null && this.client.status === 'ready';
    }

    async getJson<T>(key: string): Promise<T | null> {
        if (!this.client || !this.isReady()) {
            return null;
        }

        try {
            const payload = await this.client.get(key);
            if (!payload) {
                return null;
            }

            return JSON.parse(payload) as T;
        } catch (error) {
            this.logger.warn(
                `Redis get failed for key="${key}" (${error instanceof Error ? error.message : String(error)})`,
            );
            return null;
        }
    }

    async setJson(
        key: string,
        value: unknown,
        ttlSeconds = this.defaultTtlSeconds,
    ): Promise<void> {
        if (!this.client || !this.isReady()) {
            return;
        }

        try {
            const payload = JSON.stringify(value);
            const boundedTtl = Number.isInteger(ttlSeconds) && ttlSeconds > 0
                ? ttlSeconds
                : this.defaultTtlSeconds;
            await this.client.set(key, payload, 'EX', boundedTtl);
        } catch (error) {
            this.logger.warn(
                `Redis set failed for key="${key}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }
    }

    async rememberJson<T>(
        key: string,
        ttlSeconds: number,
        fallback: () => Promise<T>,
    ): Promise<T> {
        const cached = await this.getJson<T>(key);
        if (cached !== null) {
            return cached;
        }

        const freshValue = await fallback();
        await this.setJson(key, freshValue, ttlSeconds);
        return freshValue;
    }

    async rememberJsonStaleWhileRevalidate<T>(
        key: string,
        freshTtlSeconds: number,
        staleTtlSeconds: number,
        fallback: () => Promise<T>,
    ): Promise<T> {
        if (!this.client || !this.isReady()) {
            return fallback();
        }

        const now = Date.now();
        const cached = await this.getJson<SwrEnvelope<T>>(key);

        if (this.isValidSwrEnvelope(cached) && now <= cached.staleUntil) {
            if (now > cached.freshUntil) {
                void this.refreshSwrInBackground(
                    key,
                    freshTtlSeconds,
                    staleTtlSeconds,
                    fallback,
                );
            }
            return cached.value;
        }

        return this.refreshSwrSynchronously(
            key,
            freshTtlSeconds,
            staleTtlSeconds,
            fallback,
        );
    }

    async incrementWithTtl(
        key: string,
        ttlSeconds: number,
    ): Promise<number | null> {
        if (!this.client || !this.isReady()) {
            return null;
        }

        try {
            const count = await this.client.incr(key);
            if (count === 1) {
                await this.client.expire(key, Math.max(1, ttlSeconds));
            }
            return count;
        } catch (error) {
            this.logger.warn(
                `Redis incrementWithTtl failed for key="${key}" (${error instanceof Error ? error.message : String(error)})`,
            );
            return null;
        }
    }

    async deleteByPrefix(prefix: string): Promise<number> {
        if (!this.client || !this.isReady()) {
            return 0;
        }

        let cursor = '0';
        let deletedCount = 0;

        try {
            do {
                const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
                cursor = nextCursor;

                if (keys.length > 0) {
                    const deleted = await this.client.del(...keys);
                    deletedCount += deleted;
                }
            } while (cursor !== '0');
        } catch (error) {
            this.logger.warn(
                `Redis deleteByPrefix failed for prefix="${prefix}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }

        return deletedCount;
    }

    private resolveDefaultTtlSeconds(): number {
        const raw = this.configService.get<string>('REDIS_CACHE_TTL_SECONDS');
        if (!raw) {
            return 120;
        }

        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return 120;
        }

        return parsed;
    }

    private async refreshSwrSynchronously<T>(
        key: string,
        freshTtlSeconds: number,
        staleTtlSeconds: number,
        fallback: () => Promise<T>,
    ): Promise<T> {
        const freshValue = await fallback();
        await this.persistSwrEnvelope(key, freshValue, freshTtlSeconds, staleTtlSeconds);
        return freshValue;
    }

    private async refreshSwrInBackground<T>(
        key: string,
        freshTtlSeconds: number,
        staleTtlSeconds: number,
        fallback: () => Promise<T>,
    ): Promise<void> {
        const lockKey = `${key}:swr:refresh`;
        const acquired = await this.acquireSWRLock(lockKey, 30);
        if (!acquired) {
            return;
        }

        try {
            const freshValue = await fallback();
            await this.persistSwrEnvelope(key, freshValue, freshTtlSeconds, staleTtlSeconds);
        } catch (error) {
            this.logger.warn(
                `Redis SWR background refresh failed for key="${key}" (${error instanceof Error ? error.message : String(error)})`,
            );
        } finally {
            await this.releaseSWRLock(lockKey);
        }
    }

    private async persistSwrEnvelope<T>(
        key: string,
        value: T,
        freshTtlSeconds: number,
        staleTtlSeconds: number,
    ): Promise<void> {
        const now = Date.now();
        const freshMs = Math.max(1, freshTtlSeconds) * 1_000;
        const staleMs = Math.max(1, staleTtlSeconds) * 1_000;
        const envelope: SwrEnvelope<T> = {
            value,
            freshUntil: now + freshMs,
            staleUntil: now + freshMs + staleMs,
            updatedAt: now,
        };

        await this.setJson(
            key,
            envelope,
            Math.ceil((freshMs + staleMs) / 1_000) + 10,
        );
    }

    private isValidSwrEnvelope<T>(value: unknown): value is SwrEnvelope<T> {
        if (!value || typeof value !== 'object') {
            return false;
        }

        const asRecord = value as Record<string, unknown>;
        return typeof asRecord.freshUntil === 'number'
            && typeof asRecord.staleUntil === 'number'
            && Object.prototype.hasOwnProperty.call(asRecord, 'value');
    }

    private async acquireSWRLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
        if (this.client && this.isReady()) {
            try {
                const result = await this.client.set(
                    lockKey,
                    String(Date.now()),
                    'EX',
                    Math.max(1, ttlSeconds),
                    'NX',
                );
                return result === 'OK';
            } catch {
                return false;
            }
        }

        if (this.fallbackSWRLocks.has(lockKey)) {
            return false;
        }

        this.fallbackSWRLocks.add(lockKey);
        return true;
    }

    private async releaseSWRLock(lockKey: string): Promise<void> {
        if (this.client && this.isReady()) {
            try {
                await this.client.del(lockKey);
            } catch {
                // ignore lock release errors
            }
        }

        this.fallbackSWRLocks.delete(lockKey);
    }
}
