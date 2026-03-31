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
const CATEGORY_SLUG_PREFIX = 'e2e-analytics-category-';

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

        await prisma.category.deleteMany({
            where: {
                slug: {
                    startsWith: CATEGORY_SLUG_PREFIX,
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

    it('summarizes activation metrics for admin growth insights', async () => {
        const user = await createUser('USER');
        const admin = await createUser('ADMIN');
        const userToken = signToken(user.id, user.role);
        const adminToken = signToken(admin.id, admin.role);
        const category = await prisma.category.create({
            data: {
                name: `E2E Analytics Category ${makeSeed()}`,
                slug: `${CATEGORY_SLUG_PREFIX}${makeSeed()}`,
            },
        });
        const categoryId = category.id;

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .set('Authorization', `Bearer ${userToken}`)
            .send({
                eventType: 'GOOGLE_AUTH_SUCCESS',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    intent: 'login',
                    surface: 'login',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'PASSWORD_RESET_REQUEST',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    surface: 'forgot-password',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'PASSWORD_RESET_COMPLETE',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    surface: 'reset-password',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'SHARE_CLICK',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    source: 'business-details',
                    placement: 'hero_actions',
                    method: 'clipboard',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'CONTACT_CLICK',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    source: 'business-details',
                    channel: 'phone',
                    placement: 'sticky_mobile',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'WHATSAPP_CLICK',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    source: 'business-details',
                    channel: 'whatsapp',
                    placement: 'sticky_mobile',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'LISTING_VIEW_CHANGE',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    nextView: 'map',
                    previousView: 'list',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'LISTING_FILTER_APPLY',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    filterKey: 'provinceId',
                    value: 'province-demo',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'LISTING_FILTER_APPLY',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    filterKey: 'sort',
                    value: 'rating',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'LISTING_MAP_SELECT',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    selectedBusinessId: 'listing-map-demo',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'SEARCH_RESULT_CLICK',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    source: 'businesses-list',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'SEARCH_RESULT_CLICK',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    source: 'sponsored-placement',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'PREMODERATION_FLAGGED',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    reasons: [
                        'Palabras clave de spam o captacion externa en la ficha',
                        'La descripcion deriva trafico a canales externos antes de la verificacion',
                    ],
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'PREMODERATION_RELEASED',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    decision: 'APPROVE_FOR_KYC',
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'PREMODERATION_CONFIRMED',
                categoryId,
                sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                metadata: {
                    decision: 'KEEP_BLOCKED',
                },
            })
            .expect(201);

        const onboardingSessions = Array.from({ length: 5 }, () => `${SESSION_PREFIX}${makeSeed()}`);
        for (const [index, sessionId] of onboardingSessions.entries()) {
            await request(app.getHttpServer())
                .post('/api/analytics/events/growth')
                .send({
                    eventType: 'BUSINESS_ONBOARDING_STEP',
                    categoryId,
                    sessionId,
                    metadata: {
                        step: 1,
                        stepTitle: 'Informacion',
                        progressPercentage: 25,
                        source: `onboarding-seed-${index + 1}`,
                    },
                })
                .expect(201);
        }

        const completedOnboardingSession = onboardingSessions[0];
        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'BUSINESS_ONBOARDING_STEP',
                categoryId,
                sessionId: completedOnboardingSession,
                metadata: {
                    step: 2,
                    stepTitle: 'Contacto',
                    progressPercentage: 50,
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'BUSINESS_ONBOARDING_STEP',
                categoryId,
                sessionId: completedOnboardingSession,
                metadata: {
                    step: 3,
                    stepTitle: 'Ubicacion',
                    progressPercentage: 75,
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'BUSINESS_ONBOARDING_STEP',
                categoryId,
                sessionId: completedOnboardingSession,
                metadata: {
                    step: 4,
                    stepTitle: 'Categorias y servicios',
                    progressPercentage: 100,
                },
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/analytics/events/growth')
            .send({
                eventType: 'BUSINESS_ONBOARDING_COMPLETE',
                categoryId,
                sessionId: completedOnboardingSession,
                metadata: {
                    completed: true,
                    categoriesSelected: 2,
                    featuresSelected: 1,
                },
            })
            .expect(201);

        const now = new Date();
        const previousWindowDate = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - 7,
            12,
            0,
            0,
        ));
        const previousOnboardingSessions = Array.from({ length: 5 }, () => `${SESSION_PREFIX}${makeSeed()}`);
        await prisma.$transaction([
            prisma.growthEvent.create({
                data: {
                    eventType: 'PASSWORD_RESET_REQUEST',
                    categoryId,
                    sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                    occurredAt: previousWindowDate,
                },
            }),
            prisma.growthEvent.create({
                data: {
                    eventType: 'PASSWORD_RESET_REQUEST',
                    categoryId,
                    sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                    occurredAt: previousWindowDate,
                },
            }),
            prisma.growthEvent.create({
                data: {
                    eventType: 'PASSWORD_RESET_COMPLETE',
                    categoryId,
                    sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                    occurredAt: previousWindowDate,
                },
            }),
            prisma.growthEvent.create({
                data: {
                    eventType: 'LISTING_VIEW_CHANGE',
                    categoryId,
                    sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                    metadata: {
                        nextView: 'map',
                    },
                    occurredAt: previousWindowDate,
                },
            }),
            prisma.growthEvent.create({
                data: {
                    eventType: 'PREMODERATION_RELEASED',
                    categoryId,
                    sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                    metadata: {
                        decision: 'APPROVE_FOR_KYC',
                    },
                    occurredAt: previousWindowDate,
                },
            }),
            prisma.growthEvent.create({
                data: {
                    eventType: 'PREMODERATION_RELEASED',
                    categoryId,
                    sessionId: `${SESSION_PREFIX}${makeSeed()}`,
                    metadata: {
                        decision: 'APPROVE_FOR_KYC',
                    },
                    occurredAt: previousWindowDate,
                },
            }),
            ...previousOnboardingSessions.map((sessionId) => prisma.growthEvent.create({
                data: {
                    eventType: 'BUSINESS_ONBOARDING_STEP',
                    categoryId,
                    sessionId,
                    metadata: {
                        step: 1,
                        stepTitle: 'Informacion',
                        progressPercentage: 25,
                    },
                    occurredAt: previousWindowDate,
                },
            })),
            ...previousOnboardingSessions.slice(0, 3).map((sessionId) => prisma.growthEvent.create({
                data: {
                    eventType: 'BUSINESS_ONBOARDING_COMPLETE',
                    categoryId,
                    sessionId,
                    metadata: {
                        completed: true,
                    },
                    occurredAt: previousWindowDate,
                },
            })),
        ]);
        const currentRangeStart = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - 6,
            0,
            0,
            0,
        ));
        expect(previousWindowDate.getTime()).toBeLessThan(currentRangeStart.getTime());
        const currentPasswordResetRequests = await prisma.growthEvent.count({
            where: {
                categoryId,
                eventType: 'PASSWORD_RESET_REQUEST',
                occurredAt: {
                    gte: currentRangeStart,
                },
            },
        });
        expect(currentPasswordResetRequests).toBe(1);

        const response = await request(app.getHttpServer())
            .get(`/api/analytics/growth/insights?days=7&categoryId=${categoryId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body.range).toMatchObject({
            days: 7,
        });
        expect(response.body.activationMetrics).toMatchObject({
            shareClicks: 1,
            passwordResetRequests: 1,
            passwordResetCompletions: 1,
            googleAuthSuccesses: 1,
            googleAuthLoginSuccesses: 1,
            googleAuthRegistrationSuccesses: 0,
            stickyPhoneClicks: 1,
            stickyWhatsAppClicks: 1,
            totalWhatsAppClicks: 1,
        });
        expect(response.body.discoveryMetrics).toMatchObject({
            listingFilterApplies: 1,
            listingSortChanges: 1,
            mapViewChanges: 1,
            listViewChanges: 0,
            mapSelections: 1,
            listingResultClicks: 1,
            sponsoredResultClicks: 1,
        });
        expect(response.body.moderationMetrics).toMatchObject({
            premoderationFlagged: 1,
            uniqueFlaggedBusinesses: 0,
            premoderationReleased: 1,
            premoderationConfirmed: 1,
            releaseRatePct: 50,
        });
        expect(response.body.onboardingMetrics).toMatchObject({
            step1Sessions: 5,
            step2Sessions: 1,
            step3Sessions: 1,
            step4Sessions: 1,
            completedSessions: 1,
            completionRatePct: 20,
        });
        expect(response.body.moderationMetrics.topReasons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    reason: 'Palabras clave de spam o captacion externa en la ficha',
                    count: 1,
                }),
            ]),
        );
        expect(response.body.actionableAlerts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    metricKey: 'business_onboarding_completion_rate',
                    level: 'HIGH',
                    owner: 'Producto',
                    cadence: 'Semanal',
                    slaHours: 48,
                    playbookSection: 'Onboarding de negocios',
                }),
            ]),
        );
        expect(response.body.trendComparisons).toMatchObject({
            comparisonLabel: 'vs 7d previos',
            activation: {
                recoveryCompletionRatePct: {
                    current: 100,
                    previous: 50,
                    delta: 50,
                    direction: 'up',
                },
            },
            discovery: {
                mapSelectionRatePct: {
                    current: 100,
                    previous: 0,
                    delta: 100,
                    direction: 'up',
                },
            },
            moderation: {
                releaseRatePct: {
                    current: 50,
                    previous: 100,
                    delta: -50,
                    direction: 'down',
                },
            },
            onboarding: {
                completionRatePct: {
                    current: 20,
                    previous: 60,
                    delta: -40,
                    direction: 'down',
                },
            },
        });
    });
});
