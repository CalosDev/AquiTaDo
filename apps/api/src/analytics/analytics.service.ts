import {
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { GrowthEventType, MarketReportType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    AnalyticsEventType,
    GenerateMarketReportDto,
    GrowthInsightsQueryDto,
    ListMarketReportsQueryDto,
    MarketInsightsQueryDto,
    TrackGrowthEventDto,
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

    async trackGrowthEvent(dto: TrackGrowthEventDto) {
        const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
        const visitorIdHash = dto.visitorId?.trim()
            ? createHash('sha256').update(dto.visitorId.trim()).digest('hex').slice(0, 64)
            : null;
        const searchQuery = dto.searchQuery?.trim().slice(0, 255) || null;

        let organizationId: string | null = null;
        if (dto.businessId) {
            const business = await this.prisma.business.findUnique({
                where: { id: dto.businessId },
                select: {
                    id: true,
                    organizationId: true,
                },
            });

            if (!business) {
                throw new NotFoundException('Negocio no encontrado');
            }

            organizationId = business.organizationId;
        }

        const growthEvent = await this.prisma.growthEvent.create({
            data: {
                eventType: dto.eventType,
                businessId: dto.businessId ?? null,
                organizationId,
                userId: dto.userId ?? null,
                categoryId: dto.categoryId ?? null,
                provinceId: dto.provinceId ?? null,
                cityId: dto.cityId ?? null,
                visitorIdHash,
                sessionId: dto.sessionId?.trim() || null,
                variantKey: dto.variantKey?.trim() || null,
                searchQuery,
                metadata: (dto.metadata ?? null) as Prisma.InputJsonValue,
                occurredAt,
            },
            select: {
                id: true,
                eventType: true,
                occurredAt: true,
            },
        });

        return {
            received: true,
            id: growthEvent.id,
            eventType: growthEvent.eventType,
            occurredAt: growthEvent.occurredAt.toISOString(),
        };
    }

    async getGrowthInsights(query: GrowthInsightsQueryDto) {
        const normalizedDays = this.normalizeDays(query.days ?? 30);
        const limit = Math.min(Math.max(query.limit ?? 15, 1), 50);
        const now = new Date();
        const rangeStart = this.toDateOnly(new Date(now.getTime() - (normalizedDays - 1) * 86_400_000));

        const where: Prisma.GrowthEventWhereInput = {
            occurredAt: {
                gte: rangeStart,
            },
        };
        if (query.provinceId) {
            where.provinceId = query.provinceId;
        }
        if (query.categoryId) {
            where.categoryId = query.categoryId;
        }

        const [
            categoryDemand,
            cityDemand,
            provinceDemand,
            searchVisitors,
            whatsappVisitors,
            contactClicksByVariant,
            whatsappClicksByVariant,
        ] = await Promise.all([
            this.prisma.growthEvent.groupBy({
                by: ['categoryId'],
                where: {
                    ...where,
                    eventType: GrowthEventType.SEARCH_QUERY,
                    categoryId: { not: null },
                },
                _count: { _all: true },
                orderBy: {
                    _count: {
                        categoryId: 'desc',
                    },
                },
                take: limit,
            }),
            this.prisma.growthEvent.groupBy({
                by: ['cityId', 'provinceId'],
                where: {
                    ...where,
                    eventType: GrowthEventType.SEARCH_QUERY,
                    cityId: { not: null },
                },
                _count: { _all: true },
                orderBy: {
                    _count: {
                        cityId: 'desc',
                    },
                },
                take: limit,
            }),
            this.prisma.growthEvent.groupBy({
                by: ['provinceId', 'categoryId'],
                where: {
                    ...where,
                    eventType: GrowthEventType.SEARCH_QUERY,
                },
                _count: { _all: true },
                orderBy: {
                    _count: {
                        provinceId: 'desc',
                    },
                },
                take: limit,
            }),
            this.prisma.growthEvent.findMany({
                where: {
                    ...where,
                    eventType: GrowthEventType.SEARCH_QUERY,
                    visitorIdHash: { not: null },
                },
                select: { visitorIdHash: true },
                distinct: ['visitorIdHash'],
            }),
            this.prisma.growthEvent.findMany({
                where: {
                    ...where,
                    eventType: GrowthEventType.WHATSAPP_CLICK,
                    visitorIdHash: { not: null },
                },
                select: { visitorIdHash: true },
                distinct: ['visitorIdHash'],
            }),
            this.prisma.growthEvent.groupBy({
                by: ['variantKey'],
                where: {
                    ...where,
                    eventType: GrowthEventType.CONTACT_CLICK,
                    variantKey: { not: null },
                },
                _count: { _all: true },
            }),
            this.prisma.growthEvent.groupBy({
                by: ['variantKey'],
                where: {
                    ...where,
                    eventType: GrowthEventType.WHATSAPP_CLICK,
                    variantKey: { not: null },
                },
                _count: { _all: true },
            }),
        ]);

        const categoryIds = categoryDemand
            .map((entry) => entry.categoryId)
            .filter((entry): entry is string => Boolean(entry));
        const cityIds = cityDemand
            .map((entry) => entry.cityId)
            .filter((entry): entry is string => Boolean(entry));
        const provinceIds = new Set<string>();
        for (const row of provinceDemand) {
            if (row.provinceId) {
                provinceIds.add(row.provinceId);
            }
        }
        for (const row of cityDemand) {
            if (row.provinceId) {
                provinceIds.add(row.provinceId);
            }
        }
        if (query.provinceId) {
            provinceIds.add(query.provinceId);
        }

        const [categories, cities, provinces] = await Promise.all([
            categoryIds.length > 0
                ? this.prisma.category.findMany({
                    where: { id: { in: categoryIds } },
                    select: { id: true, name: true, slug: true },
                })
                : Promise.resolve([]),
            cityIds.length > 0
                ? this.prisma.city.findMany({
                    where: { id: { in: cityIds } },
                    select: {
                        id: true,
                        name: true,
                        province: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                })
                : Promise.resolve([]),
            provinceIds.size > 0
                ? this.prisma.province.findMany({
                    where: { id: { in: [...provinceIds] } },
                    select: { id: true, name: true, slug: true },
                })
                : Promise.resolve([]),
        ]);

        const categoryById = new Map(categories.map((category) => [category.id, category]));
        const cityById = new Map(cities.map((city) => [city.id, city]));
        const provinceById = new Map(provinces.map((province) => [province.id, province]));

        const topCategories = await Promise.all(categoryDemand.map(async (entry) => {
            if (!entry.categoryId) {
                return null;
            }

            const category = categoryById.get(entry.categoryId);
            const supply = await this.prisma.business.count({
                where: {
                    verified: true,
                    ...(query.provinceId ? { provinceId: query.provinceId } : {}),
                    categories: {
                        some: {
                            categoryId: entry.categoryId,
                        },
                    },
                },
            });

            return {
                categoryId: entry.categoryId,
                categoryName: category?.name ?? 'Sin categoria',
                categorySlug: category?.slug ?? null,
                searches: entry._count._all,
                supplyBusinesses: supply,
                demandSupplyRatio: Number((entry._count._all / Math.max(supply, 1)).toFixed(2)),
            };
        }));

        const demandSupplyGaps = await Promise.all(provinceDemand.map(async (entry) => {
            const supply = await this.prisma.business.count({
                where: {
                    verified: true,
                    ...(entry.provinceId ? { provinceId: entry.provinceId } : {}),
                    ...(entry.categoryId
                        ? {
                            categories: {
                                some: {
                                    categoryId: entry.categoryId,
                                },
                            },
                        }
                        : {}),
                },
            });

            const province = entry.provinceId ? provinceById.get(entry.provinceId) : null;
            const category = entry.categoryId ? categoryById.get(entry.categoryId) : null;
            return {
                provinceId: entry.provinceId ?? null,
                provinceName: province?.name ?? 'Nacional',
                categoryId: entry.categoryId ?? null,
                categoryName: category?.name ?? 'Todas',
                demandSearches: entry._count._all,
                supplyBusinesses: supply,
                demandSupplyRatio: Number((entry._count._all / Math.max(supply, 1)).toFixed(2)),
            };
        }));

        const topCityGaps = await Promise.all(cityDemand.map(async (entry) => {
            if (!entry.cityId) {
                return null;
            }

            const city = cityById.get(entry.cityId);
            const supply = await this.prisma.business.count({
                where: {
                    verified: true,
                    cityId: entry.cityId,
                },
            });

            return {
                cityId: entry.cityId,
                cityName: city?.name ?? 'Ciudad',
                provinceId: city?.province.id ?? entry.provinceId ?? null,
                provinceName: city?.province.name ?? null,
                demandSearches: entry._count._all,
                supplyBusinesses: supply,
                demandSupplyRatio: Number((entry._count._all / Math.max(supply, 1)).toFixed(2)),
            };
        }));

        const contactClicksMap = new Map(
            contactClicksByVariant
                .filter((entry) => Boolean(entry.variantKey))
                .map((entry) => [entry.variantKey as string, entry._count._all]),
        );
        const whatsappClicksMap = new Map(
            whatsappClicksByVariant
                .filter((entry) => Boolean(entry.variantKey))
                .map((entry) => [entry.variantKey as string, entry._count._all]),
        );

        const allVariants = new Set<string>([
            ...contactClicksMap.keys(),
            ...whatsappClicksMap.keys(),
        ]);
        const abTest = [...allVariants].map((variantKey) => {
            const contactClicks = contactClicksMap.get(variantKey) ?? 0;
            const whatsappClicks = whatsappClicksMap.get(variantKey) ?? 0;
            return {
                variantKey,
                contactClicks,
                whatsappClicks,
                conversionRate: contactClicks > 0
                    ? Number(((whatsappClicks / contactClicks) * 100).toFixed(2))
                    : 0,
            };
        }).sort((left, right) => right.conversionRate - left.conversionRate);

        const uniqueSearchVisitors = searchVisitors.length;
        const uniqueWhatsAppVisitors = whatsappVisitors.length;

        return {
            range: {
                days: normalizedDays,
                from: rangeStart.toISOString(),
                to: this.toDateOnly(now).toISOString(),
            },
            filters: {
                provinceId: query.provinceId ?? null,
                categoryId: query.categoryId ?? null,
            },
            topSearchedCategories: topCategories.filter(Boolean).slice(0, limit),
            demandSupplyGaps: demandSupplyGaps
                .sort((left, right) => right.demandSupplyRatio - left.demandSupplyRatio)
                .slice(0, limit),
            topCityDemandGaps: topCityGaps
                .filter(Boolean)
                .sort((left, right) => (right?.demandSupplyRatio ?? 0) - (left?.demandSupplyRatio ?? 0))
                .slice(0, limit),
            conversionFunnels: {
                searchToWhatsApp: {
                    uniqueSearchVisitors,
                    uniqueWhatsAppVisitors,
                    conversionRate: uniqueSearchVisitors > 0
                        ? Number(((uniqueWhatsAppVisitors / uniqueSearchVisitors) * 100).toFixed(2))
                        : 0,
                },
            },
            abTesting: {
                experiment: 'business_contact_button',
                variants: abTest,
                winner: abTest[0] ?? null,
            },
        };
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

    async getMarketInsights(query: MarketInsightsQueryDto) {
        const normalizedDays = this.normalizeDays(query.days ?? 30);
        const take = Math.min(Math.max(query.limit ?? 10, 1), 50);
        const now = new Date();
        const rangeStart = this.toDateOnly(new Date(now.getTime() - (normalizedDays - 1) * 86_400_000));

        const businessWhere: Prisma.BusinessWhereInput = {
            verified: true,
        };

        if (query.provinceId) {
            businessWhere.provinceId = query.provinceId;
        }

        if (query.categoryId) {
            businessWhere.categories = {
                some: {
                    categoryId: query.categoryId,
                },
            };
        }

        const businesses = await this.prisma.business.findMany({
            where: businessWhere,
            select: {
                id: true,
                name: true,
                slug: true,
                reputationScore: true,
                reputationTier: true,
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
                categories: {
                    select: {
                        category: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
            },
        });

        if (businesses.length === 0) {
            return {
                range: {
                    days: normalizedDays,
                    from: rangeStart.toISOString(),
                    to: this.toDateOnly(now).toISOString(),
                },
                filters: {
                    provinceId: query.provinceId ?? null,
                    categoryId: query.categoryId ?? null,
                },
                totals: {
                    trackedBusinesses: 0,
                    views: 0,
                    clicks: 0,
                    conversions: 0,
                    reservationRequests: 0,
                    grossRevenue: 0,
                    conversionRate: 0,
                    reservationRequestRate: 0,
                },
                topBusinesses: [],
                provinces: [],
                categories: [],
            };
        }

        const businessIds = businesses.map((business) => business.id);

        const [analyticsRows, reviewRows, bookingRows] = await Promise.all([
            this.prisma.businessAnalytics.groupBy({
                by: ['businessId'],
                where: {
                    businessId: { in: businessIds },
                    date: { gte: rangeStart },
                },
                _sum: {
                    views: true,
                    clicks: true,
                    conversions: true,
                    reservationRequests: true,
                    grossRevenue: true,
                },
            }),
            this.prisma.review.groupBy({
                by: ['businessId'],
                where: {
                    businessId: { in: businessIds },
                    moderationStatus: 'APPROVED',
                    isSpam: false,
                },
                _avg: {
                    rating: true,
                },
                _count: {
                    _all: true,
                },
            }),
            this.prisma.booking.groupBy({
                by: ['businessId'],
                where: {
                    businessId: { in: businessIds },
                    scheduledFor: { gte: rangeStart },
                },
                _count: {
                    _all: true,
                },
            }),
        ]);

        const analyticsByBusiness = new Map<
        string,
        {
            views: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }
        >();
        for (const row of analyticsRows) {
            analyticsByBusiness.set(row.businessId, {
                views: row._sum.views ?? 0,
                clicks: row._sum.clicks ?? 0,
                conversions: row._sum.conversions ?? 0,
                reservationRequests: row._sum.reservationRequests ?? 0,
                grossRevenue: Number(row._sum.grossRevenue?.toString() ?? '0'),
            });
        }

        const reviewsByBusiness = new Map<
        string,
        {
            averageRating: number;
            reviewCount: number;
        }
        >();
        for (const row of reviewRows) {
            reviewsByBusiness.set(row.businessId, {
                averageRating: Number(row._avg.rating ?? 0),
                reviewCount: row._count._all,
            });
        }

        const bookingsByBusiness = new Map<string, number>();
        for (const row of bookingRows) {
            bookingsByBusiness.set(row.businessId, row._count._all);
        }

        const totals = {
            views: 0,
            clicks: 0,
            conversions: 0,
            reservationRequests: 0,
            grossRevenue: 0,
        };

        const provinceRollup = new Map<
        string,
        {
            provinceId: string;
            provinceName: string;
            provinceSlug: string;
            businessCount: number;
            views: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
            reviewCount: number;
            weightedRatingSum: number;
        }
        >();

        const categoryRollup = new Map<
        string,
        {
            categoryId: string;
            categoryName: string;
            categorySlug: string;
            businessCount: number;
            views: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
        }
        >();

        const topBusinesses = businesses.map((business) => {
            const analytics = analyticsByBusiness.get(business.id) ?? {
                views: 0,
                clicks: 0,
                conversions: 0,
                reservationRequests: 0,
                grossRevenue: 0,
            };
            const review = reviewsByBusiness.get(business.id) ?? {
                averageRating: 0,
                reviewCount: 0,
            };
            const bookingsCount = bookingsByBusiness.get(business.id) ?? 0;

            totals.views += analytics.views;
            totals.clicks += analytics.clicks;
            totals.conversions += analytics.conversions;
            totals.reservationRequests += analytics.reservationRequests;
            totals.grossRevenue += analytics.grossRevenue;

            const provinceBucket = provinceRollup.get(business.province.id) ?? {
                provinceId: business.province.id,
                provinceName: business.province.name,
                provinceSlug: business.province.slug,
                businessCount: 0,
                views: 0,
                clicks: 0,
                conversions: 0,
                reservationRequests: 0,
                grossRevenue: 0,
                reviewCount: 0,
                weightedRatingSum: 0,
            };

            provinceBucket.businessCount += 1;
            provinceBucket.views += analytics.views;
            provinceBucket.clicks += analytics.clicks;
            provinceBucket.conversions += analytics.conversions;
            provinceBucket.reservationRequests += analytics.reservationRequests;
            provinceBucket.grossRevenue += analytics.grossRevenue;
            provinceBucket.reviewCount += review.reviewCount;
            provinceBucket.weightedRatingSum += review.averageRating * review.reviewCount;
            provinceRollup.set(business.province.id, provinceBucket);

            for (const categoryRef of business.categories) {
                const category = categoryRef.category;
                const categoryBucket = categoryRollup.get(category.id) ?? {
                    categoryId: category.id,
                    categoryName: category.name,
                    categorySlug: category.slug,
                    businessCount: 0,
                    views: 0,
                    clicks: 0,
                    conversions: 0,
                    reservationRequests: 0,
                    grossRevenue: 0,
                };

                categoryBucket.businessCount += 1;
                categoryBucket.views += analytics.views;
                categoryBucket.clicks += analytics.clicks;
                categoryBucket.conversions += analytics.conversions;
                categoryBucket.reservationRequests += analytics.reservationRequests;
                categoryBucket.grossRevenue += analytics.grossRevenue;
                categoryRollup.set(category.id, categoryBucket);
            }

            return {
                id: business.id,
                name: business.name,
                slug: business.slug,
                province: business.province,
                city: business.city,
                categories: business.categories.map((entry) => entry.category),
                reputationScore: Number(business.reputationScore.toString()),
                reputationTier: business.reputationTier,
                stats: {
                    views: analytics.views,
                    clicks: analytics.clicks,
                    conversions: analytics.conversions,
                    reservationRequests: analytics.reservationRequests,
                    bookings: bookingsCount,
                    grossRevenue: this.roundMoney(analytics.grossRevenue),
                    conversionRate: analytics.views > 0
                        ? Number(((analytics.conversions / analytics.views) * 100).toFixed(2))
                        : 0,
                    averageRating: Number(review.averageRating.toFixed(2)),
                    reviewCount: review.reviewCount,
                },
            };
        });

        const provinceInsights = [...provinceRollup.values()]
            .map((row) => ({
                provinceId: row.provinceId,
                provinceName: row.provinceName,
                provinceSlug: row.provinceSlug,
                businessCount: row.businessCount,
                views: row.views,
                clicks: row.clicks,
                conversions: row.conversions,
                reservationRequests: row.reservationRequests,
                grossRevenue: this.roundMoney(row.grossRevenue),
                conversionRate: row.views > 0
                    ? Number(((row.conversions / row.views) * 100).toFixed(2))
                    : 0,
                averageRating: row.reviewCount > 0
                    ? Number((row.weightedRatingSum / row.reviewCount).toFixed(2))
                    : 0,
            }))
            .sort((left, right) => {
                if (right.reservationRequests !== left.reservationRequests) {
                    return right.reservationRequests - left.reservationRequests;
                }
                return right.views - left.views;
            })
            .slice(0, take);

        const categoryInsights = [...categoryRollup.values()]
            .map((row) => ({
                categoryId: row.categoryId,
                categoryName: row.categoryName,
                categorySlug: row.categorySlug,
                businessCount: row.businessCount,
                views: row.views,
                clicks: row.clicks,
                conversions: row.conversions,
                reservationRequests: row.reservationRequests,
                grossRevenue: this.roundMoney(row.grossRevenue),
                conversionRate: row.views > 0
                    ? Number(((row.conversions / row.views) * 100).toFixed(2))
                    : 0,
            }))
            .sort((left, right) => {
                if (right.reservationRequests !== left.reservationRequests) {
                    return right.reservationRequests - left.reservationRequests;
                }
                return right.views - left.views;
            })
            .slice(0, take);

        const rankedBusinesses = topBusinesses
            .sort((left, right) => {
                if (right.stats.reservationRequests !== left.stats.reservationRequests) {
                    return right.stats.reservationRequests - left.stats.reservationRequests;
                }
                return right.stats.views - left.stats.views;
            })
            .slice(0, take);

        return {
            range: {
                days: normalizedDays,
                from: rangeStart.toISOString(),
                to: this.toDateOnly(now).toISOString(),
            },
            filters: {
                provinceId: query.provinceId ?? null,
                categoryId: query.categoryId ?? null,
            },
            totals: {
                trackedBusinesses: businesses.length,
                views: totals.views,
                clicks: totals.clicks,
                conversions: totals.conversions,
                reservationRequests: totals.reservationRequests,
                grossRevenue: this.roundMoney(totals.grossRevenue),
                conversionRate: totals.views > 0
                    ? Number(((totals.conversions / totals.views) * 100).toFixed(2))
                    : 0,
                reservationRequestRate: totals.views > 0
                    ? Number(((totals.reservationRequests / totals.views) * 100).toFixed(2))
                    : 0,
            },
            topBusinesses: rankedBusinesses,
            provinces: provinceInsights,
            categories: categoryInsights,
        };
    }

    async generateMarketReport(
        generatedByUserId: string,
        dto: GenerateMarketReportDto,
    ) {
        const normalizedDays = this.normalizeDays(dto.days ?? 30);
        const periodEnd = this.toDateOnly(new Date());
        const periodStart = this.toDateOnly(
            new Date(periodEnd.getTime() - (normalizedDays - 1) * 86_400_000),
        );

        const insights = await this.getMarketInsights({
            days: normalizedDays,
            provinceId: dto.provinceId,
            categoryId: dto.categoryId,
            limit: 50,
        });

        const summary = this.buildReportSummary(dto.reportType, insights);

        return this.prisma.marketReportSnapshot.create({
            data: {
                reportType: dto.reportType,
                periodStart,
                periodEnd,
                filters: ({
                    days: normalizedDays,
                    provinceId: dto.provinceId ?? null,
                    categoryId: dto.categoryId ?? null,
                } as Prisma.InputJsonValue),
                summary: summary as Prisma.InputJsonValue,
                generatedByUserId,
            },
            include: {
                generatedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
    }

    async listMarketReports(query: ListMarketReportsQueryDto) {
        const take = Math.min(Math.max(query.limit ?? 20, 1), 100);
        const where: Prisma.MarketReportSnapshotWhereInput = {};
        if (query.reportType) {
            where.reportType = query.reportType;
        }

        return this.prisma.marketReportSnapshot.findMany({
            where,
            include: {
                generatedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { generatedAt: 'desc' },
            take,
        });
    }

    async getMarketReportById(reportId: string) {
        const report = await this.prisma.marketReportSnapshot.findUnique({
            where: { id: reportId },
            include: {
                generatedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!report) {
            throw new NotFoundException('Reporte de mercado no encontrado');
        }

        return report;
    }

    private buildReportSummary(
        reportType: MarketReportType,
        insights: Awaited<ReturnType<AnalyticsService['getMarketInsights']>>,
    ) {
        switch (reportType) {
            case 'PROVINCE_CATEGORY_DEMAND':
                return {
                    headline: 'Demanda por provincia y categoría',
                    totals: insights.totals,
                    topProvinces: insights.provinces.slice(0, 10),
                    topCategories: insights.categories.slice(0, 10),
                };
            case 'TRENDING_BUSINESSES':
                return {
                    headline: 'Negocios en tendencia',
                    totals: insights.totals,
                    topBusinesses: insights.topBusinesses.slice(0, 20),
                };
            case 'CONVERSION_BENCHMARK':
                return {
                    headline: 'Benchmark de conversión del marketplace',
                    totals: insights.totals,
                    conversionRate: insights.totals.conversionRate,
                    reservationRequestRate: insights.totals.reservationRequestRate,
                    topBusinesses: insights.topBusinesses.slice(0, 10),
                    topCategories: insights.categories.slice(0, 10),
                };
            default:
                return {
                    headline: 'Reporte de mercado',
                    totals: insights.totals,
                };
        }
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
