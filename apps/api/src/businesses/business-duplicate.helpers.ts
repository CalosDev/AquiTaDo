import { Prisma } from '../generated/prisma/client';

type BusinessDuplicateCaseSummaryRow = {
    status: string;
    _count: {
        _all: number;
    };
};

export const DUPLICATE_CASE_LIST_SELECT = {
    id: true,
    clusterKey: true,
    status: true,
    businessIds: true,
    reasons: true,
    primaryBusinessId: true,
    resolutionNotes: true,
    resolutionMeta: true,
    resolvedAt: true,
    createdAt: true,
    updatedAt: true,
    primaryBusiness: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
    resolvedByAdmin: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
} satisfies Prisma.BusinessDuplicateCaseSelect;

export function clampDuplicateCaseLimit(limit?: number): number {
    return Math.min(Math.max(limit ?? 25, 1), 100);
}

export function buildDuplicateCaseSummary(
    rows: BusinessDuplicateCaseSummaryRow[],
): Record<string, number> {
    return rows.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.status] = item._count._all;
        return accumulator;
    }, {});
}
