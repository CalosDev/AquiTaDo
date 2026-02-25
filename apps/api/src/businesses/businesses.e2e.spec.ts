import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const BUSINESSES_EMAIL_DOMAIN = '@e2e-businesses.aquita.local';
const BUSINESS_SLUG_PREFIX = 'e2e-business-';
const PROVINCE_SLUG_PREFIX = 'e2e-business-province-';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('BusinessesController (e2e)', () => {
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
                        startsWith: BUSINESS_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.business.deleteMany({
            where: {
                slug: {
                    startsWith: BUSINESS_SLUG_PREFIX,
                },
            },
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: BUSINESSES_EMAIL_DOMAIN,
                },
            },
        });

        await prisma.province.deleteMany({
            where: {
                slug: {
                    startsWith: PROVINCE_SLUG_PREFIX,
                },
            },
        });
    });

    afterAll(async () => {
        await prisma.review.deleteMany({
            where: {
                business: {
                    slug: {
                        startsWith: BUSINESS_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.business.deleteMany({
            where: {
                slug: {
                    startsWith: BUSINESS_SLUG_PREFIX,
                },
            },
        });

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: BUSINESSES_EMAIL_DOMAIN,
                },
            },
        });

        await prisma.province.deleteMany({
            where: {
                slug: {
                    startsWith: PROVINCE_SLUG_PREFIX,
                },
            },
        });
        await app.close();
    });

    async function createUser(role: 'USER' | 'BUSINESS_OWNER' | 'ADMIN' = 'USER') {
        const seed = makeSeed();
        return prisma.user.create({
            data: {
                name: `E2E User ${seed}`,
                email: `user-${seed}${BUSINESSES_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role,
            },
        });
    }

    async function createProvince() {
        const seed = makeSeed();
        return prisma.province.create({
            data: {
                name: `E2E Province ${seed}`,
                slug: `${PROVINCE_SLUG_PREFIX}${seed}`,
            },
        });
    }

    function signToken(userId: string, role: string) {
        return jwtService.sign({ sub: userId, role });
    }

    function makeCreateBusinessPayload(seed: string, provinceId: string) {
        return {
            name: `E2E Business ${seed}`,
            description: 'Negocio de prueba para e2e',
            address: 'Calle de pruebas 123',
            provinceId,
            latitude: 18.4861,
            longitude: -69.9312,
        };
    }

    it('rejects unauthenticated business creation', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/businesses')
            .send({
                name: 'E2E Business unauth',
                description: 'Negocio de prueba para e2e',
                address: 'Calle de pruebas 123',
                provinceId: '00000000-0000-0000-0000-000000000000',
            })
            .expect(401);

        expect(response.body).toMatchObject({
            statusCode: 401,
            message: 'Unauthorized',
        });
    });

    it('creates a business and promotes owner role from USER to BUSINESS_OWNER', async () => {
        const owner = await createUser('USER');
        const ownerToken = signToken(owner.id, owner.role);
        const province = await createProvince();
        const seed = makeSeed();

        const response = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(201);

        expect(response.body).toMatchObject({
            name: `E2E Business ${seed}`,
            verified: false,
            owner: {
                id: owner.id,
            },
        });
        expect(String(response.body.slug)).toContain(BUSINESS_SLUG_PREFIX);

        const updatedOwner = await prisma.user.findUnique({ where: { id: owner.id } });
        expect(updatedOwner?.role).toBe('BUSINESS_OWNER');
    });

    it('hides unverified business from public and allows owner access', async () => {
        const owner = await createUser('USER');
        const ownerToken = signToken(owner.id, owner.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(201);

        const businessId = String(created.body.id);

        await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .expect(404);

        const ownerView = await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .expect(200);

        expect(ownerView.body).toMatchObject({
            id: businessId,
            verified: false,
            ownerId: owner.id,
        });
    });

    it('rejects update attempts from non-owner non-admin users', async () => {
        const owner = await createUser('USER');
        const outsider = await createUser('USER');
        const ownerToken = signToken(owner.id, owner.role);
        const outsiderToken = signToken(outsider.id, outsider.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(201);

        const response = await request(app.getHttpServer())
            .put(`/api/businesses/${created.body.id}`)
            .set('Authorization', `Bearer ${outsiderToken}`)
            .send({ name: 'Intento no autorizado' })
            .expect(403);

        expect(response.body).toMatchObject({
            statusCode: 403,
            error: 'Forbidden',
        });
    });

    it('allows admins to verify businesses and then exposes them publicly', async () => {
        const owner = await createUser('USER');
        const admin = await createUser('ADMIN');
        const ownerToken = signToken(owner.id, owner.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(201);

        const businessId = String(created.body.id);

        const verified = await request(app.getHttpServer())
            .put(`/api/businesses/${businessId}/verify`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(verified.body).toMatchObject({
            id: businessId,
            verified: true,
        });

        const publicView = await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .expect(200);

        expect(publicView.body).toMatchObject({
            id: businessId,
            verified: true,
        });
    });
});
