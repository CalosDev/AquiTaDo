import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const REVIEWS_EMAIL_DOMAIN = '@e2e-reviews.aquita.local';
const REVIEW_BUSINESS_SLUG_PREFIX = 'e2e-review-business-';
const REVIEW_PROVINCE_SLUG_PREFIX = 'e2e-review-province-';
const REVIEW_ORG_SLUG_PREFIX = 'e2e-org-';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('ReviewsController (e2e)', () => {
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

    beforeEach(async () => {
        await prisma.review.deleteMany({
            where: {
                business: {
                    slug: {
                        startsWith: REVIEW_BUSINESS_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.business.deleteMany({
            where: {
                slug: {
                    startsWith: REVIEW_BUSINESS_SLUG_PREFIX,
                },
            },
        });

        await prisma.organizationMember.deleteMany({
            where: {
                organization: {
                    slug: {
                        startsWith: REVIEW_ORG_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.organization.deleteMany({
            where: {
                slug: {
                    startsWith: REVIEW_ORG_SLUG_PREFIX,
                },
            },
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: REVIEWS_EMAIL_DOMAIN,
                },
            },
        });

        await prisma.province.deleteMany({
            where: {
                slug: {
                    startsWith: REVIEW_PROVINCE_SLUG_PREFIX,
                },
            },
        });
    });

    afterAll(async () => {
        await prisma.review.deleteMany({
            where: {
                business: {
                    slug: {
                        startsWith: REVIEW_BUSINESS_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.business.deleteMany({
            where: {
                slug: {
                    startsWith: REVIEW_BUSINESS_SLUG_PREFIX,
                },
            },
        });

        await prisma.organizationMember.deleteMany({
            where: {
                organization: {
                    slug: {
                        startsWith: REVIEW_ORG_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.organization.deleteMany({
            where: {
                slug: {
                    startsWith: REVIEW_ORG_SLUG_PREFIX,
                },
            },
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: REVIEWS_EMAIL_DOMAIN,
                },
            },
        });

        await prisma.province.deleteMany({
            where: {
                slug: {
                    startsWith: REVIEW_PROVINCE_SLUG_PREFIX,
                },
            },
        });
        await app.close();
    });

    async function createUser(role: 'USER' | 'BUSINESS_OWNER' | 'ADMIN' = 'USER') {
        const seed = makeSeed();
        return prisma.user.create({
            data: {
                name: `E2E Reviewer ${seed}`,
                email: `user-${seed}${REVIEWS_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role,
            },
        });
    }

    async function createProvince() {
        const seed = makeSeed();
        return prisma.province.create({
            data: {
                name: `E2E Review Province ${seed}`,
                slug: `${REVIEW_PROVINCE_SLUG_PREFIX}${seed}`,
            },
        });
    }

    async function createBusiness(ownerId: string) {
        const seed = makeSeed();
        const province = await createProvince();
        const organization = await prisma.organization.create({
            data: {
                name: `E2E Organization ${seed}`,
                slug: `e2e-org-${seed}`,
                ownerUserId: ownerId,
            },
        });

        await prisma.organizationMember.create({
            data: {
                organizationId: organization.id,
                userId: ownerId,
                role: 'OWNER',
            },
        });

        return prisma.business.create({
            data: {
                name: `E2E Review Business ${seed}`,
                slug: `${REVIEW_BUSINESS_SLUG_PREFIX}${seed}`,
                description: 'Negocio para pruebas e2e de reseñas',
                address: 'Avenida de prueba 45',
                ownerId,
                organizationId: organization.id,
                provinceId: province.id,
                verified: true,
            },
        });
    }

    function signToken(userId: string, role: string) {
        return jwtService.sign({ sub: userId, role });
    }

    it('rejects unauthenticated review creation', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/reviews')
            .send({
                rating: 5,
                comment: 'Excelente servicio',
                businessId: '00000000-0000-0000-0000-000000000000',
            })
            .expect(401);

        expect(response.body).toMatchObject({
            statusCode: 401,
            message: 'Unauthorized',
        });
    });

    it('creates a review for an authenticated user', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const reviewer = await createUser('USER');
        const token = signToken(reviewer.id, reviewer.role);
        const business = await createBusiness(owner.id);

        const response = await request(app.getHttpServer())
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({
                rating: 5,
                comment: 'Excelente servicio',
                businessId: business.id,
            })
            .expect(201);

        expect(response.body).toMatchObject({
            rating: 5,
            comment: 'Excelente servicio',
            businessId: business.id,
            userId: reviewer.id,
            user: {
                id: reviewer.id,
                name: reviewer.name,
            },
        });
    });

    it('rejects duplicate reviews from the same user for the same business', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const reviewer = await createUser('USER');
        const token = signToken(reviewer.id, reviewer.role);
        const business = await createBusiness(owner.id);

        await request(app.getHttpServer())
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({
                rating: 4,
                comment: 'Muy buen lugar',
                businessId: business.id,
            })
            .expect(201);

        const response = await request(app.getHttpServer())
            .post('/api/reviews')
            .set('Authorization', `Bearer ${token}`)
            .send({
                rating: 5,
                comment: 'Segunda reseña duplicada',
                businessId: business.id,
            })
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
        expect(String(response.body.message).toLowerCase()).toContain('rese');
    });

    it('lists reviews by business id', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const reviewerA = await createUser('USER');
        const reviewerB = await createUser('USER');
        const tokenA = signToken(reviewerA.id, reviewerA.role);
        const tokenB = signToken(reviewerB.id, reviewerB.role);
        const business = await createBusiness(owner.id);

        await request(app.getHttpServer())
            .post('/api/reviews')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({
                rating: 5,
                comment: 'Excelente',
                businessId: business.id,
            })
            .expect(201);

        await request(app.getHttpServer())
            .post('/api/reviews')
            .set('Authorization', `Bearer ${tokenB}`)
            .send({
                rating: 3,
                comment: 'Aceptable',
                businessId: business.id,
            })
            .expect(201);

        const response = await request(app.getHttpServer())
            .get(`/api/reviews/business/${business.id}`)
            .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(2);
        for (const review of response.body as Array<Record<string, unknown>>) {
            expect(review.businessId).toBe(business.id);
            expect(review.user).toEqual(
                expect.objectContaining({
                    id: expect.any(String),
                    name: expect.any(String),
                }),
            );
        }
    });
});
