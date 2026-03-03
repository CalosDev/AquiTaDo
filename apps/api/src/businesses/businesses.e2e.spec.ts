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

    async function cleanBusinessFixtures() {
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

        await prisma.organizationMember.deleteMany({
            where: {
                organization: {
                    ownerUser: {
                        email: {
                            endsWith: BUSINESSES_EMAIL_DOMAIN,
                        },
                    },
                },
            },
        });

        await prisma.organizationInvite.deleteMany({
            where: {
                organization: {
                    ownerUser: {
                        email: {
                            endsWith: BUSINESSES_EMAIL_DOMAIN,
                        },
                    },
                },
            },
        });

        await prisma.organization.deleteMany({
            where: {
                ownerUser: {
                    email: {
                        endsWith: BUSINESSES_EMAIL_DOMAIN,
                    },
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
    }

    beforeEach(async () => {
        await cleanBusinessFixtures();
    });

    afterAll(async () => {
        await cleanBusinessFixtures();
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

    it('rejects malformed organization context headers', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const ownerToken = signToken(owner.id, owner.role);

        const response = await request(app.getHttpServer())
            .get('/api/businesses/my')
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', 'invalid-uuid')
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('rejects business creation for USER role', async () => {
        const regularUser = await createUser('USER');
        const regularUserToken = signToken(regularUser.id, regularUser.role);
        const province = await createProvince();
        const seed = makeSeed();

        const response = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${regularUserToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(403);

        expect(response.body).toMatchObject({
            statusCode: 403,
            error: 'Forbidden',
        });
    });

    it('creates a business for BUSINESS_OWNER role', async () => {
        const owner = await createUser('BUSINESS_OWNER');
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
    });

    it('hides unverified business from public and allows owner access', async () => {
        const owner = await createUser('BUSINESS_OWNER');
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
        const owner = await createUser('BUSINESS_OWNER');
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
            .set('x-organization-id', created.body.organization.id)
            .send({ name: 'Intento no autorizado' })
            .expect(403);

        expect(response.body).toMatchObject({
            statusCode: 403,
            error: 'Forbidden',
        });
    });

    it('soft-deletes a business and hides it from public results', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const ownerToken = signToken(owner.id, owner.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(201);

        const businessId = String(created.body.id);
        const organizationId = String(created.body.organization.id);

        const deleted = await request(app.getHttpServer())
            .delete(`/api/businesses/${businessId}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                reason: 'Negocio cerrado definitivamente por decision operativa.',
            })
            .expect(200);

        expect(deleted.body).toMatchObject({
            message: 'Negocio eliminado exitosamente',
        });

        await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .expect(404);
    });

    it('requires deletion reason when deleting a business', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const ownerToken = signToken(owner.id, owner.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(seed, province.id))
            .expect(201);

        const businessId = String(created.body.id);
        const organizationId = String(created.body.organization.id);

        const response = await request(app.getHttpServer())
            .delete(`/api/businesses/${businessId}`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                reason: 'corta',
            })
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('allows admins to soft-delete businesses without organization context', async () => {
        const owner = await createUser('BUSINESS_OWNER');
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

        const deleted = await request(app.getHttpServer())
            .delete(`/api/businesses/${businessId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                reason: 'Incumplimiento de politicas de la plataforma.',
            })
            .expect(200);

        expect(deleted.body).toMatchObject({
            message: 'Negocio eliminado exitosamente',
        });

        await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .expect(404);
    });

    it('allows admins to verify businesses and then exposes them publicly', async () => {
        const owner = await createUser('BUSINESS_OWNER');
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

        const publicViewBySlug = await request(app.getHttpServer())
            .get(`/api/businesses/${created.body.slug}`)
            .expect(200);

        expect(publicViewBySlug.body).toMatchObject({
            id: businessId,
            slug: created.body.slug,
            verified: true,
        });
    });

    it('creates a public lead for verified businesses and blocks rapid duplicates', async () => {
        const owner = await createUser('BUSINESS_OWNER');
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

        await request(app.getHttpServer())
            .put(`/api/businesses/${businessId}/verify`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        const leadPayload = {
            contactName: 'Cliente Publico',
            contactPhone: '+1 (809) 555-0000',
            contactEmail: 'cliente-publico@example.com',
            message: 'Necesito una cotizacion para hoy',
            preferredChannel: 'WHATSAPP',
        };

        const createdLead = await request(app.getHttpServer())
            .post(`/api/businesses/${businessId}/public-lead`)
            .send(leadPayload)
            .expect(201);

        expect(createdLead.body).toMatchObject({
            status: 'LEAD',
            message: 'Solicitud enviada. El negocio te contactara pronto.',
        });
        expect(typeof createdLead.body.id).toBe('string');

        const duplicatedLead = await request(app.getHttpServer())
            .post(`/api/businesses/${businessId}/public-lead`)
            .send({
                ...leadPayload,
                message: 'Segundo intento inmediato',
            })
            .expect(400);

        expect(duplicatedLead.body).toMatchObject({
            statusCode: 400,
            message: 'Ya existe una solicitud reciente con este telefono. Intenta nuevamente en unos minutos.',
        });
    });
});
