import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
    normalizeClaimEvidenceType,
    normalizeCatalogSource,
    toLifecycleStatus,
} from './catalog-taxonomy.helpers';

type ClaimRequestSummaryRow = {
    status: string;
    _count: {
        _all: number;
    };
};

type ClaimRequestSnapshotRef = {
    evidenceType?: string | null;
    business?: {
        source?: string | null;
        catalogSource?: string | null;
        lifecycleStatus?: string | null;
        primaryManagingOrganizationId?: string | null;
    } | null;
};

export const CLAIM_REQUEST_DETAIL_SELECT = {
    id: true,
    businessId: true,
    requesterUserId: true,
    requesterOrganizationId: true,
    status: true,
    evidenceType: true,
    evidenceValue: true,
    notes: true,
    adminNotes: true,
    createdAt: true,
    updatedAt: true,
    reviewedAt: true,
    approvedAt: true,
    rejectedAt: true,
    expiredAt: true,
    canceledAt: true,
    business: {
        select: {
            id: true,
            name: true,
            slug: true,
            claimStatus: true,
            publicStatus: true,
            source: true,
            catalogSource: true,
            lifecycleStatus: true,
            primaryManagingOrganizationId: true,
        },
    },
    requesterUser: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
        },
    },
    requesterOrganization: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
    reviewedByAdmin: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
} satisfies Prisma.BusinessClaimRequestSelect;

export function clampClaimRequestLimit(limit?: number): number {
    return Math.min(Math.max(limit ?? 25, 1), 100);
}

export function buildClaimRequestSummary(
    rows: ClaimRequestSummaryRow[],
): Record<string, number> {
    return rows.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.status] = item._count._all;
        return accumulator;
    }, {});
}

export function assertExistingAdminClaimRequest<T>(
    claimRequest: T | null | undefined,
): T {
    if (!claimRequest) {
        throw new NotFoundException('Solicitud de reclamacion no encontrada');
    }

    return claimRequest;
}

export function hydrateClaimRequestSnapshot<T extends ClaimRequestSnapshotRef>(
    claimRequest: T,
): T {
    if (!claimRequest.business) {
        return claimRequest;
    }

    return {
        ...claimRequest,
        evidenceType: normalizeClaimEvidenceType(claimRequest.evidenceType ?? null),
        business: {
            ...claimRequest.business,
            source: claimRequest.business.source
                ?? normalizeCatalogSource(claimRequest.business.catalogSource ?? null)
                ?? null,
            catalogSource: normalizeCatalogSource(
                claimRequest.business.catalogSource ?? claimRequest.business.source ?? null,
            ),
            lifecycleStatus: toLifecycleStatus({
                lifecycleStatus: claimRequest.business.lifecycleStatus ?? null,
            }),
            primaryManagingOrganizationId: claimRequest.business.primaryManagingOrganizationId ?? null,
        },
    };
}
