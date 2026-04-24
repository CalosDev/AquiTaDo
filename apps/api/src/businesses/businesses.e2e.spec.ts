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
        await prisma.businessSuggestion.deleteMany({
            where: {
                OR: [
                    {
                        submittedByUser: {
                            email: {
                                endsWith: BUSINESSES_EMAIL_DOMAIN,
                            },
                        },
                    },
                    {
                        reviewedByAdmin: {
                            email: {
                                endsWith: BUSINESSES_EMAIL_DOMAIN,
                            },
                        },
                    },
                    {
                        province: {
                            slug: {
                                startsWith: PROVINCE_SLUG_PREFIX,
                            },
                        },
                    },
                ],
            },
        });

        await prisma.growthEvent.deleteMany({
            where: {
                OR: [
                    {
                        business: {
                            slug: {
                                startsWith: BUSINESS_SLUG_PREFIX,
                            },
                        },
                    },
                    {
                        user: {
                            email: {
                                endsWith: BUSINESSES_EMAIL_DOMAIN,
                            },
                        },
                    },
                ],
            },
        });

        await prisma.review.deleteMany({
            where: {
                business: {
                    slug: {
                        startsWith: BUSINESS_SLUG_PREFIX,
                    },
                },
            },
        });

        await prisma.businessDuplicateCase.deleteMany({
            where: {
                OR: [
                    {
                        resolvedByAdmin: {
                            email: {
                                endsWith: BUSINESSES_EMAIL_DOMAIN,
                            },
                        },
                    },
                    {
                        primaryBusiness: {
                            province: {
                                slug: {
                                    startsWith: PROVINCE_SLUG_PREFIX,
                                },
                            },
                        },
                    },
                ],
            },
        });

        await prisma.business.deleteMany({
            where: {
                OR: [
                    {
                        slug: {
                            startsWith: BUSINESS_SLUG_PREFIX,
                        },
                    },
                    {
                        province: {
                            slug: {
                                startsWith: PROVINCE_SLUG_PREFIX,
                            },
                        },
                    },
                ],
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

    it('shows published unverified business publicly and still allows owner access', async () => {
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

        const publicView = await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .expect(200);

        expect(publicView.body).toMatchObject({
            id: businessId,
            verified: false,
        });

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
                reason: 'Incumplimiento de políticas de la plataforma.',
            })
            .expect(200);

        expect(deleted.body).toMatchObject({
            message: 'Negocio eliminado exitosamente',
        });

        await request(app.getHttpServer())
            .get(`/api/businesses/${businessId}`)
            .expect(404);
    });

    it('allows admins to revoke the active ownership of a business', async () => {
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
        const activeOwnership = await prisma.businessOwnership.findFirst({
            where: {
                businessId,
                isActive: true,
            },
            select: {
                id: true,
            },
        });

        expect(activeOwnership).not.toBeNull();

        const revoked = await request(app.getHttpServer())
            .post(`/api/businesses/admin/${businessId}/ownerships/${activeOwnership!.id}/revoke`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                reason: 'Revocacion administrativa por inconsistencias detectadas.',
            })
            .expect(201);

        expect(revoked.body).toMatchObject({
            businessId,
            ownershipId: activeOwnership!.id,
            message: 'Ownership revocado correctamente',
        });

        const revokedOwnership = await prisma.businessOwnership.findUnique({
            where: { id: activeOwnership!.id },
            select: {
                isActive: true,
                revokedByUserId: true,
                revokeReason: true,
            },
        });
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            select: {
                ownerId: true,
                organizationId: true,
                primaryManagingOrganizationId: true,
                claimStatus: true,
                isClaimable: true,
            },
        });

        expect(revokedOwnership).toMatchObject({
            isActive: false,
            revokedByUserId: admin.id,
            revokeReason: 'Revocacion administrativa por inconsistencias detectadas.',
        });
        expect(business).toMatchObject({
            ownerId: null,
            organizationId: null,
            primaryManagingOrganizationId: null,
            claimStatus: 'SUSPENDED',
            isClaimable: false,
        });
    });

    it('allows admins to mark a catalog business as claimed and exposes ownership history', async () => {
        const admin = await createUser('ADMIN');
        const owner = await createUser('BUSINESS_OWNER');
        const adminToken = signToken(admin.id, admin.role);
        const ownerToken = signToken(owner.id, owner.role);
        const province = await createProvince();
        const seed = makeSeed();

        const ownerBusiness = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(`${seed}-owner`, province.id))
            .expect(201);

        const ownerOrganizationId = String(ownerBusiness.body.organization.id);

        const catalogBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-catalog`, province.id),
                address: 'Avenida de catalogo 456',
                latitude: 18.4961,
                longitude: -69.9212,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const catalogBusinessId = String(catalogBusiness.body.id);

        const markedClaimed = await request(app.getHttpServer())
            .post(`/api/businesses/admin/${catalogBusinessId}/mark-claimed`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                organizationId: ownerOrganizationId,
                ownerUserId: owner.id,
                role: 'PRIMARY_OWNER',
                notes: 'Asignacion administrativa del ownership del catalogo.',
            })
            .expect(201);

        expect(markedClaimed.body).toMatchObject({
            id: catalogBusinessId,
            ownerId: owner.id,
            organizationId: ownerOrganizationId,
            claimStatus: 'CLAIMED',
        });

        const ownershipHistory = await request(app.getHttpServer())
            .get(`/api/businesses/admin/${catalogBusinessId}/ownership-history`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(ownershipHistory.body.business).toMatchObject({
            id: catalogBusinessId,
            ownerId: owner.id,
            organizationId: ownerOrganizationId,
            claimStatus: 'CLAIMED',
        });
        expect(ownershipHistory.body.data).toHaveLength(1);
        expect(ownershipHistory.body.data[0]).toMatchObject({
            isActive: true,
            role: 'PRIMARY_OWNER',
            organization: {
                id: ownerOrganizationId,
            },
        });
    });

    it('allows admins to approve claim requests and assigns ownership to the requester', async () => {
        const admin = await createUser('ADMIN');
        const claimant = await createUser('USER');
        const adminToken = signToken(admin.id, admin.role);
        const claimantToken = signToken(claimant.id, claimant.role);
        const province = await createProvince();
        const seed = makeSeed();

        const catalogBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-claim-review`, province.id),
                address: 'Avenida de revision 789',
                latitude: 18.5001,
                longitude: -69.9102,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const catalogBusinessId = String(catalogBusiness.body.id);

        const createdClaimRequest = await request(app.getHttpServer())
            .post(`/api/businesses/${catalogBusinessId}/claim-requests`)
            .set('Authorization', `Bearer ${claimantToken}`)
            .send({
                evidenceType: 'OTHER',
                evidenceValue: 'Factura de servicios a nombre del solicitante',
                notes: 'Solicito revision administrativa del negocio.',
            })
            .expect(201);

        const claimRequestId = String(createdClaimRequest.body.id);

        const approved = await request(app.getHttpServer())
            .post(`/api/businesses/admin/claim-requests/${claimRequestId}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'APPROVED',
                notes: 'Reclamo aprobado tras validar la documentacion.',
            })
            .expect(201);

        const claimantUser = await prisma.user.findUnique({
            where: { id: claimant.id },
            select: {
                role: true,
            },
        });
        const claimantOrganization = await prisma.organization.findFirst({
            where: {
                ownerUserId: claimant.id,
            },
            select: {
                id: true,
            },
        });
        const approvedBusiness = await prisma.business.findUnique({
            where: { id: catalogBusinessId },
            select: {
                ownerId: true,
                organizationId: true,
                primaryManagingOrganizationId: true,
                claimStatus: true,
                claimedByUserId: true,
            },
        });
        const ownership = await prisma.businessOwnership.findFirst({
            where: {
                businessId: catalogBusinessId,
                claimRequestId,
            },
            select: {
                id: true,
                organizationId: true,
                role: true,
                isActive: true,
            },
        });
        const approvedClaimRequest = await prisma.businessClaimRequest.findUnique({
            where: { id: claimRequestId },
            select: {
                status: true,
                reviewedByAdminId: true,
                approvedAt: true,
            },
        });

        expect(claimantOrganization).not.toBeNull();
        expect(ownership).not.toBeNull();
        expect(approved.body).toMatchObject({
            id: claimRequestId,
            status: 'APPROVED',
            businessId: catalogBusinessId,
            requesterUserId: claimant.id,
            requesterOrganizationId: claimantOrganization!.id,
            organizationId: claimantOrganization!.id,
            ownershipId: ownership!.id,
        });
        expect(claimantUser).toMatchObject({
            role: 'BUSINESS_OWNER',
        });
        expect(approvedBusiness).toMatchObject({
            ownerId: claimant.id,
            organizationId: claimantOrganization!.id,
            primaryManagingOrganizationId: claimantOrganization!.id,
            claimStatus: 'CLAIMED',
            claimedByUserId: claimant.id,
        });
        expect(ownership).toMatchObject({
            organizationId: claimantOrganization!.id,
            role: 'PRIMARY_OWNER',
            isActive: true,
        });
        expect(approvedClaimRequest).toMatchObject({
            status: 'APPROVED',
            reviewedByAdminId: admin.id,
        });
        expect(approvedClaimRequest?.approvedAt).toBeTruthy();
    });

    it('allows admins to list and inspect pending claim requests', async () => {
        const admin = await createUser('ADMIN');
        const claimant = await createUser('USER');
        const adminToken = signToken(admin.id, admin.role);
        const claimantToken = signToken(claimant.id, claimant.role);
        const province = await createProvince();
        const seed = makeSeed();

        const catalogBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-claim-list`, province.id),
                address: 'Avenida de bandeja 321',
                latitude: 18.5012,
                longitude: -69.9054,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const catalogBusinessId = String(catalogBusiness.body.id);
        const claimRequest = await request(app.getHttpServer())
            .post(`/api/businesses/${catalogBusinessId}/claim-requests`)
            .set('Authorization', `Bearer ${claimantToken}`)
            .send({
                evidenceType: 'OTHER',
                evidenceValue: 'Constancia comercial pendiente de revision',
                notes: 'Solicitud pendiente de revision.',
            })
            .expect(201);

        const claimRequestId = String(claimRequest.body.id);

        const listed = await request(app.getHttpServer())
            .get('/api/businesses/admin/claim-requests')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({
                status: 'PENDING',
                limit: 10,
            })
            .expect(200);

        expect(listed.body.summary).toMatchObject({
            PENDING: 1,
        });
        expect(listed.body.data).toHaveLength(1);
        expect(listed.body.data[0]).toMatchObject({
            id: claimRequestId,
            status: 'PENDING',
            requesterUserId: claimant.id,
            requesterOrganizationId: null,
            evidenceType: 'MANUAL',
            business: {
                id: catalogBusinessId,
                claimStatus: 'PENDING_CLAIM',
                source: 'ADMIN',
                catalogSource: 'ADMIN',
            },
        });

        const detail = await request(app.getHttpServer())
            .get(`/api/businesses/admin/claim-requests/${claimRequestId}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(detail.body).toMatchObject({
            id: claimRequestId,
            status: 'PENDING',
            requesterUserId: claimant.id,
            requesterOrganizationId: null,
            requesterUser: {
                id: claimant.id,
                role: 'USER',
            },
            business: {
                id: catalogBusinessId,
                source: 'ADMIN',
                catalogSource: 'ADMIN',
            },
        });
    });

    it('expires stale claim requests when admins inspect the review queue', async () => {
        const admin = await createUser('ADMIN');
        const claimant = await createUser('USER');
        const adminToken = signToken(admin.id, admin.role);
        const claimantToken = signToken(claimant.id, claimant.role);
        const province = await createProvince();
        const seed = makeSeed();

        const catalogBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-claim-expire`, province.id),
                address: 'Avenida de expiracion 654',
                latitude: 18.5031,
                longitude: -69.9021,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const catalogBusinessId = String(catalogBusiness.body.id);
        const claimRequest = await request(app.getHttpServer())
            .post(`/api/businesses/${catalogBusinessId}/claim-requests`)
            .set('Authorization', `Bearer ${claimantToken}`)
            .send({
                evidenceType: 'OTHER',
                evidenceValue: 'Solicitud que debe vencer por antiguedad',
                notes: 'Pendiente de revision por mas de 30 dias.',
            })
            .expect(201);

        const claimRequestId = String(claimRequest.body.id);
        const staleCreatedAt = new Date('2026-02-01T12:00:00.000Z');
        await prisma.businessClaimRequest.update({
            where: { id: claimRequestId },
            data: {
                createdAt: staleCreatedAt,
            },
        });

        const listedExpired = await request(app.getHttpServer())
            .get('/api/businesses/admin/claim-requests')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({
                status: 'EXPIRED',
                limit: 10,
            })
            .expect(200);

        const expiredBusiness = await prisma.business.findUnique({
            where: { id: catalogBusinessId },
            select: {
                claimStatus: true,
                primaryManagingOrganizationId: true,
                lastReviewedAt: true,
            },
        });
        const expiredClaim = await prisma.businessClaimRequest.findUnique({
            where: { id: claimRequestId },
            select: {
                status: true,
                expiredAt: true,
                reviewedAt: true,
            },
        });

        expect(listedExpired.body.summary).toMatchObject({
            EXPIRED: 1,
        });
        expect(listedExpired.body.data).toHaveLength(1);
        expect(listedExpired.body.data[0]).toMatchObject({
            id: claimRequestId,
            status: 'EXPIRED',
            requesterUserId: claimant.id,
            business: {
                id: catalogBusinessId,
                claimStatus: 'UNCLAIMED',
            },
        });
        expect(expiredClaim).toMatchObject({
            status: 'EXPIRED',
        });
        expect(expiredClaim?.expiredAt).toBeTruthy();
        expect(expiredClaim?.reviewedAt).toBeTruthy();
        expect(expiredBusiness).toMatchObject({
            claimStatus: 'UNCLAIMED',
            primaryManagingOrganizationId: null,
        });
        expect(expiredBusiness?.lastReviewedAt).toBeTruthy();
    });

    it('rejects duplicate active claim requests for the same business', async () => {
        const admin = await createUser('ADMIN');
        const firstClaimant = await createUser('USER');
        const secondClaimant = await createUser('USER');
        const adminToken = signToken(admin.id, admin.role);
        const firstClaimantToken = signToken(firstClaimant.id, firstClaimant.role);
        const secondClaimantToken = signToken(secondClaimant.id, secondClaimant.role);
        const province = await createProvince();
        const seed = makeSeed();

        const catalogBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-claim-duplicate`, province.id),
                address: 'Avenida de conflicto 987',
                latitude: 18.5042,
                longitude: -69.9002,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const catalogBusinessId = String(catalogBusiness.body.id);

        await request(app.getHttpServer())
            .post(`/api/businesses/${catalogBusinessId}/claim-requests`)
            .set('Authorization', `Bearer ${firstClaimantToken}`)
            .send({
                evidenceType: 'OTHER',
                evidenceValue: 'Solicitud original pendiente',
                notes: 'Primera solicitud pendiente.',
            })
            .expect(201);

        const duplicated = await request(app.getHttpServer())
            .post(`/api/businesses/${catalogBusinessId}/claim-requests`)
            .set('Authorization', `Bearer ${secondClaimantToken}`)
            .send({
                evidenceType: 'OTHER',
                evidenceValue: 'Solicitud duplicada',
                notes: 'Segunda solicitud que debe ser rechazada.',
            })
            .expect(409);

        const business = await prisma.business.findUnique({
            where: { id: catalogBusinessId },
            select: {
                claimStatus: true,
            },
        });
        const pendingClaims = await prisma.businessClaimRequest.count({
            where: {
                businessId: catalogBusinessId,
                status: 'PENDING',
            },
        });

        expect(duplicated.body).toMatchObject({
            statusCode: 409,
            error: 'Conflict',
            message: 'Ya existe una solicitud de reclamacion pendiente para este negocio',
        });
        expect(business).toMatchObject({
            claimStatus: 'PENDING_CLAIM',
        });
        expect(pendingClaims).toBe(1);
    });

    it('allows users and admins to list business suggestions with the correct summary', async () => {
        const submitter = await createUser('USER');
        const otherSubmitter = await createUser('USER');
        const admin = await createUser('ADMIN');
        const submitterToken = signToken(submitter.id, submitter.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();

        await prisma.businessSuggestion.createMany({
            data: [
                {
                    submittedByUserId: submitter.id,
                    name: `Pending suggestion ${makeSeed()}`,
                    address: 'Calle 1',
                    provinceId: province.id,
                    status: 'PENDING',
                },
                {
                    submittedByUserId: submitter.id,
                    name: `Approved suggestion ${makeSeed()}`,
                    address: 'Calle 2',
                    provinceId: province.id,
                    status: 'APPROVED',
                    reviewedByAdminId: admin.id,
                    reviewedAt: new Date(),
                },
                {
                    submittedByUserId: otherSubmitter.id,
                    name: `Rejected suggestion ${makeSeed()}`,
                    address: 'Calle 3',
                    provinceId: province.id,
                    status: 'REJECTED',
                    reviewedByAdminId: admin.id,
                    reviewedAt: new Date(),
                },
            ],
        });

        const mineResponse = await request(app.getHttpServer())
            .get('/api/business-suggestions/my?limit=100')
            .set('Authorization', `Bearer ${submitterToken}`)
            .expect(200);

        expect(mineResponse.body.summary).toEqual({
            APPROVED: 1,
            PENDING: 1,
        });
        expect(mineResponse.body.data).toHaveLength(2);
        expect(
            mineResponse.body.data.every(
                (item: { submittedByUser: { id: string } }) => item.submittedByUser.id === submitter.id,
            ),
        ).toBe(true);

        const adminResponse = await request(app.getHttpServer())
            .get('/api/business-suggestions/admin?limit=100')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(adminResponse.body.summary).toEqual({
            APPROVED: 1,
            PENDING: 1,
            REJECTED: 1,
        });
        expect(adminResponse.body.data).toHaveLength(3);
    });

    it('allows admins to reject business suggestions and stores the reviewed state', async () => {
        const submitter = await createUser('USER');
        const admin = await createUser('ADMIN');
        const submitterToken = signToken(submitter.id, submitter.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();

        const createdSuggestion = await request(app.getHttpServer())
            .post('/api/business-suggestions')
            .set('Authorization', `Bearer ${submitterToken}`)
            .send({
                name: `Rejected suggestion ${makeSeed()}`,
                address: 'Calle rechazada 123',
                provinceId: province.id,
                notes: 'Nota original de la sugerencia.',
            })
            .expect(201);

        const suggestionId = String(createdSuggestion.body.id);

        const reviewed = await request(app.getHttpServer())
            .post(`/api/business-suggestions/admin/${suggestionId}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'REJECTED',
                notes: 'No cumple criterios de publicacion.',
            })
            .expect(201);

        const storedSuggestion = await prisma.businessSuggestion.findUnique({
            where: { id: suggestionId },
            select: {
                status: true,
                notes: true,
                reviewedAt: true,
                reviewedByAdminId: true,
                createdBusinessId: true,
            },
        });

        expect(reviewed.body).toEqual({
            id: suggestionId,
            status: 'REJECTED',
        });
        expect(storedSuggestion).toMatchObject({
            status: 'REJECTED',
            notes: 'No cumple criterios de publicacion.',
            reviewedByAdminId: admin.id,
            createdBusinessId: null,
        });
        expect(storedSuggestion?.reviewedAt).toBeTruthy();
    });

    it('allows admins to approve business suggestions and creates a published catalog business', async () => {
        const submitter = await createUser('USER');
        const admin = await createUser('ADMIN');
        const submitterToken = signToken(submitter.id, submitter.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const createdSuggestion = await request(app.getHttpServer())
            .post('/api/business-suggestions')
            .set('Authorization', `Bearer ${submitterToken}`)
            .send({
                name: `Approved suggestion ${seed}`,
                address: `Calle aprobada ${seed}`,
                provinceId: province.id,
                website: 'https://approved-suggestion.example.com',
                email: 'approved@example.com',
                notes: 'Descripcion moderada desde sugerencia.',
            })
            .expect(201);

        const suggestionId = String(createdSuggestion.body.id);

        const reviewed = await request(app.getHttpServer())
            .post(`/api/business-suggestions/admin/${suggestionId}/review`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'APPROVED',
            })
            .expect(201);

        const storedSuggestion = await prisma.businessSuggestion.findUnique({
            where: { id: suggestionId },
            select: {
                status: true,
                reviewedByAdminId: true,
                createdBusinessId: true,
            },
        });

        const createdBusiness = await prisma.business.findUnique({
            where: { id: reviewed.body.createdBusinessId },
            select: {
                id: true,
                name: true,
                description: true,
                address: true,
                provinceId: true,
                website: true,
                email: true,
                publicStatus: true,
                isClaimable: true,
                source: true,
            },
        });

        expect(reviewed.body).toMatchObject({
            id: suggestionId,
            status: 'APPROVED',
            createdBusinessId: expect.any(String),
            createdBusinessSlug: expect.any(String),
        });
        expect(storedSuggestion).toMatchObject({
            status: 'APPROVED',
            reviewedByAdminId: admin.id,
            createdBusinessId: reviewed.body.createdBusinessId,
        });
        expect(createdBusiness).toMatchObject({
            id: reviewed.body.createdBusinessId,
            name: `Approved suggestion ${seed}`,
            description: 'Descripcion moderada desde sugerencia.',
            address: `Calle aprobada ${seed}`,
            provinceId: province.id,
            website: 'https://approved-suggestion.example.com',
            email: 'approved@example.com',
            publicStatus: 'PUBLISHED',
            isClaimable: true,
            source: 'USER_SUGGESTION',
        });
    });

    it('allows admins to list duplicate cases with summary and primary business details', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const admin = await createUser('ADMIN');
        const ownerToken = signToken(owner.id, owner.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(`${seed}-duplicate-primary`, province.id))
            .expect(201);

        await prisma.businessDuplicateCase.createMany({
            data: [
                {
                    clusterKey: `duplicate-case-merged-${seed}`,
                    status: 'MERGED',
                    businessIds: [created.body.id, `shadow-business-${seed}`],
                    reasons: ['same-phone'],
                    primaryBusinessId: created.body.id,
                    resolvedByAdminId: admin.id,
                    resolutionNotes: 'Se fusionaron fichas duplicadas.',
                    resolvedAt: new Date('2026-04-23T00:00:00.000Z'),
                },
                {
                    clusterKey: `duplicate-case-conflict-${seed}`,
                    status: 'CONFLICT',
                    businessIds: [`conflict-a-${seed}`, `conflict-b-${seed}`],
                    reasons: ['same-address'],
                    primaryBusinessId: null,
                    resolvedByAdminId: admin.id,
                    resolutionNotes: 'Conflicto pendiente de criterio manual.',
                    resolvedAt: new Date('2026-04-22T00:00:00.000Z'),
                },
            ],
        });

        const response = await request(app.getHttpServer())
            .get('/api/businesses/admin/duplicate-cases?limit=100')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        expect(response.body.summary).toEqual({
            CONFLICT: 1,
            MERGED: 1,
        });
        expect(response.body.data).toHaveLength(2);
        expect(response.body.data[0]).toMatchObject({
            clusterKey: `duplicate-case-merged-${seed}`,
            status: 'MERGED',
            primaryBusiness: {
                id: created.body.id,
                slug: created.body.slug,
            },
            resolvedByAdmin: {
                id: admin.id,
            },
        });
    });

    it('allows admins to resolve duplicate cases as conflict without merging businesses', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const secondaryOwner = await createUser('BUSINESS_OWNER');
        const admin = await createUser('ADMIN');
        const ownerToken = signToken(owner.id, owner.role);
        const secondaryOwnerToken = signToken(secondaryOwner.id, secondaryOwner.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const firstBusiness = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send(makeCreateBusinessPayload(`${seed}-duplicate-a`, province.id))
            .expect(201);

        const secondBusiness = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${secondaryOwnerToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-duplicate-b`, province.id),
                address: 'Avenida alternativa 456',
                latitude: 18.4961,
                longitude: -69.9212,
            });

        expect(secondBusiness.status).toBe(201);

        const resolved = await request(app.getHttpServer())
            .post('/api/businesses/admin/duplicate-cases/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'CONFLICT',
                businessIds: [firstBusiness.body.id, secondBusiness.body.id],
                reasons: ['same-address'],
                notes: 'Escalar a revision manual.',
            })
            .expect(201);

        const sortedBusinessIds = [firstBusiness.body.id, secondBusiness.body.id].sort();
        const storedCase = await prisma.businessDuplicateCase.findUnique({
            where: {
                clusterKey: sortedBusinessIds.join(':'),
            },
            select: {
                status: true,
                businessIds: true,
                reasons: true,
                resolutionNotes: true,
                resolvedByAdminId: true,
                primaryBusinessId: true,
                resolutionMeta: true,
                resolvedAt: true,
            },
        });

        expect(resolved.body).toMatchObject({
            clusterKey: sortedBusinessIds.join(':'),
            status: 'CONFLICT',
            reasons: ['same-address'],
            resolutionNotes: 'Escalar a revision manual.',
        });
        expect([...resolved.body.businessIds].sort()).toEqual(sortedBusinessIds);
        expect(storedCase).toMatchObject({
            status: 'CONFLICT',
            reasons: ['same-address'],
            resolutionNotes: 'Escalar a revision manual.',
            resolvedByAdminId: admin.id,
            primaryBusinessId: null,
            resolutionMeta: null,
        });
        expect(
            storedCase && Array.isArray(storedCase.businessIds)
                ? [...storedCase.businessIds].sort()
                : storedCase?.businessIds,
        ).toEqual(sortedBusinessIds);
        expect(storedCase?.resolvedAt).toBeTruthy();
    });

    it('allows admins to merge duplicate catalog businesses and archives the secondary record', async () => {
        const admin = await createUser('ADMIN');
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const primaryBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-merge-a`, province.id),
                address: 'Avenida mergeable 123',
                latitude: 18.5101,
                longitude: -69.9301,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const secondaryBusiness = await request(app.getHttpServer())
            .post('/api/businesses/admin/catalog')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                ...makeCreateBusinessPayload(`${seed}-merge-b`, province.id),
                address: 'Avenida fusionable 456',
                latitude: 18.5202,
                longitude: -69.9402,
                source: 'ADMIN',
                publicStatus: 'PUBLISHED',
                isClaimable: true,
            })
            .expect(201);

        const sortedBusinessIds = [primaryBusiness.body.id, secondaryBusiness.body.id].sort();

        const resolved = await request(app.getHttpServer())
            .post('/api/businesses/admin/duplicate-cases/resolve')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                status: 'MERGED',
                businessIds: [primaryBusiness.body.id, secondaryBusiness.body.id],
                primaryBusinessId: primaryBusiness.body.id,
                reasons: ['same-phone'],
                notes: 'Fusion administrativa de catalogo.',
            })
            .expect(201);

        const storedCase = await prisma.businessDuplicateCase.findUnique({
            where: {
                clusterKey: sortedBusinessIds.join(':'),
            },
            select: {
                clusterKey: true,
                status: true,
                businessIds: true,
                primaryBusinessId: true,
                resolutionNotes: true,
                resolutionMeta: true,
                resolvedAt: true,
            },
        });

        const archivedSecondaryRows = await prisma.$queryRaw<Array<{
            id: string;
            deletedAt: Date | null;
            publicStatus: string;
            claimStatus: string;
            ownerId: string | null;
            organizationId: string | null;
            primaryManagingOrganizationId: string | null;
            isClaimable: boolean;
            isActive: boolean;
        }>>`
            SELECT
                id,
                "deletedAt",
                "publicStatus",
                "claimStatus",
                "ownerId",
                "organizationId",
                "primaryManagingOrganizationId",
                "isClaimable",
                "isActive"
            FROM "businesses"
            WHERE id = ${secondaryBusiness.body.id}
        `;
        const archivedSecondary = archivedSecondaryRows[0] ?? null;

        const persistedPrimary = await prisma.business.findUnique({
            where: {
                id: primaryBusiness.body.id,
            },
            select: {
                id: true,
                deletedAt: true,
            },
        });

        expect(resolved.body).toMatchObject({
            clusterKey: sortedBusinessIds.join(':'),
            status: 'MERGED',
            primaryBusinessId: primaryBusiness.body.id,
            resolutionNotes: 'Fusion administrativa de catalogo.',
            resolutionMeta: {
                mergedIntoBusinessId: primaryBusiness.body.id,
                archivedBusinessIds: [secondaryBusiness.body.id],
            },
        });
        expect([...resolved.body.businessIds].sort()).toEqual(sortedBusinessIds);
        expect(storedCase).toMatchObject({
            clusterKey: sortedBusinessIds.join(':'),
            status: 'MERGED',
            primaryBusinessId: primaryBusiness.body.id,
            resolutionNotes: 'Fusion administrativa de catalogo.',
        });
        expect(
            storedCase && Array.isArray(storedCase.businessIds)
                ? [...storedCase.businessIds].sort()
                : storedCase?.businessIds,
        ).toEqual(sortedBusinessIds);
        expect(storedCase?.resolutionMeta).toMatchObject({
            mergedIntoBusinessId: primaryBusiness.body.id,
            archivedBusinessIds: [secondaryBusiness.body.id],
        });
        expect(storedCase?.resolvedAt).toBeTruthy();
        expect(archivedSecondary).toMatchObject({
            id: secondaryBusiness.body.id,
            publicStatus: 'ARCHIVED',
            claimStatus: 'UNCLAIMED',
            ownerId: null,
            organizationId: null,
            primaryManagingOrganizationId: null,
            isClaimable: false,
            isActive: false,
        });
        expect(archivedSecondary?.deletedAt).toBeTruthy();
        expect(persistedPrimary).toMatchObject({
            id: primaryBusiness.body.id,
            deletedAt: null,
        });
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

    it('lets a clean business enter verification review after documents are uploaded', async () => {
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

        await request(app.getHttpServer())
            .post('/api/verification/documents')
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                businessId,
                documentType: 'OTHER',
                fileUrl: '/uploads/verification/e2e-clean.pdf',
            })
            .expect(201);

        const submitted = await request(app.getHttpServer())
            .post(`/api/verification/businesses/${businessId}/submit`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                notes: 'Documentacion inicial lista para revision.',
            })
            .expect(201);

        expect(submitted.body).toMatchObject({
            id: businessId,
            verificationStatus: 'PENDING',
            verificationNotes: 'Documentacion inicial lista para revision.',
        });
    });

    it('blocks suspicious businesses behind preventive moderation and exposes them in the admin queue', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const admin = await createUser('ADMIN');
        const ownerToken = signToken(owner.id, owner.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                ...makeCreateBusinessPayload(seed, province.id),
                description: 'GANA DINERO RAPIDO CLICK AQUI ONLYFANS TELEGRAM WHATSAPP +1 809 555 1122 WWW.OFERTAS-RARAS.TEST',
            })
            .expect(201);

        const businessId = String(created.body.id);
        const organizationId = String(created.body.organization.id);

        await request(app.getHttpServer())
            .post('/api/verification/documents')
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                businessId,
                documentType: 'OTHER',
                fileUrl: '/uploads/verification/e2e-suspicious.pdf',
            })
            .expect(201);

        const blocked = await request(app.getHttpServer())
            .post(`/api/verification/businesses/${businessId}/submit`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                notes: 'Intento de envio inicial.',
            })
            .expect(400);

        expect(String(blocked.body.message).toLowerCase()).toContain('revision preventiva');

        const status = await request(app.getHttpServer())
            .get(`/api/verification/businesses/${businessId}/status`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .expect(200);

        expect(status.body).toMatchObject({
            id: businessId,
            verificationStatus: 'UNVERIFIED',
        });
        expect(String(status.body.verificationNotes)).toContain('Revision preventiva requerida');

        const moderationQueue = await request(app.getHttpServer())
            .get('/api/verification/admin/moderation-queue')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        const preModerationItem = (moderationQueue.body.items as Array<any>).find((item) => (
            item.queueType === 'BUSINESS_PREMODERATION'
            && item.entityId === businessId
        ));

        expect(preModerationItem).toBeDefined();
        expect(preModerationItem?.status).toBe('FLAGGED');
        expect(Array.isArray(preModerationItem?.payload?.preventiveReasons)).toBe(true);
        expect(preModerationItem?.payload?.preventiveReasons?.length ?? 0).toBeGreaterThan(0);
        expect(preModerationItem?.payload?.preventiveSeverity).toBe('HIGH');
        expect(preModerationItem?.payload?.preventiveRiskClusters).toEqual(
            expect.arrayContaining(['Contenido', 'Contacto']),
        );
        expect(Array.isArray(preModerationItem?.payload?.preventiveSuggestedActions)).toBe(true);
        expect(preModerationItem?.payload?.preventiveSuggestedActions?.length ?? 0).toBeGreaterThan(0);

        const moderationEvents = await prisma.growthEvent.findMany({
            where: {
                businessId,
                eventType: 'PREMODERATION_FLAGGED',
            },
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                eventType: true,
                metadata: true,
            },
        });

        expect(moderationEvents.length).toBeGreaterThan(0);
        expect(moderationEvents.some((event) => (
            typeof event.metadata === 'object'
            && event.metadata !== null
            && !Array.isArray(event.metadata)
            && (event.metadata as Record<string, unknown>).trigger === 'business_submit'
        ))).toBe(true);
        expect(moderationEvents[0]?.metadata).toMatchObject({
            trigger: 'document_submit',
        });
        expect(moderationEvents[1]?.metadata).toMatchObject({
            trigger: 'business_submit',
        });
    });

    it('allows admins to clear preventive moderation and move a business into the KYC queue', async () => {
        const owner = await createUser('BUSINESS_OWNER');
        const admin = await createUser('ADMIN');
        const ownerToken = signToken(owner.id, owner.role);
        const adminToken = signToken(admin.id, admin.role);
        const province = await createProvince();
        const seed = makeSeed();

        const created = await request(app.getHttpServer())
            .post('/api/businesses')
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({
                ...makeCreateBusinessPayload(seed, province.id),
                description: 'GANA DINERO RAPIDO CLICK AQUI ONLYFANS TELEGRAM WHATSAPP +1 809 555 3344 WWW.ATAJO-RARO.TEST',
            })
            .expect(201);

        const businessId = String(created.body.id);
        const organizationId = String(created.body.organization.id);

        await request(app.getHttpServer())
            .post('/api/verification/documents')
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                businessId,
                documentType: 'OTHER',
                fileUrl: '/uploads/verification/e2e-premoderation-release.pdf',
            })
            .expect(201);

        await request(app.getHttpServer())
            .post(`/api/verification/businesses/${businessId}/submit`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .set('x-organization-id', organizationId)
            .send({
                notes: 'Intento inicial para entrar a KYC.',
            })
            .expect(400);

        const released = await request(app.getHttpServer())
            .patch(`/api/verification/admin/businesses/${businessId}/pre-moderation`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                decision: 'APPROVE_FOR_KYC',
                notes: 'Liberado para revision KYC manual',
            })
            .expect(200);

        expect(released.body).toMatchObject({
            id: businessId,
            verificationStatus: 'PENDING',
            verificationNotes: 'Liberado para revision KYC manual',
        });

        const moderationQueue = await request(app.getHttpServer())
            .get('/api/verification/admin/moderation-queue')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);

        const preModerationItem = (moderationQueue.body.items as Array<any>).find((item) => (
            item.queueType === 'BUSINESS_PREMODERATION'
            && item.entityId === businessId
        ));
        const businessVerificationItem = (moderationQueue.body.items as Array<any>).find((item) => (
            item.queueType === 'BUSINESS_VERIFICATION'
            && item.entityId === businessId
        ));

        expect(preModerationItem).toBeUndefined();
        expect(businessVerificationItem).toBeDefined();

        const moderationEvents = await prisma.growthEvent.findMany({
            where: {
                businessId,
                eventType: {
                    in: ['PREMODERATION_FLAGGED', 'PREMODERATION_RELEASED'],
                },
            },
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                eventType: true,
                userId: true,
                metadata: true,
            },
        });

        expect(moderationEvents.map((event) => event.eventType)).toEqual([
            'PREMODERATION_FLAGGED',
            'PREMODERATION_FLAGGED',
            'PREMODERATION_RELEASED',
        ]);
        expect(moderationEvents[2]?.userId).toBe(admin.id);
        expect(moderationEvents[2]?.metadata).toMatchObject({
            decision: 'APPROVE_FOR_KYC',
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
            contactName: 'Cliente Público',
            contactPhone: '+1 (809) 555-0000',
            contactEmail: 'cliente-publico@example.com',
            message: 'Necesito una cotización para hoy',
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
            message: 'Ya existe una solicitud reciente con este teléfono. Intenta nuevamente en unos minutos.',
        });
    });
});
