import { Prisma } from '../generated/prisma/client';

type BuildExpiredClaimBusinessUpdateDataInput = {
    activeOwnershipOrganizationId: string | null;
    remainingActiveClaims: number;
    referenceDate: Date;
};

export function buildExpiredClaimBusinessUpdateData(
    input: BuildExpiredClaimBusinessUpdateDataInput,
): Prisma.BusinessUncheckedUpdateInput {
    return {
        claimStatus: input.activeOwnershipOrganizationId
            ? 'CLAIMED'
            : input.remainingActiveClaims > 0
                ? 'PENDING_CLAIM'
                : 'UNCLAIMED',
        primaryManagingOrganizationId: input.activeOwnershipOrganizationId,
        lastReviewedAt: input.referenceDate,
    };
}
