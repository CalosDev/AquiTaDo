import { Prisma } from '../generated/prisma/client';

type NonMergedDuplicateCaseResolutionStatus = 'DISMISSED' | 'CONFLICT';

type BuildNonMergedDuplicateCaseResolutionInput = {
    status: NonMergedDuplicateCaseResolutionStatus;
    businessIds: string[];
    reasons: string[];
    adminUserId: string;
    resolutionNotes: string | null;
    resolvedAt: Date;
};

type BuildNonMergedDuplicateCaseCreateInput = BuildNonMergedDuplicateCaseResolutionInput & {
    clusterKey: string;
};

type BuildNonMergedDuplicateCaseAuditMetadataInput = {
    status: NonMergedDuplicateCaseResolutionStatus;
    businessIds: string[];
    reasons: string[];
};

type MergedDuplicateCaseTransferredSummary = {
    categories: number;
    features: number;
    hours: number;
    images: number;
    analyticsRows: number;
    growthEvents: number;
    checkIns: number;
    claimRequests: number;
    reviews: number;
    favorites: number;
    listItems: number;
    notificationJobs: number;
};

type BuildMergedDuplicateCaseResolutionMetaInput = {
    primaryBusinessId: string;
    archivedBusinessIds: string[];
    transferred: MergedDuplicateCaseTransferredSummary;
};

type BuildMergedDuplicateCaseResolutionInput = {
    businessIds: string[];
    reasons: string[];
    primaryBusinessId: string;
    adminUserId: string;
    resolutionNotes: string | null;
    resolutionMeta: Prisma.InputJsonValue;
    resolvedAt: Date;
};

type BuildMergedDuplicateCaseCreateInput = BuildMergedDuplicateCaseResolutionInput & {
    clusterKey: string;
};

type BuildMergedDuplicateCaseAuditMetadataInput = {
    clusterKey: string;
    primaryBusinessId: string;
    archivedBusinessIds: string[];
    transferred: MergedDuplicateCaseTransferredSummary;
};

export const NON_MERGED_DUPLICATE_CASE_RESOLUTION_SELECT = {
    id: true,
    clusterKey: true,
    status: true,
    businessIds: true,
    reasons: true,
    resolutionNotes: true,
    resolvedAt: true,
} satisfies Prisma.BusinessDuplicateCaseSelect;

export const MERGED_DUPLICATE_CASE_RESOLUTION_SELECT = {
    id: true,
    clusterKey: true,
    status: true,
    businessIds: true,
    reasons: true,
    primaryBusinessId: true,
    resolutionNotes: true,
    resolutionMeta: true,
    resolvedAt: true,
} satisfies Prisma.BusinessDuplicateCaseSelect;

export function buildNonMergedDuplicateCaseUpdateData(
    input: BuildNonMergedDuplicateCaseResolutionInput,
): Prisma.BusinessDuplicateCaseUncheckedUpdateInput {
    return {
        status: input.status,
        businessIds: input.businessIds,
        reasons: input.reasons.length > 0 ? input.reasons : Prisma.JsonNull,
        primaryBusinessId: null,
        resolvedByAdminId: input.adminUserId,
        resolutionNotes: input.resolutionNotes,
        resolutionMeta: Prisma.JsonNull,
        resolvedAt: input.resolvedAt,
    };
}

export function buildNonMergedDuplicateCaseCreateData(
    input: BuildNonMergedDuplicateCaseCreateInput,
): Prisma.BusinessDuplicateCaseUncheckedCreateInput {
    return {
        clusterKey: input.clusterKey,
        status: input.status,
        businessIds: input.businessIds,
        reasons: input.reasons.length > 0 ? input.reasons : Prisma.JsonNull,
        resolvedByAdminId: input.adminUserId,
        resolutionNotes: input.resolutionNotes,
        resolvedAt: input.resolvedAt,
    };
}

export function buildNonMergedDuplicateCaseAuditMetadata(
    input: BuildNonMergedDuplicateCaseAuditMetadataInput,
): Prisma.InputJsonValue {
    return {
        status: input.status,
        businessIds: input.businessIds,
        reasons: input.reasons,
    } satisfies Prisma.InputJsonObject;
}

export function buildMergedDuplicateCaseResolutionMeta(
    input: BuildMergedDuplicateCaseResolutionMetaInput,
): Prisma.InputJsonValue {
    return {
        mergedIntoBusinessId: input.primaryBusinessId,
        archivedBusinessIds: input.archivedBusinessIds,
        transferred: input.transferred,
    } satisfies Prisma.InputJsonObject;
}

export function buildMergedDuplicateCaseUpdateData(
    input: BuildMergedDuplicateCaseResolutionInput,
): Prisma.BusinessDuplicateCaseUncheckedUpdateInput {
    return {
        status: 'MERGED',
        businessIds: input.businessIds,
        reasons: input.reasons.length > 0 ? input.reasons : Prisma.JsonNull,
        primaryBusinessId: input.primaryBusinessId,
        resolvedByAdminId: input.adminUserId,
        resolutionNotes: input.resolutionNotes,
        resolutionMeta: input.resolutionMeta,
        resolvedAt: input.resolvedAt,
    };
}

export function buildMergedDuplicateCaseCreateData(
    input: BuildMergedDuplicateCaseCreateInput,
): Prisma.BusinessDuplicateCaseUncheckedCreateInput {
    return {
        clusterKey: input.clusterKey,
        status: 'MERGED',
        businessIds: input.businessIds,
        reasons: input.reasons.length > 0 ? input.reasons : Prisma.JsonNull,
        primaryBusinessId: input.primaryBusinessId,
        resolvedByAdminId: input.adminUserId,
        resolutionNotes: input.resolutionNotes,
        resolutionMeta: input.resolutionMeta,
        resolvedAt: input.resolvedAt,
    };
}

export function buildMergedDuplicateCaseAuditMetadata(
    input: BuildMergedDuplicateCaseAuditMetadataInput,
): Prisma.InputJsonValue {
    return {
        status: 'MERGED',
        clusterKey: input.clusterKey,
        primaryBusinessId: input.primaryBusinessId,
        archivedBusinessIds: input.archivedBusinessIds,
        transferred: input.transferred,
    } satisfies Prisma.InputJsonObject;
}
