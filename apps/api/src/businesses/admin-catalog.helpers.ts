import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

type AdminCatalogBusinessRef = {
    deletedAt: Date | null;
};

type BuildAdminPublicationUpdateDataInput = {
    shouldPublish: boolean;
    reviewedAt: Date;
    firstPublishedAt: Date | null;
    adminUserId: string;
};

export function assertActiveAdminCatalogBusiness<T extends AdminCatalogBusinessRef>(
    business: T | null | undefined,
): T {
    if (!business || business.deletedAt) {
        throw new NotFoundException('Negocio no encontrado');
    }

    return business;
}

export function buildAdminPublicationUpdateData(
    input: BuildAdminPublicationUpdateDataInput,
): Prisma.BusinessUpdateInput {
    const publicationTimestamp = input.shouldPublish ? input.reviewedAt : null;
    const updateData: Prisma.BusinessUpdateInput = {
        publicStatus: input.shouldPublish ? 'PUBLISHED' : 'ARCHIVED',
        lifecycleStatus: input.shouldPublish ? 'PUBLISHED' : 'ARCHIVED',
        isActive: true,
        isPublished: input.shouldPublish,
        isSearchable: input.shouldPublish,
        isDiscoverable: input.shouldPublish,
        updatedByUser: {
            connect: {
                id: input.adminUserId,
            },
        },
        lastReviewedAt: input.reviewedAt,
    };

    if (input.shouldPublish) {
        updateData.publishedAt = publicationTimestamp;
        updateData.firstPublishedAt = input.firstPublishedAt ?? publicationTimestamp;
    } else {
        updateData.publishedAt = null;
    }

    return updateData;
}
