import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResourcePolicy } from './policy.types';

type Principal = {
    id: string;
    role: string;
};

type OrganizationContext = {
    organizationId: string;
    organizationRole: OrganizationRole | null;
    isGlobalAdmin: boolean;
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
        if (principal.role === 'ADMIN') {
            return;
        }

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
        if (action === 'create') {
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
            },
        });

        if (!business) {
            throw new NotFoundException('Business not found');
        }

        if (business.organizationId !== organizationContext.organizationId) {
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
