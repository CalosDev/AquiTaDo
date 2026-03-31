import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    OrganizationPlan,
    OrganizationSubscriptionStatus,
    Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getOrganizationPlanLimits } from './organization-plan-limits';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface OrganizationUsageSnapshot {
    plan: OrganizationPlan;
    subscriptionStatus: OrganizationSubscriptionStatus;
    limits: ReturnType<typeof getOrganizationPlanLimits>;
    usage: {
        businesses: number;
        members: number;
        pendingInvites: number;
        allocatedSeats: number;
    };
    remaining: {
        businesses: number | null;
        seats: number | null;
    };
}

@Injectable()
export class OrganizationsUsageService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async getUsageSnapshot(
        client: PrismaClientLike,
        organizationId: string,
        planOverride?: OrganizationPlan,
    ): Promise<OrganizationUsageSnapshot> {
        const organization = await client.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                plan: true,
                subscriptionStatus: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organizacion no encontrada');
        }

        const effectivePlan = planOverride ?? organization.plan;
        const limits = getOrganizationPlanLimits(effectivePlan);

        const [businesses, members, pendingInvites] = await Promise.all([
            client.business.count({
                where: { organizationId },
            }),
            client.organizationMember.count({
                where: { organizationId },
            }),
            client.organizationInvite.count({
                where: {
                    organizationId,
                    acceptedAt: null,
                    expiresAt: {
                        gt: new Date(),
                    },
                },
            }),
        ]);

        const allocatedSeats = members + pendingInvites;

        return {
            plan: effectivePlan,
            subscriptionStatus: organization.subscriptionStatus,
            limits,
            usage: {
                businesses,
                members,
                pendingInvites,
                allocatedSeats,
            },
            remaining: {
                businesses:
                    limits.maxBusinesses === null
                        ? null
                        : Math.max(limits.maxBusinesses - businesses, 0),
                seats:
                    limits.maxMembers === null
                        ? null
                        : Math.max(limits.maxMembers - allocatedSeats, 0),
            },
        };
    }

    assertPlanSupportsCurrentUsage(
        targetPlan: OrganizationPlan,
        currentBusinesses: number,
        currentAllocatedSeats: number,
    ): void {
        const limits = getOrganizationPlanLimits(targetPlan);

        if (limits.maxBusinesses !== null && currentBusinesses > limits.maxBusinesses) {
            throw new BadRequestException(
                `No puedes cambiar al plan ${targetPlan} porque excede el limite de negocios`,
            );
        }

        if (limits.maxMembers !== null && currentAllocatedSeats > limits.maxMembers) {
            throw new BadRequestException(
                `No puedes cambiar al plan ${targetPlan} porque excede el limite de miembros`,
            );
        }
    }

    async assertCanAllocateSeat(
        client: PrismaClientLike,
        organizationId: string,
        allocatingNewSeat: boolean,
    ): Promise<void> {
        const usageSnapshot = await this.getUsageSnapshot(client, organizationId);

        if (usageSnapshot.subscriptionStatus === 'CANCELED') {
            throw new ForbiddenException('La suscripcion de la organizacion esta cancelada');
        }

        if (!allocatingNewSeat) {
            return;
        }

        if (
            usageSnapshot.limits.maxMembers !== null &&
            usageSnapshot.usage.allocatedSeats >= usageSnapshot.limits.maxMembers
        ) {
            throw new BadRequestException('La organizacion alcanzo el limite de miembros de su plan');
        }
    }
}
