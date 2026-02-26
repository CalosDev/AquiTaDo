import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
    it('returns liveness payload', () => {
        const prisma = {} as PrismaService;
        const service = new HealthService(prisma);

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
        const service = new HealthService(prisma);

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
        const service = new HealthService(prisma);

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
        const service = new HealthService(prisma);

        await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});
