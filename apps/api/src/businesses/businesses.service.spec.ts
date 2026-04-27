import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessesService } from './businesses.service';

function createBusinessesService() {
    const tx = {
        business: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        businessClaimRequest: {
            findMany: vi.fn(),
            updateMany: vi.fn(),
            groupBy: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        businessOwnership: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        growthEvent: {
            create: vi.fn(),
        },
    };
    const prisma = {
        business: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const organizationAccessService = {
        assertOrganizationMember: vi.fn((role: string | null, message?: string) => {
            if (!role) {
                throw new ForbiddenException(message);
            }
        }),
        assertCanManageOrganization: vi.fn((role: string, message?: string) => {
            if (role !== 'OWNER' && role !== 'MANAGER') {
                throw new ForbiddenException(message);
            }
        }),
    };
    const domainEventsService = {
        publishBusinessChanged: vi.fn(),
        publishClaimRequestCreated: vi.fn(),
        publishClaimRequestReviewed: vi.fn(),
        publishBusinessLinkedToOrganization: vi.fn(),
        publishBusinessDuplicatesMerged: vi.fn(),
        publishCatalogBusinessCreated: vi.fn(),
        publishPotentialDuplicateDetected: vi.fn(),
    };

    const service = new (BusinessesService as any)(
        prisma as unknown as PrismaService,
        {},
        {},
        domainEventsService,
        {},
        {},
        {},
        organizationAccessService as unknown as OrganizationAccessService,
    ) as BusinessesService;

    vi.spyOn(service as any, 'generateUniqueSlug').mockResolvedValue('negocio-test');
    vi.spyOn(service as any, 'normalizeBusinessContactChannels').mockResolvedValue({
        phone: null,
        whatsapp: null,
    });
    vi.spyOn(service as any, 'resolveCoordinatesForBusiness').mockResolvedValue({
        latitude: 18.4861,
        longitude: -69.9312,
    });
    vi.spyOn(service as any, 'assertNoStrongDuplicateMatch').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'assertCityBelongsToProvince').mockResolvedValue(undefined);
    vi.spyOn(service as any, 'assertSectorBelongsToCity').mockResolvedValue(undefined);

    return {
        service,
        prisma,
        tx,
        domainEventsService,
        organizationAccessService,
    };
}

describe('BusinessesService organization access', () => {
    it('delegates organization-scoped creation checks to OrganizationAccessService', async () => {
        const { service, organizationAccessService } = createBusinessesService();

        await expect(
            service.create(
                {
                    name: 'Negocio test',
                    description: 'Descripcion de prueba',
                    address: 'Calle 1',
                    provinceId: '11111111-1111-4111-8111-111111111111',
                    latitude: 18.4861,
                    longitude: -69.9312,
                },
                'user-1',
                'BUSINESS_OWNER',
                'org-1',
                'STAFF',
            ),
        ).rejects.toThrowError('El rol STAFF no puede crear negocios');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'El rol STAFF no puede crear negocios',
        );
    });

    it('delegates update management checks to OrganizationAccessService', async () => {
        const { service, prisma, tx, organizationAccessService } = createBusinessesService();
        prisma.business.findUnique.mockResolvedValue({
            id: 'business-1',
            provinceId: 'province-1',
            cityId: null,
            sectorId: null,
            address: 'Calle 1',
            latitude: 18.4861,
            longitude: -69.9312,
        });
        tx.business.findUnique.mockResolvedValue({
            id: 'business-1',
            ownerId: 'user-1',
            organizationId: 'org-1',
            ownerships: [{ organizationId: 'org-1' }],
            provinceId: 'province-1',
            cityId: null,
            sectorId: null,
            latitude: 18.4861,
            longitude: -69.9312,
        });

        await expect(
            service.update(
                'business-1',
                {},
                'user-1',
                'BUSINESS_OWNER',
                'org-1',
                'STAFF',
            ),
        ).rejects.toThrowError('No tienes permisos para editar este negocio');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'No tienes permisos para editar este negocio',
        );
    });

    it('delegates delete management checks to OrganizationAccessService', async () => {
        const { service, prisma, organizationAccessService } = createBusinessesService();
        prisma.business.findUnique.mockResolvedValue({
            id: 'business-1',
            slug: 'negocio-test',
            organizationId: 'org-1',
            ownerships: [{ organizationId: 'org-1' }],
            images: [],
        });

        await expect(
            service.delete(
                'business-1',
                'Motivo suficientemente largo para eliminar el negocio.',
                'user-1',
                'BUSINESS_OWNER',
                'org-1',
                'STAFF',
            ),
        ).rejects.toThrowError('No tienes permisos para eliminar este negocio');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'No tienes permisos para eliminar este negocio',
        );
    });

    it('expires stale claims during createClaimRequest and publishes deduped business.changed after commit', async () => {
        const { service, prisma, tx, domainEventsService } = createBusinessesService();
        const events: string[] = [];
        const createdAt = new Date('2026-04-25T12:00:00.000Z');

        prisma.$transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<unknown>) => {
            events.push('transaction:start');
            const result = await callback(tx);
            events.push('transaction:commit');
            return result;
        });
        domainEventsService.publishBusinessChanged.mockImplementation(() => {
            events.push('business.changed');
        });
        domainEventsService.publishClaimRequestCreated.mockImplementation(() => {
            events.push('claim.created');
        });
        tx.businessClaimRequest.findMany.mockResolvedValue([
            {
                id: 'stale-claim-1',
                businessId: 'business-1',
                requesterOrganizationId: null,
                business: {
                    slug: 'negocio-test',
                },
            },
            {
                id: 'stale-claim-2',
                businessId: 'business-1',
                requesterOrganizationId: 'org-stale',
                business: {
                    slug: 'negocio-test',
                },
            },
        ]);
        tx.businessClaimRequest.updateMany.mockResolvedValue({ count: 2 });
        tx.auditLog.create.mockResolvedValue({});
        tx.businessOwnership.findMany.mockResolvedValue([]);
        tx.businessClaimRequest.groupBy.mockResolvedValue([]);
        tx.business.update.mockResolvedValue({ id: 'business-1' });
        tx.business.findUnique.mockResolvedValue({
            id: 'business-1',
            name: 'Negocio Test',
            slug: 'negocio-test',
            provinceId: 'province-1',
            cityId: 'city-1',
            claimStatus: 'UNCLAIMED',
            isClaimable: true,
            deletedAt: null,
        });
        tx.businessOwnership.findFirst.mockResolvedValue(null);
        tx.businessClaimRequest.findFirst.mockResolvedValue(null);
        tx.businessClaimRequest.create.mockResolvedValue({
            id: 'claim-new',
            status: 'PENDING',
            createdAt,
            business: {
                id: 'business-1',
                name: 'Negocio Test',
                slug: 'negocio-test',
            },
        });
        tx.growthEvent.create.mockResolvedValue({});

        const result = await service.createClaimRequest(
            'business-1',
            {
                evidenceType: 'MANUAL',
                evidenceValue: 'Documento enviado',
                notes: 'Solicitud con claims vencidos previos.',
            },
            'user-1',
        );

        expect(domainEventsService.publishBusinessChanged).toHaveBeenCalledTimes(1);
        expect(domainEventsService.publishBusinessChanged).toHaveBeenCalledWith({
            businessId: 'business-1',
            slug: 'negocio-test',
            operation: 'updated',
        });
        expect(events.indexOf('transaction:commit')).toBeGreaterThan(-1);
        expect(events.indexOf('business.changed')).toBeGreaterThan(events.indexOf('transaction:commit'));
        expect(domainEventsService.publishClaimRequestCreated).toHaveBeenCalledWith({
            claimRequestId: 'claim-new',
            businessId: 'business-1',
            businessSlug: 'negocio-test',
            requesterUserId: 'user-1',
            requesterOrganizationId: null,
        });
        expect(result).toMatchObject({
            id: 'claim-new',
            status: 'PENDING',
            business: {
                id: 'business-1',
                slug: 'negocio-test',
            },
        });
    });
});
