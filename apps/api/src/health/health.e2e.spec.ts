import 'reflect-metadata';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController (e2e)', () => {
    let app: INestApplication;

    const healthServiceMock = {
        getLiveness: vi.fn(),
        getReadiness: vi.fn(),
    };

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            controllers: [HealthController],
            providers: [
                {
                    provide: HealthService,
                    useValue: healthServiceMock,
                },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api');
        await app.init();
    });

    afterEach(async () => {
        await app.close();
        vi.clearAllMocks();
    });

    it('returns liveness payload on GET /api/health', async () => {
        healthServiceMock.getLiveness.mockReturnValue({
            service: 'aquita-api',
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: 10,
        });

        const response = await request(app.getHttpServer())
            .get('/api/health')
            .expect(200);

        expect(response.body).toMatchObject({
            service: 'aquita-api',
            status: 'ok',
        });
        expect(typeof response.body.uptimeSeconds).toBe('number');
    });

    it('returns readiness payload on GET /api/health/ready', async () => {
        healthServiceMock.getReadiness.mockResolvedValue({
            service: 'aquita-api',
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: 10,
            checks: { database: 'up' },
            responseTimeMs: 2,
        });

        const response = await request(app.getHttpServer())
            .get('/api/health/ready')
            .expect(200);

        expect(response.body).toMatchObject({
            service: 'aquita-api',
            status: 'ok',
            checks: { database: 'up' },
        });
    });

    it('returns 503 when readiness check fails', async () => {
        healthServiceMock.getReadiness.mockRejectedValue(
            new ServiceUnavailableException({
                service: 'aquita-api',
                status: 'error',
                checks: { database: 'down' },
            }),
        );

        const response = await request(app.getHttpServer())
            .get('/api/health/ready')
            .expect(503);

        expect(response.body).toEqual(
            expect.objectContaining({
                service: 'aquita-api',
                status: 'error',
                checks: { database: 'down' },
            }),
        );
    });
});
