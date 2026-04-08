import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_ACCESS_EMAIL_DOMAIN = '@e2e-role-access.aquita.local';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('Role access matrix (e2e)', () => {
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
                    endsWith: ROLE_ACCESS_EMAIL_DOMAIN,
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

    async function createUser(role: 'USER' | 'BUSINESS_OWNER' | 'ADMIN') {
        const seed = makeSeed();
        return prisma.user.create({
            data: {
                name: `E2E Role ${role} ${seed}`,
                email: `${role.toLowerCase()}-${seed}${ROLE_ACCESS_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role,
            },
        });
    }

    function signToken(userId: string, role: string) {
        return jwtService.sign({ sub: userId, role });
    }

    it('blocks USER from business-owner and admin endpoints', async () => {
        const user = await createUser('USER');
        const token = signToken(user.id, user.role);

        await request(app.getHttpServer())
            .get('/api/organizations/mine')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);

        await request(app.getHttpServer())
            .post('/api/organizations')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Org prohibida para USER' })
            .expect(403);

        await request(app.getHttpServer())
            .get('/api/observability/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);
    });

    it('allows BUSINESS_OWNER on owner endpoints and blocks admin observability', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const token = signToken(owner.id, owner.role);

        const organizations = await request(app.getHttpServer())
            .get('/api/organizations/mine')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(Array.isArray(organizations.body)).toBe(true);

        await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);

        await request(app.getHttpServer())
            .get('/api/health/dashboard')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);
    });

    it('allows ADMIN on admin endpoints and blocks tenant-owner flows', async () => {
        const admin = await createUser('ADMIN');
        const token = signToken(admin.id, admin.role);

        const summary = await request(app.getHttpServer())
            .get('/api/observability/summary')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(summary.body).toEqual(
            expect.objectContaining({
                totalRouteViews: expect.any(Number),
                totalClientErrors: expect.any(Number),
                totalPoorVitals: expect.any(Number),
                warnAlerts: expect.any(Number),
                criticalAlerts: expect.any(Number),
            }),
        );

        await request(app.getHttpServer())
            .get('/api/organizations/mine')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);

        await request(app.getHttpServer())
            .post('/api/organizations')
            .set('Authorization', `Bearer ${token}`)
            .send({ name: 'Org prohibida para ADMIN' })
            .expect(403);
    });
});
