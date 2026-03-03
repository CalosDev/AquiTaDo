import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckInDto, ListMyCheckInsQueryDto } from './dto/checkins.dto';

const CHECKIN_COOLDOWN_HOURS = 8;
const MAX_CHECKINS_PER_DAY = 12;
const VERIFIED_DISTANCE_METERS = 1_200;

function startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toUtcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
    const copy = new Date(date.getTime());
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
}

function haversineDistanceMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeters = 6_371_000;
    const deltaLatitude = toRad(latitudeB - latitudeA);
    const deltaLongitude = toRad(longitudeB - longitudeA);
    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(toRad(latitudeA))
        * Math.cos(toRad(latitudeB))
        * Math.sin(deltaLongitude / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(earthRadiusMeters * c);
}

function resolveLoyaltyTier(points: number): 'NUEVO' | 'EXPLORADOR' | 'LOCAL_PRO' | 'EMBAJADOR' {
    if (points >= 500) {
        return 'EMBAJADOR';
    }
    if (points >= 200) {
        return 'LOCAL_PRO';
    }
    if (points >= 50) {
        return 'EXPLORADOR';
    }
    return 'NUEVO';
}

@Injectable()
export class CheckInsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async createCheckIn(userId: string, dto: CreateCheckInDto) {
        const now = new Date();
        const dayStart = startOfUtcDay(now);

        const [user, business, previousCheckInForBusiness, dayCount, previousBusinessCheckInCount] = await Promise.all([
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    loyaltyPoints: true,
                    checkinCount: true,
                    checkinStreak: true,
                    lastCheckinAt: true,
                },
            }),
            this.prisma.business.findFirst({
                where: {
                    id: dto.businessId,
                    deletedAt: null,
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    latitude: true,
                    longitude: true,
                    organizationId: true,
                },
            }),
            this.prisma.checkIn.findFirst({
                where: {
                    userId,
                    businessId: dto.businessId,
                },
                select: {
                    createdAt: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            }),
            this.prisma.checkIn.count({
                where: {
                    userId,
                    createdAt: {
                        gte: dayStart,
                    },
                },
            }),
            this.prisma.checkIn.count({
                where: {
                    userId,
                    businessId: dto.businessId,
                },
            }),
        ]);

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        if (!business) {
            throw new NotFoundException('Negocio no disponible para check-in');
        }

        if (previousCheckInForBusiness) {
            const elapsedMs = now.getTime() - new Date(previousCheckInForBusiness.createdAt).getTime();
            const cooldownMs = CHECKIN_COOLDOWN_HOURS * 60 * 60 * 1000;
            if (elapsedMs < cooldownMs) {
                const minutesRemaining = Math.ceil((cooldownMs - elapsedMs) / (60 * 1000));
                throw new BadRequestException(
                    `Ya hiciste check-in recientemente. Intenta en aproximadamente ${minutesRemaining} minutos.`,
                );
            }
        }

        if (dayCount >= MAX_CHECKINS_PER_DAY) {
            throw new BadRequestException('Alcanzaste el limite diario de check-ins');
        }

        let distanceMeters: number | null = null;
        let verifiedLocation = false;
        if (
            typeof dto.latitude === 'number'
            && typeof dto.longitude === 'number'
            && typeof business.latitude === 'number'
            && typeof business.longitude === 'number'
        ) {
            distanceMeters = haversineDistanceMeters(
                dto.latitude,
                dto.longitude,
                business.latitude,
                business.longitude,
            );
            verifiedLocation = distanceMeters <= VERIFIED_DISTANCE_METERS;
        }

        let pointsAwarded = previousBusinessCheckInCount === 0 ? 20 : 10;
        if (verifiedLocation) {
            pointsAwarded += 5;
        }

        const todayKey = toUtcDateKey(now);
        const yesterdayKey = toUtcDateKey(addUtcDays(now, -1));
        const lastCheckinKey = user.lastCheckinAt ? toUtcDateKey(new Date(user.lastCheckinAt)) : null;

        let checkinStreak = user.checkinStreak || 0;
        let streakBonus = 0;
        if (lastCheckinKey === yesterdayKey) {
            checkinStreak += 1;
            streakBonus = Math.min(checkinStreak * 2, 12);
        } else if (lastCheckinKey !== todayKey) {
            checkinStreak = 1;
        }
        pointsAwarded += streakBonus;

        const result = await this.prisma.$transaction(async (tx) => {
            const checkIn = await tx.checkIn.create({
                data: {
                    userId,
                    businessId: business.id,
                    organizationId: business.organizationId,
                    latitude: dto.latitude ?? null,
                    longitude: dto.longitude ?? null,
                    verifiedLocation,
                    distanceMeters,
                    pointsAwarded,
                    streakApplied: streakBonus,
                    note: dto.note?.trim() || null,
                },
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                },
            });

            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: {
                    loyaltyPoints: { increment: pointsAwarded },
                    checkinCount: { increment: 1 },
                    checkinStreak,
                    lastCheckinAt: now,
                },
                select: {
                    loyaltyPoints: true,
                    checkinCount: true,
                    checkinStreak: true,
                    lastCheckinAt: true,
                },
            });

            return { checkIn, updatedUser };
        });

        return {
            checkIn: result.checkIn,
            reward: {
                pointsAwarded,
                streakBonus,
                verifiedLocation,
                distanceMeters,
                loyaltyPoints: result.updatedUser.loyaltyPoints,
                checkinCount: result.updatedUser.checkinCount,
                checkinStreak: result.updatedUser.checkinStreak,
                loyaltyTier: resolveLoyaltyTier(result.updatedUser.loyaltyPoints),
            },
        };
    }

    async listMyCheckIns(userId: string, query: ListMyCheckInsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const [rows, total, user] = await Promise.all([
            this.prisma.checkIn.findMany({
                where: { userId },
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            address: true,
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
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.checkIn.count({ where: { userId } }),
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    loyaltyPoints: true,
                    checkinCount: true,
                    checkinStreak: true,
                    lastCheckinAt: true,
                },
            }),
        ]);

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        return {
            data: rows,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            summary: {
                loyaltyPoints: user.loyaltyPoints,
                checkinCount: user.checkinCount,
                checkinStreak: user.checkinStreak,
                lastCheckinAt: user.lastCheckinAt,
                loyaltyTier: resolveLoyaltyTier(user.loyaltyPoints),
            },
        };
    }

    async getBusinessCheckInStats(businessId: string) {
        const business = await this.prisma.business.findFirst({
            where: {
                id: businessId,
                deletedAt: null,
            },
            select: {
                id: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const [totalCheckIns, last24HoursCheckIns, verifiedCheckIns, uniqueUsersGrouped] = await Promise.all([
            this.prisma.checkIn.count({
                where: {
                    businessId,
                },
            }),
            this.prisma.checkIn.count({
                where: {
                    businessId,
                    createdAt: {
                        gte: last24Hours,
                    },
                },
            }),
            this.prisma.checkIn.count({
                where: {
                    businessId,
                    verifiedLocation: true,
                },
            }),
            this.prisma.checkIn.groupBy({
                by: ['userId'],
                where: {
                    businessId,
                },
                _count: {
                    userId: true,
                },
            }),
        ]);

        return {
            businessId,
            totalCheckIns,
            last24HoursCheckIns,
            verifiedCheckIns,
            uniqueUsers: uniqueUsersGrouped.length,
        };
    }
}
