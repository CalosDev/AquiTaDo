import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { FrontendSignalKind } from './dto/frontend-observability.dto';

const OBSERVABILITY_EMAIL_DOMAIN = '@e2e-observability.aquita.local';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('ObservabilityController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwtService: JwtService;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api');
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        await app.init();

        prisma = app.get(PrismaService);
        jwtService = app.get(JwtService);
    });

    async function cleanupFixtures() {
        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: OBSERVABILITY_EMAIL_DOMAIN,
                },
            },
        });
    }

    beforeEach(async () => {
        await cleanupFixtures();
    });

    afterAll(async () => {
        await cleanupFixtures();
        await app.close();
    });

    async function createUser(role: 'USER' | 'BUSINESS_OWNER' | 'ADMIN' = 'USER') {
        const seed = makeSeed();
        return prisma.user.create({
            data: {
                name: `E2E Observability ${seed}`,
                email: `user-${seed}${OBSERVABILITY_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role,
            },
        });
    }

    function signToken(userId: string, role: string): string {
        return jwtService.sign({ sub: userId, role });
    }

    it('rejects unauthenticated metrics access', async () => {
        await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .expect(401);
    });

    it('rejects authenticated non-admin metrics access', async () => {
        const user = await createUser('USER');
        const token = signToken(user.id, user.role);

        await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);
    });

    it('allows admin metrics access', async () => {
        const admin = await createUser('ADMIN');
        const token = signToken(admin.id, admin.role);

        const response = await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(response.text).toContain('# HELP');
        expect(response.text).toContain('aquita_');
    });

    it('returns a frontend health summary to admins', async () => {
        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.ROUTE_VIEW,
                route: '/admin',
                role: 'ADMIN',
            })
            .expect(202);

        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.CLIENT_ERROR,
                route: '/dashboard/businesses/456/edit',
                source: 'window.error',
                role: 'BUSINESS_OWNER',
            })
            .expect(202);

        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.WEB_VITAL,
                route: '/dashboard/businesses/456/edit',
                metricName: 'CLS',
                value: 0.19,
                rating: 'needs-improvement',
                role: 'BUSINESS_OWNER',
            })
            .expect(202);

        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.WEB_VITAL,
                route: '/admin',
                metricName: 'LCP',
                value: 4.8,
                rating: 'poor',
                role: 'ADMIN',
            })
            .expect(202);

        const admin = await createUser('ADMIN');
        const token = signToken(admin.id, admin.role);

        const response = await request(app.getHttpServer())
            .get('/api/observability/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(response.body.totalRouteViews).toBeGreaterThan(0);
        expect(response.body.totalClientErrors).toBeGreaterThan(0);
        expect(response.body.totalPoorVitals).toBeGreaterThan(0);
        expect(response.body.warnAlerts).toBeGreaterThan(0);
        expect(response.body.criticalAlerts).toBeGreaterThan(0);
        expect(response.body.busiestRoutes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    route: '/admin',
                    role: 'ADMIN',
                }),
            ]),
        );
        expect(response.body.clientErrors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    route: '/dashboard/businesses/:id/edit',
                    role: 'BUSINESS_OWNER',
                    source: 'window_error',
                }),
            ]),
        );
        expect(response.body.poorVitals).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    route: '/dashboard/businesses/:id/edit',
                    role: 'BUSINESS_OWNER',
                    metric: 'CLS',
                    rating: 'needs-improvement',
                }),
            ]),
        );
        expect(response.body.alerts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    kind: 'client-error',
                    route: '/dashboard/businesses/:id/edit',
                }),
                expect.objectContaining({
                    kind: 'web-vital',
                    route: '/dashboard/businesses/:id/edit',
                }),
            ]),
        );
    });

    it('accepts frontend observability signals without authentication and exposes metrics to admin', async () => {
        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.ROUTE_VIEW,
                route: '/businesses/supermercado-bravo',
                role: 'ANONYMOUS',
            })
            .expect(202);

        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.WEB_VITAL,
                route: '/profile',
                metricName: 'CLS',
                value: 0.04,
                rating: 'good',
                role: 'ADMIN',
            })
            .expect(202);

        await request(app.getHttpServer())
            .post('/api/observability/frontend')
            .send({
                kind: FrontendSignalKind.CLIENT_ERROR,
                route: '/dashboard/businesses/123/edit',
                source: 'window.error',
                role: 'BUSINESS_OWNER',
            })
            .expect(202);

        const admin = await createUser('ADMIN');
        const token = signToken(admin.id, admin.role);

        const response = await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(response.text).toContain('aquita_frontend_route_views_total');
        expect(response.text).toContain('aquita_frontend_client_errors_total');
        expect(response.text).toContain('aquita_frontend_web_vital_value');
        expect(response.text).toContain('/businesses/:slug');
        expect(response.text).toContain('/dashboard/businesses/:id/edit');
    });
});
