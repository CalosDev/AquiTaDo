import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationRole, Role } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourcePolicy } from './policy.types';

type Principal = {
    id: string;
    role: Role;
};

type OrganizationContext = {
    organizationId: string;
    organizationRole: OrganizationRole | null;
} | null;

@Injectable()
export class PolicyService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Enforces resource-level policies (RBAC + ABAC).
     */
    async assertAuthorized(
        principal: Principal,
        organizationContext: OrganizationContext,
        policy: ResourcePolicy,
        resourceId?: string,
    ): Promise<void> {
        if (policy.resource === 'business') {
            await this.assertBusinessPolicy(principal, organizationContext, policy.action, resourceId);
            return;
        }

        throw new ForbiddenException('No policy resolver configured for resource');
    }

    private async assertBusinessPolicy(
        principal: Principal,
        organizationContext: OrganizationContext,
        action: ResourcePolicy['action'],
        resourceId?: string,
    ): Promise<void> {
        if (principal.role === 'ADMIN') {
            return;
        }

        if (action === 'create') {
            if (principal.role !== 'BUSINESS_OWNER') {
                throw new ForbiddenException('Only BUSINESS_OWNER can create businesses');
            }

            if (!organizationContext?.organizationId) {
                return;
            }

            const orgRoleForCreate = organizationContext.organizationRole;
            const canManageByRoleForCreate = orgRoleForCreate === 'OWNER' || orgRoleForCreate === 'MANAGER';
            if (!canManageByRoleForCreate) {
                throw new ForbiddenException('Insufficient permissions to create business');
            }
            return;
        }

        if (!organizationContext?.organizationId) {
            throw new ForbiddenException('Missing organization context');
        }

        const orgRole = organizationContext.organizationRole;
        const canManageByRole = orgRole === 'OWNER' || orgRole === 'MANAGER';

        if (action === 'read') {
            return;
        }

        if (!resourceId) {
            throw new ForbiddenException('Resource identifier is required for this action');
        }

        const business = await this.prisma.business.findUnique({
            where: { id: resourceId },
            select: {
                id: true,
                organizationId: true,
                ownerId: true,
                ownerships: {
                    where: {
                        organizationId: organizationContext.organizationId,
                        isActive: true,
                    },
                    select: {
                        id: true,
                    },
                    take: 1,
                },
            },
        });

        if (!business) {
            throw new NotFoundException('Business not found');
        }

        const belongsToActiveOrganization = business.ownerships.length > 0
            || business.organizationId === organizationContext.organizationId;

        if (!belongsToActiveOrganization) {
            throw new ForbiddenException('Resource does not belong to active organization');
        }

        if (action === 'update' || action === 'delete' || action === 'manage') {
            if (canManageByRole) {
                return;
            }

            if (business.ownerId === principal.id) {
                return;
            }

            throw new ForbiddenException('Insufficient permissions for this business');
        }
    }
}
