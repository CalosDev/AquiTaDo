import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessesService } from './businesses.service';

function createBusinessesService() {
    const tx = {
        business: {
            findUnique: vi.fn(),
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

    const service = new (BusinessesService as any)(
        prisma as unknown as PrismaService,
        {},
        {},
        {},
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
});
