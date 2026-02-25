import {
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { BusinessTier, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ReputationService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async recalculateBusinessReputation(
        businessId: string,
        prismaClient?: PrismaClientLike,
    ) {
        const tx = prismaClient ?? this.prisma;

        const business = await tx.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                verified: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        const [reviewStats, completedBookings, transactionStats] = await Promise.all([
            tx.review.aggregate({
                where: {
                    businessId,
                    moderationStatus: 'APPROVED',
                },
                _avg: {
                    rating: true,
                },
                _count: {
                    _all: true,
                },
            }),
            tx.booking.count({
                where: {
                    businessId,
                    status: 'COMPLETED',
                },
            }),
            tx.transaction.aggregate({
                where: {
                    businessId,
                    status: 'SUCCEEDED',
                },
                _sum: {
                    grossAmount: true,
                },
            }),
        ]);

        const averageRating = Number(reviewStats._avg.rating ?? 0);
        const reviewCount = reviewStats._count._all;
        const grossRevenue = Number(transactionStats._sum.grossAmount?.toString() ?? '0');

        const ratingScore = (averageRating / 5) * 60;
        const reviewVolumeScore = (Math.min(reviewCount, 100) / 100) * 15;
        const completionScore = (Math.min(completedBookings, 200) / 200) * 15;
        const revenueScore = (Math.min(grossRevenue, 500_000) / 500_000) * 10;
        const verifiedBonus = business.verified ? 5 : 0;

        const score = Math.min(
            100,
            Math.round((ratingScore + reviewVolumeScore + completionScore + revenueScore + verifiedBonus) * 100) / 100,
        );

        const tier = this.resolveTier(score);

        return tx.business.update({
            where: { id: businessId },
            data: {
                reputationScore: score.toFixed(2),
                reputationTier: tier,
            },
            select: {
                id: true,
                name: true,
                verified: true,
                reputationScore: true,
                reputationTier: true,
            },
        });
    }

    async getRankings(provinceId?: string, limit = 20) {
        const take = Math.min(Math.max(limit, 1), 100);
        const where: Prisma.BusinessWhereInput = {
            verified: true,
        };

        if (provinceId) {
            where.provinceId = provinceId;
        }

        const businesses = await this.prisma.business.findMany({
            where,
            select: {
                id: true,
                name: true,
                slug: true,
                reputationScore: true,
                reputationTier: true,
                verified: true,
                province: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                city: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: [
                { reputationScore: 'desc' },
                { updatedAt: 'desc' },
            ],
            take,
        });

        const businessIds = businesses.map((business) => business.id);

        const reviewStats = businessIds.length > 0
            ? await this.prisma.review.groupBy({
                by: ['businessId'],
                where: {
                    businessId: { in: businessIds },
                    moderationStatus: 'APPROVED',
                },
                _avg: { rating: true },
                _count: { _all: true },
            })
            : [];

        const reviewMap = new Map<string, {
            averageRating: number;
            reviewCount: number;
        }>();
        for (const row of reviewStats) {
            reviewMap.set(row.businessId, {
                averageRating: Number(row._avg.rating ?? 0),
                reviewCount: row._count._all,
            });
        }

        return businesses.map((business, index) => {
            const review = reviewMap.get(business.id);
            return {
                rank: index + 1,
                id: business.id,
                name: business.name,
                slug: business.slug,
                verified: business.verified,
                province: business.province,
                city: business.city,
                reputation: {
                    score: Number(business.reputationScore.toString()),
                    tier: business.reputationTier,
                    averageRating: review?.averageRating ?? 0,
                    reviewCount: review?.reviewCount ?? 0,
                },
            };
        });
    }

    async getBusinessProfile(businessId: string) {
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                verified: true,
                verifiedAt: true,
                reputationScore: true,
                reputationTier: true,
                province: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                city: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        const [reviewStats, bookingStats, transactionStats] = await Promise.all([
            this.prisma.review.aggregate({
                where: {
                    businessId,
                    moderationStatus: 'APPROVED',
                },
                _avg: { rating: true },
                _count: { _all: true },
            }),
            this.prisma.booking.groupBy({
                by: ['status'],
                where: { businessId },
                _count: { _all: true },
            }),
            this.prisma.transaction.aggregate({
                where: {
                    businessId,
                    status: 'SUCCEEDED',
                },
                _sum: {
                    grossAmount: true,
                },
                _count: {
                    _all: true,
                },
            }),
        ]);

        const bookingStatusMap = new Map<string, number>();
        for (const row of bookingStats) {
            bookingStatusMap.set(row.status, row._count._all);
        }

        return {
            business: {
                ...business,
                reputationScore: Number(business.reputationScore.toString()),
            },
            metrics: {
                averageRating: Number(reviewStats._avg.rating ?? 0),
                reviewCount: reviewStats._count._all,
                bookings: {
                    pending: bookingStatusMap.get('PENDING') ?? 0,
                    confirmed: bookingStatusMap.get('CONFIRMED') ?? 0,
                    completed: bookingStatusMap.get('COMPLETED') ?? 0,
                    canceled: bookingStatusMap.get('CANCELED') ?? 0,
                    noShow: bookingStatusMap.get('NO_SHOW') ?? 0,
                },
                successfulTransactions: transactionStats._count._all,
                grossRevenue: Number(transactionStats._sum.grossAmount?.toString() ?? '0'),
            },
        };
    }

    private resolveTier(score: number): BusinessTier {
        if (score >= 80) {
            return 'GOLD';
        }
        if (score >= 55) {
            return 'SILVER';
        }
        return 'BRONZE';
    }
}
