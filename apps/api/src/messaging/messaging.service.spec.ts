import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MessagingService } from './messaging.service';

function createMessagingService() {
    const prisma = {};
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
        service: new (MessagingService as any)(
            prisma as unknown as PrismaService,
            organizationAccessService as unknown as OrganizationAccessService,
        ) as MessagingService,
        organizationAccessService,
    };
}

describe('MessagingService organization access', () => {
    it('delegates organization messaging membership checks to OrganizationAccessService', async () => {
        const { service, organizationAccessService } = createMessagingService();

        await expect(
            service.sendMessageAsOrganization(
                'conversation-1',
                'org-1',
                'user-1',
                'USER',
                null,
                { content: 'hola' },
            ),
        ).rejects.toThrowError('No tienes permisos para gestionar conversaciones');

        expect(organizationAccessService.assertOrganizationMember).toHaveBeenCalledWith(
            null,
            'No tienes permisos para gestionar conversaciones',
        );
    });

    it('delegates booking conversion management checks to OrganizationAccessService', async () => {
        const { service, organizationAccessService } = createMessagingService();

        await expect(
            service.convertConversationToBooking(
                'conversation-1',
                'org-1',
                'USER',
                'STAFF',
                { scheduledFor: '2099-01-01T00:00:00.000Z' },
            ),
        ).rejects.toThrowError('El rol STAFF no puede convertir conversaciones en reservas');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'El rol STAFF no puede convertir conversaciones en reservas',
        );
    });

    it('delegates conversation status management checks to OrganizationAccessService', async () => {
        const { service, organizationAccessService } = createMessagingService();

        await expect(
            service.updateConversationStatus(
                'conversation-1',
                'org-1',
                'USER',
                'STAFF',
                { status: 'OPEN' },
            ),
        ).rejects.toThrowError('No tienes permisos para gestionar conversaciones');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'No tienes permisos para gestionar conversaciones',
        );
    });
});
