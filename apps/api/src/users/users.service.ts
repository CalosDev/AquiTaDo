import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMyProfileDto } from './dto/user.dto';

@Injectable()
export class UsersService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    private readonly userSelect = {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
        updatedAt: true,
    };

    async findById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: this.userSelect,
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        return user;
    }

    async updateMyProfile(userId: string, dto: UpdateMyProfileDto) {
        const currentUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });

        if (!currentUser) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const name = dto.name?.trim();
        const phone = dto.phone?.trim();
        const avatarUrl = dto.avatarUrl?.trim();

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(name !== undefined ? { name } : {}),
                ...(phone !== undefined ? { phone: phone || null } : {}),
                ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl || null } : {}),
            },
            select: this.userSelect,
        });
    }

    async getMyProfileDetails(userId: string) {
        const user = await this.findById(userId);

        const [reviewCount, bookingCount, recentReviews, recentBookings] = await Promise.all([
            this.prisma.review.count({
                where: { userId },
            }),
            this.prisma.booking.count({
                where: { userId },
            }),
            this.prisma.review.findMany({
                where: { userId },
                select: {
                    id: true,
                    rating: true,
                    comment: true,
                    moderationStatus: true,
                    createdAt: true,
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 8,
            }),
            this.prisma.booking.findMany({
                where: { userId },
                select: {
                    id: true,
                    status: true,
                    scheduledFor: true,
                    quotedAmount: true,
                    depositAmount: true,
                    currency: true,
                    createdAt: true,
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 8,
            }),
        ]);

        if (user.role === Role.ADMIN) {
            const [
                totalUsers,
                totalOrganizations,
                totalBusinesses,
                totalReviews,
                totalBookings,
                totalTransactions,
                flaggedReviews,
                latestOrganizations,
            ] = await Promise.all([
                this.prisma.user.count(),
                this.prisma.organization.count(),
                this.prisma.business.count(),
                this.prisma.review.count(),
                this.prisma.booking.count(),
                this.prisma.transaction.count(),
                this.prisma.review.findMany({
                    where: {
                        moderationStatus: 'FLAGGED',
                    },
                    select: {
                        id: true,
                        rating: true,
                        comment: true,
                        moderationReason: true,
                        createdAt: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        business: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                }),
                this.prisma.organization.findMany({
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        createdAt: true,
                        subscriptionStatus: true,
                        plan: true,
                        _count: {
                            select: {
                                businesses: true,
                                members: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                }),
            ]);

            return {
                profileType: 'ADMIN' as const,
                user,
                userProfile: {
                    reviewCount,
                    bookingCount,
                    recentReviews,
                    recentBookings,
                },
                adminProfile: {
                    metrics: {
                        totalUsers,
                        totalOrganizations,
                        totalBusinesses,
                        totalReviews,
                        totalBookings,
                        totalTransactions,
                    },
                    flaggedReviews,
                    latestOrganizations,
                },
            };
        }

        if (user.role === Role.BUSINESS_OWNER) {
            const organizations = await this.prisma.organization.findMany({
                where: {
                    OR: [
                        { ownerUserId: userId },
                        { members: { some: { userId } } },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    ownerUserId: true,
                    plan: true,
                    subscriptionStatus: true,
                    createdAt: true,
                    members: {
                        where: {
                            userId,
                        },
                        select: {
                            role: true,
                        },
                        take: 1,
                    },
                    businesses: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            verified: true,
                            verificationStatus: true,
                            createdAt: true,
                            _count: {
                                select: {
                                    reviews: true,
                                    bookings: true,
                                },
                            },
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                    _count: {
                        select: {
                            members: true,
                            businesses: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            return {
                profileType: 'BUSINESS_OWNER' as const,
                user,
                userProfile: {
                    reviewCount,
                    bookingCount,
                    recentReviews,
                    recentBookings,
                },
                businessProfile: {
                    organizations: organizations.map((organization) => ({
                        ...organization,
                        myRole:
                            organization.ownerUserId === userId
                                ? 'OWNER'
                                : organization.members[0]?.role ?? 'STAFF',
                    })),
                },
            };
        }

        return {
            profileType: 'USER' as const,
            user,
            userProfile: {
                reviewCount,
                bookingCount,
                recentReviews,
                recentBookings,
            },
        };
    }

    async findAll() {
        return this.prisma.user.findMany({
            select: this.userSelect,
            orderBy: { createdAt: 'desc' },
        });
    }
}
