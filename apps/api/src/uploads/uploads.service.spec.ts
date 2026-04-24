import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from './uploads.service';

function createUploadsService() {
    const prisma = {
        business: {
            findUnique: vi.fn(),
        },
        businessImage: {
            count: vi.fn(),
        },
    };
    const configService = {
        get: vi.fn(),
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

    return {
        service: new (UploadsService as any)(
            prisma as unknown as PrismaService,
            configService as unknown as ConfigService,
            organizationAccessService as unknown as OrganizationAccessService,
        ) as UploadsService,
        prisma,
        organizationAccessService,
    };
}

describe('UploadsService organization access', () => {
    it('delegates verification document membership checks to OrganizationAccessService', async () => {
        const { service, prisma, organizationAccessService } = createUploadsService();
        prisma.business.findUnique.mockResolvedValue({
            id: 'business-1',
            organizationId: 'org-1',
            ownerships: [{ organizationId: 'org-1' }],
            deletedAt: null,
        });

        await expect(
            service.uploadVerificationDocument(
                {
                    buffer: Buffer.from('pdf'),
                    mimetype: 'application/pdf',
                    size: 128,
                } as Express.Multer.File,
                'business-1',
                'USER',
                'org-1',
                null,
            ),
        ).rejects.toThrowError('No tienes permisos para subir documentos');

        expect(organizationAccessService.assertOrganizationMember).toHaveBeenCalledWith(
            null,
            'No tienes permisos para subir documentos',
        );
    });

    it('delegates business image management checks to OrganizationAccessService', async () => {
        const { service, prisma, organizationAccessService } = createUploadsService();
        prisma.business.findUnique.mockResolvedValue({
            id: 'business-1',
            ownerId: 'user-1',
            organizationId: 'org-1',
            ownerships: [{ organizationId: 'org-1' }],
        });

        await expect(
            service.uploadBusinessImage(
                {
                    buffer: Buffer.from('image'),
                    mimetype: 'image/png',
                    size: 256,
                } as Express.Multer.File,
                'business-1',
                'user-1',
                'USER',
                'org-1',
                'STAFF',
            ),
        ).rejects.toThrowError('No tienes permisos para subir imágenes a este negocio');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'No tienes permisos para subir imágenes a este negocio',
        );
    });
});
