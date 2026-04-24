import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { SubscriptionsService } from './subscriptions.service';

function createSubscriptionsService() {
    const prisma = {};
    const plansService = {};
    const configService = {
        get: vi.fn(),
    };
    const circuitBreaker = {};
    const organizationAccessService = {
        assertOwner: vi.fn((role: string, message?: string) => {
            if (role !== 'OWNER') {
                throw new ForbiddenException(message);
            }
        }),
    };

    return {
        service: new SubscriptionsService(
            prisma as PrismaService,
            plansService as PlansService,
            configService as never,
            circuitBreaker as CircuitBreakerService,
            organizationAccessService as unknown as OrganizationAccessService,
        ),
        organizationAccessService,
    };
}

describe('SubscriptionsService billing access', () => {
    it('rejects non-owner roles for subscription checkout actions', async () => {
        const { service, organizationAccessService } = createSubscriptionsService();

        await expect(
            service.createCheckoutSession('org-1', 'MANAGER', {
                planCode: 'GROWTH',
                successUrl: 'https://example.com/success',
                cancelUrl: 'https://example.com/cancel',
            }),
        ).rejects.toThrowError('Solo el owner puede gestionar la facturación');

        expect(organizationAccessService.assertOwner).toHaveBeenCalledWith(
            'MANAGER',
            'Solo el owner puede gestionar la facturación',
        );
    });
});
