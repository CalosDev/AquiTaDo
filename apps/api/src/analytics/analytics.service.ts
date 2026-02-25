import {
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    AnalyticsEventType,
    TrackBusinessEventDto,
} from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async trackBusinessEvent(dto: TrackBusinessEventDto) {
        const eventTime = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
        const analyticsDate = this.toDateOnly(eventTime);

        return this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: dto.businessId },
                select: {
                    id: true,
                    organizationId: true,
                },
            });

            if (!business) {
                throw new NotFoundException('Negocio no encontrado');
            }

            let uniqueVisitors = 0;
            if (dto.eventType === AnalyticsEventType.VIEW) {
                uniqueVisitors = await this.registerUniqueVisitor(
                    tx,
                    business.organizationId,
                    dto.businessId,
                    analyticsDate,
                    dto.visitorId,
                );
            }

            const views = dto.eventType === AnalyticsEventType.VIEW ? 1 : 0;
            const clicks = dto.eventType === AnalyticsEventType.CLICK ? 1 : 0;
            const conversions = dto.eventType === AnalyticsEventType.CONVERSION ? 1 : 0;
            const reservationRequests = dto.eventType === AnalyticsEventType.RESERVATION_REQUEST ? 1 : 0;
            const grossRevenueIncrement = dto.eventType === AnalyticsEventType.CONVERSION
                ? Number(dto.amount ?? 0)
                : 0;

            await tx.businessAnalytics.upsert({
                where: {
                    businessId_date: {
                        businessId: dto.businessId,
                        date: analyticsDate,
                    },
                },
                update: {
                    views: { increment: views },
                    uniqueVisitors: { increment: uniqueVisitors },
                    clicks: { increment: clicks },
                    conversions: { increment: conversions },
                    reservationRequests: { increment: reservationRequests },
                    grossRevenue: { increment: new Prisma.Decimal(grossRevenueIncrement.toFixed(2)) },
                },
                create: {
                    businessId: dto.businessId,
                    date: analyticsDate,
                    views,
                    uniqueVisitors,
                    clicks,
                    conversions,
                    reservationRequests,
                    grossRevenue: new Prisma.Decimal(grossRevenueIncrement.toFixed(2)),
                },
            });

            return {
                received: true,
                businessId: dto.businessId,
                eventType: dto.eventType,
                trackedAt: eventTime.toISOString(),
            };
        });
    }

    async getOrganizationDashboard(organizationId: string, days = 30) {
        const normalizedDays = this.normalizeDays(days);
        const now = new Date();
        const rangeStart = this.toDateOnly(new Date(now.getTime() - (normalizedDays - 1) * 86_400_000));

        const [records, activePromotions, pendingBookings, confirmedBookings, subscription] = await Promise.all([
            this.prisma.businessAnalytics.findMany({
                where: {
                    business: {
                        organizationId,
                    },
                    date: {
                        gte: rangeStart,
                    },
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
                orderBy: { date: 'asc' },
            }),
            this.prisma.promotion.count({
                where: {
                    organizationId,
                    isActive: true,
                    startsAt: { lte: now },
                    endsAt: { gte: now },
                },
            }),
            this.prisma.booking.count({
                where: {
                    organizationId,
                    status: 'PENDING',
                    scheduledFor: { gte: now },
                },
            }),
            this.prisma.booking.count({
                where: {
                    organizationId,
                    status: 'CONFIRMED',
                    scheduledFor: { gte: now },
                },
            }),
            this.prisma.subscription.findUnique({
                where: { organizationId },
                include: {
                    plan: {
                        select: {
                            code: true,
                            name: true,
                            priceMonthly: true,
                            currency: true,
                            transactionFeeBps: true,
                        },
                    },
                },
            }),
        ]);

        const dailyMap = new Map<
        string,
        {
            views: number;
            uniqueVisitors: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }
        >();

        const businessTotals = new Map<
        string,
        {
            businessId: string;
            businessName: string;
            businessSlug: string;
            views: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }
        >();

        const totals = {
            views: 0,
            uniqueVisitors: 0,
            clicks: 0,
            conversions: 0,
            reservationRequests: 0,
            grossRevenue: 0,
        };

        for (const record of records) {
            const dateKey = this.dateKey(record.date);
            const grossRevenue = Number(record.grossRevenue.toString());

            totals.views += record.views;
            totals.uniqueVisitors += record.uniqueVisitors;
            totals.clicks += record.clicks;
            totals.conversions += record.conversions;
            totals.reservationRequests += record.reservationRequests;
            totals.grossRevenue += grossRevenue;

            const daily = dailyMap.get(dateKey) ?? {
                views: 0,
                uniqueVisitors: 0,
                clicks: 0,
                conversions: 0,
                reservationRequests: 0,
                grossRevenue: 0,
            };

            daily.views += record.views;
            daily.uniqueVisitors += record.uniqueVisitors;
            daily.clicks += record.clicks;
            daily.conversions += record.conversions;
            daily.reservationRequests += record.reservationRequests;
            daily.grossRevenue += grossRevenue;
            dailyMap.set(dateKey, daily);

            const business = businessTotals.get(record.businessId) ?? {
                businessId: record.businessId,
                businessName: record.business.name,
                businessSlug: record.business.slug,
                views: 0,
                clicks: 0,
                conversions: 0,
                reservationRequests: 0,
                grossRevenue: 0,
            };

            business.views += record.views;
            business.clicks += record.clicks;
            business.conversions += record.conversions;
            business.reservationRequests += record.reservationRequests;
            business.grossRevenue += grossRevenue;
            businessTotals.set(record.businessId, business);
        }

        const daily = this.buildDailySeries(rangeStart, normalizedDays, dailyMap);
        const topBusinesses = [...businessTotals.values()]
            .sort((left, right) => right.views - left.views)
            .slice(0, 5);

        return {
            range: {
                days: normalizedDays,
                from: rangeStart.toISOString(),
                to: this.toDateOnly(now).toISOString(),
            },
            totals: {
                ...totals,
                grossRevenue: this.roundMoney(totals.grossRevenue),
                conversionRate: totals.views > 0
                    ? Number(((totals.conversions / totals.views) * 100).toFixed(2))
                    : 0,
                clickThroughRate: totals.views > 0
                    ? Number(((totals.clicks / totals.views) * 100).toFixed(2))
                    : 0,
            },
            daily,
            topBusinesses: topBusinesses.map((item) => ({
                ...item,
                grossRevenue: this.roundMoney(item.grossRevenue),
            })),
            marketplace: {
                activePromotions,
                pendingBookings,
                confirmedBookings,
            },
            subscription: subscription
                ? {
                    id: subscription.id,
                    status: subscription.status,
                    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
                    plan: {
                        code: subscription.plan.code,
                        name: subscription.plan.name,
                        priceMonthly: subscription.plan.priceMonthly.toString(),
                        currency: subscription.plan.currency,
                        transactionFeeBps: subscription.plan.transactionFeeBps,
                    },
                }
                : null,
        };
    }

    async getBusinessAnalytics(
        organizationId: string,
        businessId: string,
        days = 30,
    ) {
        const normalizedDays = this.normalizeDays(days);
        const now = new Date();
        const rangeStart = this.toDateOnly(new Date(now.getTime() - (normalizedDays - 1) * 86_400_000));

        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                organizationId: true,
            },
        });

        if (!business || business.organizationId !== organizationId) {
            throw new NotFoundException('Negocio no encontrado en la organización activa');
        }

        const records = await this.prisma.businessAnalytics.findMany({
            where: {
                businessId,
                date: {
                    gte: rangeStart,
                },
            },
            orderBy: { date: 'asc' },
        });

        const dailyMap = new Map<
        string,
        {
            views: number;
            uniqueVisitors: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }
        >();

        const totals = {
            views: 0,
            uniqueVisitors: 0,
            clicks: 0,
            conversions: 0,
            reservationRequests: 0,
            grossRevenue: 0,
        };

        for (const record of records) {
            const dateKey = this.dateKey(record.date);
            const grossRevenue = Number(record.grossRevenue.toString());

            totals.views += record.views;
            totals.uniqueVisitors += record.uniqueVisitors;
            totals.clicks += record.clicks;
            totals.conversions += record.conversions;
            totals.reservationRequests += record.reservationRequests;
            totals.grossRevenue += grossRevenue;

            dailyMap.set(dateKey, {
                views: record.views,
                uniqueVisitors: record.uniqueVisitors,
                clicks: record.clicks,
                conversions: record.conversions,
                reservationRequests: record.reservationRequests,
                grossRevenue,
            });
        }

        return {
            business,
            range: {
                days: normalizedDays,
                from: rangeStart.toISOString(),
                to: this.toDateOnly(now).toISOString(),
            },
            totals: {
                ...totals,
                grossRevenue: this.roundMoney(totals.grossRevenue),
                conversionRate: totals.views > 0
                    ? Number(((totals.conversions / totals.views) * 100).toFixed(2))
                    : 0,
                clickThroughRate: totals.views > 0
                    ? Number(((totals.clicks / totals.views) * 100).toFixed(2))
                    : 0,
            },
            daily: this.buildDailySeries(rangeStart, normalizedDays, dailyMap),
        };
    }

    private async registerUniqueVisitor(
        tx: Prisma.TransactionClient,
        organizationId: string,
        businessId: string,
        date: Date,
        visitorId?: string,
    ): Promise<number> {
        if (!visitorId?.trim()) {
            return 0;
        }

        const visitorHash = createHash('sha256')
            .update(visitorId.trim())
            .digest('hex')
            .slice(0, 32);

        const periodStart = date;
        const periodEnd = new Date(date.getTime() + 86_400_000);
        const metricKey = `uv:${businessId}:${visitorHash}`;

        try {
            await tx.usageMetric.create({
                data: {
                    organizationId,
                    metricKey,
                    metricValue: 1,
                    periodStart,
                    periodEnd,
                },
            });
            return 1;
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                return 0;
            }
            throw error;
        }
    }

    private normalizeDays(days: number): number {
        if (!Number.isFinite(days)) {
            return 30;
        }
        return Math.min(Math.max(Math.floor(days), 1), 365);
    }

    private toDateOnly(date: Date): Date {
        return new Date(Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
        ));
    }

    private dateKey(date: Date): string {
        return date.toISOString().slice(0, 10);
    }

    private buildDailySeries(
        rangeStart: Date,
        days: number,
        dailyMap: Map<
        string,
        {
            views: number;
            uniqueVisitors: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }
        >,
    ) {
        const series: Array<{
            date: string;
            views: number;
            uniqueVisitors: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }> = [];

        for (let index = 0; index < days; index += 1) {
            const currentDate = new Date(rangeStart.getTime() + index * 86_400_000);
            const key = this.dateKey(currentDate);
            const item = dailyMap.get(key) ?? {
                views: 0,
                uniqueVisitors: 0,
                clicks: 0,
                conversions: 0,
                reservationRequests: 0,
                grossRevenue: 0,
            };

            series.push({
                date: key,
                views: item.views,
                uniqueVisitors: item.uniqueVisitors,
                clicks: item.clicks,
                conversions: item.conversions,
                reservationRequests: item.reservationRequests,
                grossRevenue: this.roundMoney(item.grossRevenue),
            });
        }

        return series;
    }

    private roundMoney(value: number): number {
        return Math.round(value * 100) / 100;
    }
}
