import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentsReportingService } from './payments-reporting.service';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookService } from './payments-webhook.service';

function createPaymentsService() {
    const prisma = {};
    const configService = {
        get: vi.fn(),
    };
    const subscriptionsService = {};
    const circuitBreaker = {};
    const paymentsReportingService = {};
    const paymentsWebhookService = {};
    const organizationAccessService = {
        assertOwner: vi.fn((role: string, message?: string) => {
            if (role !== 'OWNER') {
                throw new ForbiddenException(message);
            }
        }),
    };

    return {
        service: new PaymentsService(
            prisma as PrismaService,
            configService as never,
            subscriptionsService as SubscriptionsService,
            circuitBreaker as CircuitBreakerService,
            paymentsReportingService as PaymentsReportingService,
            paymentsWebhookService as PaymentsWebhookService,
            organizationAccessService as unknown as OrganizationAccessService,
        ),
        organizationAccessService,
    };
}

describe('PaymentsService billing access', () => {
    it('rejects non-owner roles for ads wallet billing actions', async () => {
        const { service, organizationAccessService } = createPaymentsService();

        await expect(
            service.createAdsWalletCheckoutSession(
                'org-1',
                'MANAGER',
                'user-1',
                {
                    amount: 50,
                    successUrl: 'https://example.com/success',
                    cancelUrl: 'https://example.com/cancel',
                },
            ),
        ).rejects.toThrowError('Solo el owner puede gestionar la facturacion');

        expect(organizationAccessService.assertOwner).toHaveBeenCalledWith(
            'MANAGER',
            'Solo el owner puede gestionar la facturacion',
        );
    });
});
