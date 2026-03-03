import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const ANALYTICS_EMAIL_DOMAIN = '@e2e-analytics.aquita.local';
const SESSION_PREFIX = 'e2e-analytics-session-';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('Analytics anti-spoof (e2e)', () => {
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
        await prisma.growthEvent.deleteMany({
            where: {
                OR: [
                    { sessionId: { startsWith: SESSION_PREFIX } },
                    {
                        user: {
                            email: {
                                endsWith: ANALYTICS_EMAIL_DOMAIN,
                            },
                        },
                    },
                ],
            },
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: ANALYTICS_EMAIL_DOMAIN,
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
                name: `E2E Analytics ${seed}`,
                email: `user-${seed}${ANALYTICS_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role,
            },
        });
    }

    function signToken(userId: string, role: string): string {
        return jwtService.sign({ sub: userId, role });
    }

    it('ignores client-provided userId and uses JWT userId', async () => {
        const user = await createUser('USER');
        const token = signToken(user.id, user.role);
        const sessionId = `${SESSION_PREFIX}${makeSeed()}`;
        const spoofedUserId = '00000000-0000-0000-0000-000000000000';

        const response = await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .set('Authorization', `Bearer ${token}`)
            .send({
                eventType: 'SEARCH_QUERY',
                searchQuery: 'pizza',
                sessionId,
                userId: spoofedUserId,
            })
            .expect(201);

        expect(response.body).toMatchObject({
            received: true,
            eventType: 'SEARCH_QUERY',
        });

        const eventId = String(response.body.id);
        const growthEvent = await prisma.growthEvent.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                userId: true,
                sessionId: true,
            },
        });

        expect(growthEvent).toMatchObject({
            id: eventId,
            userId: user.id,
            sessionId,
        });
        expect(growthEvent?.userId).not.toBe(spoofedUserId);
    });

    it('persists authenticated userId from JWT only', async () => {
        const user = await createUser('USER');
        const token = signToken(user.id, user.role);
        const sessionId = `${SESSION_PREFIX}${makeSeed()}`;

        const response = await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .set('Authorization', `Bearer ${token}`)
            .send({
                eventType: 'SEARCH_QUERY',
                searchQuery: 'colmado',
                sessionId,
            })
            .expect(201);

        expect(response.body).toMatchObject({
            received: true,
            eventType: 'SEARCH_QUERY',
        });

        const eventId = String(response.body.id);
        const growthEvent = await prisma.growthEvent.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                userId: true,
                sessionId: true,
            },
        });

        expect(growthEvent).toMatchObject({
            id: eventId,
            userId: user.id,
            sessionId,
        });
    });

    it('stores anonymous growth events with null userId', async () => {
        const sessionId = `${SESSION_PREFIX}${makeSeed()}`;

        const response = await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'SEARCH_QUERY',
                searchQuery: 'pica pollo',
                sessionId,
            })
            .expect(201);

        const eventId = String(response.body.id);
        const growthEvent = await prisma.growthEvent.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                userId: true,
                sessionId: true,
            },
        });

        expect(growthEvent).toMatchObject({
            id: eventId,
            userId: null,
            sessionId,
        });
    });
});
