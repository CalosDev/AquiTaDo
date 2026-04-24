import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

type ReviewableBusinessClaimRequestRef = {
    status: string;
};

type ActiveOwnershipRef = {
    id: string;
    organizationId: string;
};

type BuildUnderReviewClaimBusinessUpdateDataInput = {
    activeOwnershipOrganizationId: string | null;
    reviewedAt: Date;
    adminUserId: string;
};

type BuildApprovedClaimBusinessUpdateDataInput = {
    requesterUserId: string;
    effectiveOrganizationId: string;
    reviewedAt: Date;
    adminUserId: string;
};

type BuildRejectedClaimBusinessUpdateDataInput = {
    remainingActiveClaims: number;
    activeOwnershipOrganizationId: string | null;
    reviewedAt: Date;
    adminUserId: string;
};

export function assertReviewableBusinessClaimRequest<T extends ReviewableBusinessClaimRequestRef>(
    claimRequest: T | null | undefined,
): T {
    if (!claimRequest) {
        throw new NotFoundException('Solicitud de reclamacion no encontrada');
    }

    if (claimRequest.status !== 'PENDING' && claimRequest.status !== 'UNDER_REVIEW') {
        throw new BadRequestException('Esta solicitud ya fue revisada');
    }

    return claimRequest;
}

export function assertApprovableClaimReview<T extends ActiveOwnershipRef>(
    activeOwnership: T | null | undefined,
): T | null {
    if (activeOwnership) {
        throw new ConflictException('El negocio ya tiene un ownership activo');
    }

    return activeOwnership ?? null;
}

export function buildUnderReviewClaimBusinessUpdateData(
    input: BuildUnderReviewClaimBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    return {
        claimStatus: input.activeOwnershipOrganizationId ? 'CLAIMED' : 'PENDING_CLAIM',
        primaryManagingOrganizationId: input.activeOwnershipOrganizationId,
        updatedByUserId: input.adminUserId,
        lastReviewedAt: input.reviewedAt,
    };
}

export function buildApprovedClaimBusinessUpdateData(
    input: BuildApprovedClaimBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    return {
        ownerId: input.requesterUserId,
        organizationId: input.effectiveOrganizationId,
        primaryManagingOrganizationId: input.effectiveOrganizationId,
        claimStatus: 'CLAIMED',
        claimedAt: input.reviewedAt,
        claimedByUserId: input.requesterUserId,
        legacyOwnerMode: false,
        updatedByUserId: input.adminUserId,
        lastReviewedAt: input.reviewedAt,
    };
}

export function buildRejectedClaimBusinessUpdateData(
    input: BuildRejectedClaimBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    return {
        claimStatus: input.activeOwnershipOrganizationId
            ? 'CLAIMED'
            : input.remainingActiveClaims > 0
                ? 'PENDING_CLAIM'
                : 'UNCLAIMED',
        primaryManagingOrganizationId: input.activeOwnershipOrganizationId,
        updatedByUserId: input.adminUserId,
        lastReviewedAt: input.reviewedAt,
    };
}
