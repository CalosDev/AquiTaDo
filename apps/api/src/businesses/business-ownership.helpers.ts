import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export const activeBusinessOwnershipSelect = {
    where: {
        isActive: true,
    },
    select: {
        organizationId: true,
    },
    take: 1,
} as const;

type BusinessOrganizationRef = {
    primaryManagingOrganizationId?: string | null;
    organizationId?: string | null;
    ownerships?: Array<{
        organizationId: string;
    }> | null;
};

type BusinessOwnershipRef = {
    isActive: boolean;
};

type OwnershipHistoryBusinessRef = Record<string, unknown>;

type AdminClaimableBusinessRef = {
    deletedAt: Date | null;
    ownerships?: Array<{
        organizationId: string;
    }> | null;
};

type BuildOwnershipRevocationBusinessUpdateDataInput = {
    nextActiveOrganizationId: string | null;
    reviewedAt: Date;
    adminUserId: string;
};

type BuildAdminMarkClaimedBusinessUpdateDataInput = {
    organizationId: string;
    ownerUserId: string;
    reviewedAt: Date;
    adminUserId: string;
};

export function resolveActiveBusinessOrganizationId(
    business?: BusinessOrganizationRef | null,
): string | null {
    if (!business) {
        return null;
    }

    return business.ownerships?.[0]?.organizationId
        ?? business.primaryManagingOrganizationId
        ?? business.organizationId
        ?? null;
}

export function businessBelongsToOrganization(
    business: BusinessOrganizationRef | null | undefined,
    organizationId?: string | null,
): boolean {
    if (!business || !organizationId) {
        return false;
    }

    return resolveActiveBusinessOrganizationId(business) === organizationId;
}

export function clampOwnershipHistoryLimit(limit: number): number {
    return Math.min(Math.max(limit, 1), 100);
}

export function assertExistingOwnershipHistoryBusiness<T extends OwnershipHistoryBusinessRef>(
    business: T | null | undefined,
): T {
    if (!business) {
        throw new NotFoundException('Negocio no encontrado');
    }

    return business;
}

export function assertAdminClaimableBusiness<T extends AdminClaimableBusinessRef>(
    business: T | null | undefined,
    organizationId: string,
): { business: T; activeOwnership: { organizationId: string } | null } {
    if (!business || business.deletedAt) {
        throw new NotFoundException('Negocio no encontrado');
    }

    const activeOwnership = business.ownerships?.[0] ?? null;
    if (activeOwnership && activeOwnership.organizationId !== organizationId) {
        throw new ConflictException('Este negocio ya tiene un ownership activo en otra organizacion');
    }

    return {
        business,
        activeOwnership,
    };
}

export function assertRevocableBusinessOwnership<T extends BusinessOwnershipRef>(
    ownership: T | null | undefined,
): T {
    if (!ownership) {
        throw new NotFoundException('Ownership no encontrado');
    }

    if (!ownership.isActive) {
        throw new BadRequestException('Este ownership ya fue revocado');
    }

    return ownership;
}

export function buildOwnershipRevocationBusinessUpdateData(
    input: BuildOwnershipRevocationBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    const updateData: Prisma.BusinessUncheckedUpdateInput = {
        organizationId: input.nextActiveOrganizationId,
        primaryManagingOrganizationId: input.nextActiveOrganizationId,
        claimStatus: input.nextActiveOrganizationId ? 'CLAIMED' : 'SUSPENDED',
        isClaimable: input.nextActiveOrganizationId ? true : false,
        legacyOwnerMode: false,
        updatedByUserId: input.adminUserId,
        lastReviewedAt: input.reviewedAt,
    };

    if (!input.nextActiveOrganizationId) {
        updateData.ownerId = null;
        updateData.claimedByUserId = null;
        updateData.claimedAt = null;
    }

    return updateData;
}

export function buildAdminMarkClaimedBusinessUpdateData(
    input: BuildAdminMarkClaimedBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    return {
        ownerId: input.ownerUserId,
        organizationId: input.organizationId,
        primaryManagingOrganizationId: input.organizationId,
        claimStatus: 'CLAIMED',
        claimedAt: input.reviewedAt,
        claimedByUserId: input.ownerUserId,
        isClaimable: true,
        legacyOwnerMode: false,
        updatedByUserId: input.adminUserId,
        lastReviewedAt: input.reviewedAt,
    };
}
