import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityService } from '../observability/observability.service';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
    function createService(prisma: PrismaService): HealthService {
        const observability = {
            getDependencyHealthSnapshot: vi.fn().mockReturnValue([]),
        } as unknown as ObservabilityService;
        const configService = {
            get: vi.fn(),
        } as unknown as ConfigService;

        return new HealthService(prisma, observability, configService);
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
        expect(result.checks).toEqual({ database: 'up', schema: 'up' });
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
});
