import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    evaluatePreventiveModerationSnapshot,
    type PreventiveModerationResult,
} from './preventive-moderation';

export type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export const businessVerificationDocumentInclude = {
    business: {
        select: {
            id: true,
            name: true,
            slug: true,
            verificationStatus: true,
            verified: true,
        },
    },
    reviewedByUser: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
} satisfies Prisma.BusinessVerificationDocumentInclude;

export async function evaluatePreventiveModerationForBusiness(
    prismaClient: PrismaClientLike,
    businessId: string,
): Promise<PreventiveModerationResult> {
    const business = await prismaClient.business.findUnique({
        where: { id: businessId },
        select: {
            id: true,
            ownerId: true,
            organizationId: true,
            provinceId: true,
            name: true,
            description: true,
            address: true,
            phone: true,
            whatsapp: true,
            website: true,
            email: true,
            verificationStatus: true,
            verificationNotes: true,
        },
    });

    if (!business) {
        throw new NotFoundException('Negocio no encontrado');
    }

    const [
        ownerBusinessBurst,
        duplicateListingCount,
        duplicatePhoneCount,
        duplicateWhatsappCount,
        duplicateEmailCount,
        duplicateWebsiteCount,
    ] = await Promise.all([
        prismaClient.business.count({
            where: {
                ownerId: business.ownerId,
                deletedAt: null,
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
        }),
        prismaClient.business.count({
            where: {
                id: { not: business.id },
                deletedAt: null,
                organizationId: { not: business.organizationId },
                provinceId: business.provinceId,
                name: {
                    equals: business.name,
                    mode: 'insensitive',
                },
                address: {
                    equals: business.address,
                    mode: 'insensitive',
                },
            },
        }),
        countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'phone', business.phone),
        countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'whatsapp', business.whatsapp),
        countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'email', business.email),
        countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'website', business.website),
    ]);

    return evaluatePreventiveModerationSnapshot({
        name: business.name,
        description: business.description,
        phone: business.phone,
        whatsapp: business.whatsapp,
        website: business.website,
        email: business.email,
        verificationStatus: business.verificationStatus,
        verificationNotes: business.verificationNotes,
        ownerBusinessBurst,
        duplicateListingCount,
        duplicatePhoneCount,
        duplicateWhatsappCount,
        duplicateEmailCount,
        duplicateWebsiteCount,
    });
}

export async function recalculateBusinessRiskScore(
    prismaClient: PrismaClientLike,
    businessId: string,
): Promise<number> {
    const [spamReviews, flaggedReviews, rejectedDocs, noShowBookings] = await Promise.all([
        prismaClient.review.count({
            where: {
                businessId,
                isSpam: true,
            },
        }),
        prismaClient.review.count({
            where: {
                businessId,
                moderationStatus: 'FLAGGED',
            },
        }),
        prismaClient.businessVerificationDocument.count({
            where: {
                businessId,
                status: 'REJECTED',
            },
        }),
        prismaClient.booking.count({
            where: {
                businessId,
                status: 'NO_SHOW',
            },
        }),
    ]);

    const score = Math.min(
        100,
        spamReviews * 20 + flaggedReviews * 10 + rejectedDocs * 15 + noShowBookings * 2,
    );

    await prismaClient.business.update({
        where: { id: businessId },
        data: { riskScore: score },
    });

    return score;
}

export async function recordPreventiveModerationGrowthEvent(
    prismaClient: PrismaClientLike,
    eventType: 'PREMODERATION_FLAGGED'
    | 'PREMODERATION_RELEASED'
    | 'PREMODERATION_CONFIRMED',
    businessId: string,
    organizationId: string | null,
    userId: string | null,
    metadata: Record<string, unknown>,
) {
    await prismaClient.growthEvent.create({
        data: {
            eventType,
            businessId,
            organizationId,
            userId,
            metadata: metadata as Prisma.InputJsonValue,
        },
    });
}

async function countDuplicateBusinessField(
    prismaClient: PrismaClientLike,
    businessId: string,
    organizationId: string | null,
    field: 'phone' | 'whatsapp' | 'email' | 'website',
    rawValue?: string | null,
): Promise<number> {
    const value = rawValue?.trim();
    if (!value) {
        return 0;
    }

    return prismaClient.business.count({
        where: {
            id: { not: businessId },
            deletedAt: null,
            ...(organizationId ? { organizationId: { not: organizationId } } : {}),
            [field]: {
                equals: value,
                mode: 'insensitive',
            },
        },
    });
}
