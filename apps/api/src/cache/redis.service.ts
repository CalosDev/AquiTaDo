import {
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private client: Redis | null = null;
    private readonly redisUrl: string | null;
    private readonly defaultTtlSeconds: number;

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
}
