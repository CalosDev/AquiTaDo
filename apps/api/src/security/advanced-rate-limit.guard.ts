import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../cache/redis.service';
import { ObservabilityService } from '../observability/observability.service';
import {
    RATE_LIMIT_POLICY_KEY,
    RateLimitPolicyName,
} from './rate-limit-policy.decorator';

type BucketState = {
    count: number;
    resetAt: number;
};

type RateLimitConfig = {
    windowSeconds: number;
    ipLimit: number;
    apiKeyLimit: number;
};

@Injectable()
export class AdvancedRateLimitGuard implements CanActivate {
    private readonly fallbackBuckets = new Map<string, BucketState>();

    constructor(
        @Inject(Reflector)
        private readonly reflector: Reflector,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse<Response>();
        const policy = this.reflector.getAllAndOverride<RateLimitPolicyName>(
            RATE_LIMIT_POLICY_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!policy) {
            return true;
        }

        const config = this.resolvePolicyConfig(policy);
        const clientIp = this.resolveClientIp(request);
        const apiKey = this.resolveApiKey(request);
        const checks: Array<{
            identifier: 'ip' | 'api_key';
            value: string;
            limit: number;
        }> = [
            {
                identifier: 'ip',
                value: clientIp,
                limit: config.ipLimit,
            },
        ];

        if (apiKey) {
            checks.push({
                identifier: 'api_key',
                value: apiKey,
                limit: config.apiKeyLimit,
            });
        }

        for (const check of checks) {
            const key = `rl:${policy}:${check.identifier}:${check.value}`;
            const count = await this.incrementCounter(key, config.windowSeconds);

            if (count > check.limit) {
                this.observabilityService.trackRateLimitHit(policy, check.identifier);
                response.setHeader('Retry-After', String(config.windowSeconds));
                throw new HttpException(
                    {
                        message: `Rate limit excedido para politica "${policy}"`,
                        policy,
                        identifier: check.identifier,
                        retryAfterSeconds: config.windowSeconds,
                    },
                    HttpStatus.TOO_MANY_REQUESTS,
                );
            }

            response.setHeader(`x-ratelimit-limit-${check.identifier}`, String(check.limit));
            response.setHeader(
                `x-ratelimit-remaining-${check.identifier}`,
                String(Math.max(check.limit - count, 0)),
            );
        }

        response.setHeader('x-ratelimit-window', String(config.windowSeconds));
        return true;
    }

    private async incrementCounter(
        key: string,
        windowSeconds: number,
    ): Promise<number> {
        const redisCount = await this.redisService.incrementWithTtl(key, windowSeconds);
        if (redisCount !== null) {
            return redisCount;
        }

        const now = Date.now();
        const windowMs = windowSeconds * 1_000;
        const current = this.fallbackBuckets.get(key);
        if (!current || current.resetAt <= now) {
            this.fallbackBuckets.set(key, {
                count: 1,
                resetAt: now + windowMs,
            });
            this.cleanupFallbackBuckets(now);
            return 1;
        }

        current.count += 1;
        this.fallbackBuckets.set(key, current);
        this.cleanupFallbackBuckets(now);
        return current.count;
    }

    private cleanupFallbackBuckets(now: number): void {
        if (this.fallbackBuckets.size < 5_000) {
            return;
        }

        for (const [key, state] of this.fallbackBuckets.entries()) {
            if (state.resetAt <= now) {
                this.fallbackBuckets.delete(key);
            }
        }
    }

    private resolveClientIp(request: Request): string {
        const forwardedFor = request.headers['x-forwarded-for'];
        if (typeof forwardedFor === 'string' && forwardedFor.trim().length > 0) {
            return forwardedFor.split(',')[0]!.trim();
        }

        if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
            return forwardedFor[0]!.split(',')[0]!.trim();
        }

        return request.ip || request.socket.remoteAddress || 'unknown';
    }

    private resolveApiKey(request: Request): string | null {
        const header = request.headers['x-api-key'];
        if (typeof header === 'string' && header.trim().length > 0) {
            return header.trim();
        }

        if (Array.isArray(header) && header.length > 0 && typeof header[0] === 'string') {
            return header[0].trim();
        }

        return null;
    }

    private resolvePolicyConfig(policy: RateLimitPolicyName): RateLimitConfig {
        const upper = policy.toUpperCase();

        const defaults: Record<RateLimitPolicyName, RateLimitConfig> = {
            default: {
                windowSeconds: 60,
                ipLimit: 240,
                apiKeyLimit: 1_200,
            },
            search: {
                windowSeconds: 60,
                ipLimit: 120,
                apiKeyLimit: 600,
            },
            ai: {
                windowSeconds: 60,
                ipLimit: 30,
                apiKeyLimit: 180,
            },
        };

        const fallback = defaults[policy];
        return {
            windowSeconds: this.resolvePositiveInt(`RATE_LIMIT_${upper}_WINDOW_SECONDS`, fallback.windowSeconds),
            ipLimit: this.resolvePositiveInt(`RATE_LIMIT_${upper}_IP_LIMIT`, fallback.ipLimit),
            apiKeyLimit: this.resolvePositiveInt(`RATE_LIMIT_${upper}_API_KEY_LIMIT`, fallback.apiKeyLimit),
        };
    }

    private resolvePositiveInt(key: string, fallback: number): number {
        const raw = this.configService.get<string>(key);
        if (!raw) {
            return fallback;
        }

        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return fallback;
        }

        return parsed;
    }
}
