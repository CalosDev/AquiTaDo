import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsQueueService } from '../notifications/notifications.queue.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { UploadsService } from '../uploads/uploads.service';
import { VerificationService } from './verification.service';

function createVerificationService() {
    const prisma = {
        $transaction: vi.fn(),
    };
    const configService = {
        get: vi.fn(),
    };
    const reputationService = {};
    const notificationsQueueService = {};
    const uploadsService = {
        uploadVerificationDocument: vi.fn(),
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
        service: new VerificationService(
            prisma as unknown as PrismaService,
            configService as unknown as ConfigService,
            reputationService as ReputationService,
            notificationsQueueService as NotificationsQueueService,
            uploadsService as unknown as UploadsService,
            organizationAccessService as unknown as OrganizationAccessService,
        ),
        organizationAccessService,
    };
}

describe('VerificationService organization access', () => {
    it('delegates document submission membership checks to OrganizationAccessService', async () => {
        const { service, organizationAccessService } = createVerificationService();

        await expect(
            service.submitDocument(
                'org-1',
                'USER',
                null,
                {
                    businessId: '11111111-1111-4111-8111-111111111111',
                    documentType: 'ID_CARD',
                    fileUrl: '/uploads/verification/doc.pdf',
                },
            ),
        ).rejects.toThrowError('No tienes permisos para subir documentos de verificación');

        expect(organizationAccessService.assertOrganizationMember).toHaveBeenCalledWith(
            null,
            'No tienes permisos para subir documentos de verificación',
        );
    });

    it('delegates business verification management checks to OrganizationAccessService', async () => {
        const { service, organizationAccessService } = createVerificationService();

        await expect(
            service.submitBusinessForReview(
                'org-1',
                '22222222-2222-4222-8222-222222222222',
                'USER',
                'STAFF',
                {},
            ),
        ).rejects.toThrowError('No tienes permisos para enviar verificaciones');

        expect(organizationAccessService.assertCanManageOrganization).toHaveBeenCalledWith(
            'STAFF',
            'No tienes permisos para enviar verificaciones',
        );
    });
});
