import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

type BusinessSuggestionSummaryRow = {
    status: string;
    _count: {
        _all: number;
    };
};

type ReviewableBusinessSuggestionRef = {
    status: string;
};

type ApprovableBusinessSuggestionRef = {
    address: string | null;
    provinceId: string | null;
};

type ApprovedBusinessSuggestionCatalogRef = {
    name: string;
    description: string | null;
    notes: string | null;
    address: string;
    provinceId: string;
    cityId: string | null;
    phone: string | null;
    whatsapp: string | null;
    website: string | null;
    email: string | null;
    categoryId: string | null;
};

type BuildReviewedBusinessSuggestionUpdateDataInput = {
    status: 'APPROVED' | 'REJECTED';
    reviewNotes: string | null;
    existingNotes: string | null;
    adminUserId: string;
    reviewedAt: Date;
    createdBusinessId?: string;
};

type BuildReviewedBusinessSuggestionAuditMetadataInput = {
    status: 'APPROVED' | 'REJECTED';
    createdBusinessId?: string;
};

type BuildApprovedBusinessSuggestionCatalogBusinessInputInput = {
    suggestion: ApprovedBusinessSuggestionCatalogRef;
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    ignorePotentialDuplicates?: boolean;
};

export const BUSINESS_SUGGESTION_LIST_SELECT = {
    id: true,
    name: true,
    description: true,
    address: true,
    phone: true,
    whatsapp: true,
    website: true,
    email: true,
    notes: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    reviewedAt: true,
    category: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
    province: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
    city: {
        select: {
            id: true,
            name: true,
            slug: true,
        },
    },
    submittedByUser: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
    reviewedByAdmin: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
    createdBusiness: {
        select: {
            id: true,
            name: true,
            slug: true,
            claimStatus: true,
            publicStatus: true,
        },
    },
} satisfies Prisma.BusinessSuggestionSelect;

export function clampBusinessSuggestionLimit(limit?: number): number {
    return Math.min(Math.max(limit ?? 25, 1), 100);
}

export function buildBusinessSuggestionSummary(
    rows: BusinessSuggestionSummaryRow[],
): Record<string, number> {
    return rows.reduce<Record<string, number>>((accumulator, item) => {
        accumulator[item.status] = item._count._all;
        return accumulator;
    }, {});
}

export function assertReviewableBusinessSuggestion<T extends ReviewableBusinessSuggestionRef>(
    suggestion: T | null | undefined,
): T {
    if (!suggestion) {
        throw new NotFoundException('Sugerencia no encontrada');
    }

    if (suggestion.status !== 'PENDING') {
        throw new BadRequestException('Esta sugerencia ya fue revisada');
    }

    return suggestion;
}

export function assertApprovableBusinessSuggestion<T extends ApprovableBusinessSuggestionRef>(
    suggestion: T,
): T & { address: string; provinceId: string } {
    if (!suggestion.address || !suggestion.provinceId) {
        throw new BadRequestException(
            'La sugerencia no tiene datos suficientes para crear la ficha publica',
        );
    }

    return suggestion as T & { address: string; provinceId: string };
}

export function buildReviewedBusinessSuggestionUpdateData(
    input: BuildReviewedBusinessSuggestionUpdateDataInput,
): Prisma.BusinessSuggestionUncheckedUpdateInput {
    return {
        status: input.status,
        notes: input.reviewNotes ?? input.existingNotes,
        reviewedByAdminId: input.adminUserId,
        reviewedAt: input.reviewedAt,
        ...(input.createdBusinessId ? { createdBusinessId: input.createdBusinessId } : {}),
    };
}

export function buildReviewedBusinessSuggestionAuditMetadata(
    input: BuildReviewedBusinessSuggestionAuditMetadataInput,
): Prisma.InputJsonValue {
    return {
        status: input.status,
        ...(input.createdBusinessId ? { createdBusinessId: input.createdBusinessId } : {}),
    } satisfies Prisma.InputJsonObject;
}

export function buildApprovedBusinessSuggestionCatalogBusinessInput(
    input: BuildApprovedBusinessSuggestionCatalogBusinessInputInput,
) {
    return {
        name: input.suggestion.name,
        description:
            input.suggestion.description
            ?? input.suggestion.notes
            ?? 'Ficha creada desde una sugerencia moderada de la comunidad en AquiTa.do.',
        address: input.suggestion.address,
        provinceId: input.suggestion.provinceId,
        cityId: input.suggestion.cityId ?? null,
        phone: input.suggestion.phone ?? undefined,
        whatsapp: input.suggestion.whatsapp ?? undefined,
        website: input.suggestion.website,
        email: input.suggestion.email,
        categoryIds: input.suggestion.categoryId ? [input.suggestion.categoryId] : undefined,
        publicStatus: input.publicStatus ?? 'PUBLISHED',
        catalogManagedByAdmin: true,
        isClaimable: true,
        ignorePotentialDuplicates: input.ignorePotentialDuplicates,
        source: 'USER_SUGGESTION' as const,
    };
}
