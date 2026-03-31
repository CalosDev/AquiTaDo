import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityService } from '../observability/observability.service';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
    function createService(
        prisma: PrismaService,
        options?: {
            observability?: Partial<ObservabilityService>;
            config?: Partial<ConfigService>;
        },
        redisOverrides?: Partial<RedisService>,
        searchOverrides?: Partial<SearchService>,
    ): HealthService {
        const observability = {
            getDependencyHealthSnapshot: vi.fn().mockReturnValue([]),
            ...options?.observability,
        } as unknown as ObservabilityService;
        const configService = {
            get: vi.fn(),
            ...options?.config,
        } as unknown as ConfigService;
        const redisService = {
            ping: vi.fn().mockResolvedValue(null),
            ...redisOverrides,
        } as unknown as RedisService;
        const searchService = {
            ping: vi.fn().mockResolvedValue(null),
            ...searchOverrides,
        } as unknown as SearchService;

        return new HealthService(
            prisma,
            observability,
            configService,
            redisService,
            searchService,
        );
    }

    it('returns liveness payload', () => {
        const prisma = {} as PrismaService;
        const service = createService(prisma);

        const result = service.getLiveness();
        expect(result.status).toBe('ok');
        expect(result.service).toBe('aquita-api');
        expect(typeof result.uptimeSeconds).toBe('number');
        expect(typeof result.timestamp).toBe('string');
    });

    it('returns readiness payload when database is available', async () => {
        const queryRaw = vi.fn().mockResolvedValue([
            {
                ping: 1,
                businesses: 'businesses',
                categories: 'categories',
            },
        ]);
        const prisma = {
            $queryRaw: queryRaw,
        } as unknown as PrismaService;
        const service = createService(prisma);

        const result = await service.getReadiness();

        expect(queryRaw).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('ok');
        expect(result.checks).toEqual({
            database: 'up',
            schema: 'up',
            redis: 'disabled',
            search: 'disabled',
        });
    });

    it('throws ServiceUnavailableException when database is unavailable', async () => {
        const queryRaw = vi.fn().mockRejectedValue(new Error('db down'));
        const prisma = {
            $queryRaw: queryRaw,
        } as unknown as PrismaService;
        const service = createService(prisma);

        await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException when schema is unavailable', async () => {
        const queryRaw = vi.fn().mockResolvedValue([
            {
                ping: 1,
                businesses: null,
                categories: null,
            },
        ]);
        const prisma = {
            $queryRaw: queryRaw,
        } as unknown as PrismaService;
        const service = createService(prisma);

        await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('returns readiness payload when redis is configured but unavailable', async () => {
        const queryRaw = vi.fn().mockResolvedValue([
            {
                ping: 1,
                businesses: 'businesses',
                categories: 'categories',
            },
        ]);
        const prisma = {
            $queryRaw: queryRaw,
        } as unknown as PrismaService;
        const service = createService(
            prisma,
            undefined,
            { ping: vi.fn().mockResolvedValue(false) },
            { ping: vi.fn().mockResolvedValue(null) },
        );

        const result = await service.getReadiness();
        expect(result.status).toBe('ok');
        expect(result.checks).toEqual({
            database: 'up',
            schema: 'up',
            redis: 'down',
            search: 'disabled',
        });
    });

    it('includes email health and password reset stats in operational dashboard', async () => {
        const queryRaw = vi.fn().mockResolvedValue([
            {
                ping: 1,
                businesses: 'businesses',
                categories: 'categories',
                active_connections: 8,
                max_connections: 100,
            },
        ]);
        const passwordResetToken = {
            count: vi.fn()
                .mockResolvedValueOnce(12)
                .mockResolvedValueOnce(7)
                .mockResolvedValueOnce(3)
                .mockResolvedValueOnce(2),
        };
        const prisma = {
            $queryRaw: queryRaw,
            passwordResetToken,
        } as unknown as PrismaService;
        const getDependencyHealthSnapshot = vi.fn().mockReturnValue([
            {
                dependency: 'email',
                operation: 'password_reset_link',
                samples: 6,
                p50Ms: 240,
                p95Ms: 480,
                errorRatePct: 0,
                lastSeenAt: new Date().toISOString(),
                latencyThresholdMs: 4000,
                healthy: true,
            },
        ]);
        const configGet = vi.fn((key: string) => {
            if (key === 'RESEND_API_KEY') {
                return 'resend-key';
            }
            if (key === 'RESEND_FROM_EMAIL') {
                return 'noreply@aquita.do';
            }
            return undefined;
        });

        const service = createService(
            prisma,
            {
                observability: {
                    getDependencyHealthSnapshot,
                },
                config: {
                    get: configGet,
                },
            },
        );

        const result = await service.getOperationalDashboard();

        expect(result.status).toBe('degraded');
        expect(result.checks?.email?.status).toBe('up');
        expect(result.passwordReset).toMatchObject({
            providerConfigured: true,
            requestsLast24h: 12,
            completionsLast24h: 7,
            completionRatePct: 58.33,
            activeTokens: 3,
            expiredPendingTokens: 2,
        });
        expect(getDependencyHealthSnapshot).toHaveBeenCalledWith({
            ai: 2500,
            email: 4000,
            whatsapp: 3000,
        });
    });
});
