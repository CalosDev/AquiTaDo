import {
    Inject,
    Injectable,
    Logger,
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

type GrowthSignalEventRow = {
    businessId: string | null;
    eventType: GrowthEventType;
    sessionId: string | null;
    metadata: Prisma.JsonValue | null;
    occurredAt: Date;
};

type GrowthTrendDirection = 'up' | 'down' | 'flat';

type GrowthTrendMetric = {
    current: number;
    previous: number;
    delta: number;
    direction: GrowthTrendDirection;
};

type GrowthActionableAlert = {
    level: 'HIGH' | 'MEDIUM';
    title: string;
    description: string;
    metricKey: string;
    owner: string;
    cadence: 'Diario' | 'Semanal';
    slaHours: number;
    playbookSection: string;
    recommendedAction: string;
};

type GrowthSignalSummary = {
    activationMetrics: {
        shareClicks: number;
        passwordResetRequests: number;
        passwordResetCompletions: number;
        googleAuthSuccesses: number;
        googleAuthLoginSuccesses: number;
        googleAuthRegistrationSuccesses: number;
        stickyPhoneClicks: number;
        stickyWhatsAppClicks: number;
        totalWhatsAppClicks: number;
    };
    discoveryMetrics: {
        listingFilterApplies: number;
        listingSortChanges: number;
        mapViewChanges: number;
        listViewChanges: number;
        mapSelections: number;
        listingResultClicks: number;
        sponsoredResultClicks: number;
    };
    moderationMetrics: {
        premoderationFlagged: number;
        uniqueFlaggedBusinesses: number;
        premoderationReleased: number;
        premoderationConfirmed: number;
        releaseRatePct: number;
        topReasons: Array<{ reason: string; count: number }>;
    };
    onboardingMetrics: {
        step1Sessions: number;
        step2Sessions: number;
        step3Sessions: number;
        step4Sessions: number;
        completedSessions: number;
        completionRatePct: number;
    };
    derivedMetrics: {
        recoveryCompletionRatePct: number;
        mapSelectionRatePct: number;
    };
};

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async trackBusinessEvent(dto: TrackBusinessEventDto) {
        const eventTime = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
        const analyticsDate = this.toDateOnly(eventTime);
        const trackedAt = eventTime.toISOString();

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const business = await tx.business.findUnique({
                    where: { id: dto.businessId },
                    select: {
                        id: true,
                        organizationId: true,
                    },
                });

                if (!business) {
                    return {
                        received: false,
                        businessId: dto.businessId,
                        eventType: dto.eventType,
                        trackedAt,
                        reason: 'business_not_found',
                    } as const;
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
                const rawAmount = Number(dto.amount ?? 0);
                const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
                const grossRevenueIncrement = dto.eventType === AnalyticsEventType.CONVERSION
                    ? Math.max(safeAmount, 0)
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
                    trackedAt,
                } as const;
            });

            return result;
        } catch (error) {
            this.logger.warn(
                `Analytics tracking skipped for business ${dto.businessId}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
            return {
                received: false,
                businessId: dto.businessId,
                eventType: dto.eventType,
                trackedAt,
                reason: 'analytics_unavailable',
            };
        }
    }

    async trackGrowthEvent(dto: TrackGrowthEventDto & { userId?: string }) {
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
        const comparisonRangeStart = this.toDateOnly(new Date(rangeStart.getTime() - normalizedDays * 86_400_000));

        const sharedWhere: Prisma.GrowthEventWhereInput = {};
        if (query.provinceId) {
            sharedWhere.provinceId = query.provinceId;
        }
        if (query.categoryId) {
            sharedWhere.categoryId = query.categoryId;
        }

        const currentWhere: Prisma.GrowthEventWhereInput = {
            ...sharedWhere,
            occurredAt: {
                gte: rangeStart,
            },
        };
        const previousWhere: Prisma.GrowthEventWhereInput = {
            ...sharedWhere,
            occurredAt: {
                gte: comparisonRangeStart,
                lt: rangeStart,
            },
        };

        const [
            categoryDemand,
            cityDemand,
            provinceDemand,
            searchVisitors,
            whatsappVisitors,
            contactClicksByVariant,
            whatsappClicksByVariant,
            currentActivationEventRows,
            previousActivationEventRows,
        ] = await Promise.all([
            this.prisma.growthEvent.groupBy({
                by: ['categoryId'],
                where: {
                    ...currentWhere,
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
                    ...currentWhere,
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
                    ...currentWhere,
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
                    ...currentWhere,
                    eventType: GrowthEventType.SEARCH_QUERY,
                    visitorIdHash: { not: null },
                },
                select: { visitorIdHash: true },
                distinct: ['visitorIdHash'],
            }),
            this.prisma.growthEvent.findMany({
                where: {
                    ...currentWhere,
                    eventType: GrowthEventType.WHATSAPP_CLICK,
                    visitorIdHash: { not: null },
                },
                select: { visitorIdHash: true },
                distinct: ['visitorIdHash'],
            }),
            this.prisma.growthEvent.groupBy({
                by: ['variantKey'],
                where: {
                    ...currentWhere,
                    eventType: GrowthEventType.CONTACT_CLICK,
                    variantKey: { not: null },
                },
                _count: { _all: true },
            }),
            this.prisma.growthEvent.groupBy({
                by: ['variantKey'],
                where: {
                    ...currentWhere,
                    eventType: GrowthEventType.WHATSAPP_CLICK,
                    variantKey: { not: null },
                },
                _count: { _all: true },
            }),
            this.prisma.growthEvent.findMany({
                where: {
                    ...currentWhere,
                    eventType: {
                        in: [
                            GrowthEventType.SEARCH_RESULT_CLICK,
                            GrowthEventType.CONTACT_CLICK,
                            GrowthEventType.WHATSAPP_CLICK,
                            GrowthEventType.SHARE_CLICK,
                            GrowthEventType.PASSWORD_RESET_REQUEST,
                            GrowthEventType.PASSWORD_RESET_COMPLETE,
                            GrowthEventType.GOOGLE_AUTH_SUCCESS,
                            GrowthEventType.LISTING_FILTER_APPLY,
                            GrowthEventType.LISTING_VIEW_CHANGE,
                            GrowthEventType.LISTING_MAP_SELECT,
                            GrowthEventType.PREMODERATION_FLAGGED,
                            GrowthEventType.PREMODERATION_RELEASED,
                            GrowthEventType.PREMODERATION_CONFIRMED,
                            GrowthEventType.BUSINESS_ONBOARDING_STEP,
                            GrowthEventType.BUSINESS_ONBOARDING_COMPLETE,
                        ],
                    },
                },
                select: {
                    businessId: true,
                    eventType: true,
                    sessionId: true,
                    metadata: true,
                    occurredAt: true,
                },
            }),
            this.prisma.growthEvent.findMany({
                where: {
                    ...previousWhere,
                    eventType: {
                        in: [
                            GrowthEventType.SEARCH_RESULT_CLICK,
                            GrowthEventType.CONTACT_CLICK,
                            GrowthEventType.WHATSAPP_CLICK,
                            GrowthEventType.SHARE_CLICK,
                            GrowthEventType.PASSWORD_RESET_REQUEST,
                            GrowthEventType.PASSWORD_RESET_COMPLETE,
                            GrowthEventType.GOOGLE_AUTH_SUCCESS,
                            GrowthEventType.LISTING_FILTER_APPLY,
                            GrowthEventType.LISTING_VIEW_CHANGE,
                            GrowthEventType.LISTING_MAP_SELECT,
                            GrowthEventType.PREMODERATION_FLAGGED,
                            GrowthEventType.PREMODERATION_RELEASED,
                            GrowthEventType.PREMODERATION_CONFIRMED,
                            GrowthEventType.BUSINESS_ONBOARDING_STEP,
                            GrowthEventType.BUSINESS_ONBOARDING_COMPLETE,
                        ],
                    },
                },
                select: {
                    businessId: true,
                    eventType: true,
                    sessionId: true,
                    metadata: true,
                    occurredAt: true,
                },
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
                categoryName: category?.name ?? 'Sin categoría',
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
        const currentSignalSummary = this.buildGrowthSignalSummary(
            currentActivationEventRows,
            limit,
        );
        const previousSignalSummary = this.buildGrowthSignalSummary(
            previousActivationEventRows,
            limit,
        );
        const {
            activationMetrics,
            discoveryMetrics,
            moderationMetrics,
            onboardingMetrics,
            derivedMetrics,
        } = currentSignalSummary;
        const actionableAlerts: GrowthActionableAlert[] = [];

        const reviewedPremoderationCount =
            moderationMetrics.premoderationReleased + moderationMetrics.premoderationConfirmed;

        if (activationMetrics.passwordResetRequests >= 5 && derivedMetrics.recoveryCompletionRatePct < 35) {
            actionableAlerts.push(this.buildActionableAlert({
                level: 'MEDIUM',
                title: 'Recovery con baja finalizacion',
                description: `Solo ${derivedMetrics.recoveryCompletionRatePct}% de los resets solicitados se completaron en la ventana analizada.`,
                metricKey: 'password_reset_completion_rate',
                owner: 'Soporte',
                cadence: 'Diario',
                slaHours: 24,
                playbookSection: 'Recuperacion de contrasena',
                recommendedAction: 'Validar entregabilidad del correo, expiracion del enlace y uso del link mas reciente.',
            }));
        }

        if (reviewedPremoderationCount >= 4 && moderationMetrics.releaseRatePct >= 40) {
            actionableAlerts.push(this.buildActionableAlert({
                level: 'HIGH',
                title: 'Premoderacion con release rate elevado',
                description: `${moderationMetrics.releaseRatePct}% de los casos revisados terminaron liberados a KYC; conviene revisar scoring y razones.`,
                metricKey: 'premoderation_release_rate',
                owner: 'Trust & Safety',
                cadence: 'Diario',
                slaHours: 8,
                playbookSection: 'Premoderacion previa a verificacion',
                recommendedAction: 'Revisar top razones, falsos positivos y recalibrar scoring antes de liberar mas volumen.',
            }));
        }

        if (discoveryMetrics.mapViewChanges >= 8 && derivedMetrics.mapSelectionRatePct < 25) {
            actionableAlerts.push(this.buildActionableAlert({
                level: 'MEDIUM',
                title: 'Mapa abierto con poca seleccion',
                description: `La vista mapa tuvo ${discoveryMetrics.mapViewChanges} aperturas pero solo ${discoveryMetrics.mapSelections} selecciones (${derivedMetrics.mapSelectionRatePct}%).`,
                metricKey: 'listing_map_selection_rate',
                owner: 'Growth',
                cadence: 'Semanal',
                slaHours: 72,
                playbookSection: 'Discovery lista/mapa',
                recommendedAction: 'Revisar markers, viewport inicial y contraste de las cards destacadas en el mapa.',
            }));
        }

        if (onboardingMetrics.step1Sessions >= 5 && onboardingMetrics.completionRatePct < 45) {
            actionableAlerts.push(this.buildActionableAlert({
                level: 'HIGH',
                title: 'Onboarding de negocios con friccion',
                description: `Solo ${onboardingMetrics.completionRatePct}% de las sesiones que iniciaron el flujo llegaron a publicacion.`,
                metricKey: 'business_onboarding_completion_rate',
                owner: 'Producto',
                cadence: 'Semanal',
                slaHours: 48,
                playbookSection: 'Onboarding de negocios',
                recommendedAction: 'Revisar salto entre pasos, campos abandonados y simplificar copy o microinteracciones en el paso con mayor caida.',
            }));
        }

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
            activationMetrics,
            discoveryMetrics,
            moderationMetrics,
            onboardingMetrics,
            actionableAlerts,
            trendComparisons: {
                comparisonLabel: `vs ${normalizedDays}d previos`,
                activation: {
                    recoveryCompletionRatePct: this.buildTrendMetric(
                        derivedMetrics.recoveryCompletionRatePct,
                        previousSignalSummary.derivedMetrics.recoveryCompletionRatePct,
                    ),
                    passwordResetRequests: this.buildTrendMetric(
                        activationMetrics.passwordResetRequests,
                        previousSignalSummary.activationMetrics.passwordResetRequests,
                        0,
                    ),
                    googleAuthSuccesses: this.buildTrendMetric(
                        activationMetrics.googleAuthSuccesses,
                        previousSignalSummary.activationMetrics.googleAuthSuccesses,
                        0,
                    ),
                    shareClicks: this.buildTrendMetric(
                        activationMetrics.shareClicks,
                        previousSignalSummary.activationMetrics.shareClicks,
                        0,
                    ),
                },
                discovery: {
                    mapSelectionRatePct: this.buildTrendMetric(
                        derivedMetrics.mapSelectionRatePct,
                        previousSignalSummary.derivedMetrics.mapSelectionRatePct,
                    ),
                    listingResultClicks: this.buildTrendMetric(
                        discoveryMetrics.listingResultClicks,
                        previousSignalSummary.discoveryMetrics.listingResultClicks,
                        0,
                    ),
                    mapViewChanges: this.buildTrendMetric(
                        discoveryMetrics.mapViewChanges,
                        previousSignalSummary.discoveryMetrics.mapViewChanges,
                        0,
                    ),
                    listingFilterApplies: this.buildTrendMetric(
                        discoveryMetrics.listingFilterApplies + discoveryMetrics.listingSortChanges,
                        previousSignalSummary.discoveryMetrics.listingFilterApplies
                            + previousSignalSummary.discoveryMetrics.listingSortChanges,
                        0,
                    ),
                },
                moderation: {
                    releaseRatePct: this.buildTrendMetric(
                        moderationMetrics.releaseRatePct,
                        previousSignalSummary.moderationMetrics.releaseRatePct,
                    ),
                    premoderationFlagged: this.buildTrendMetric(
                        moderationMetrics.premoderationFlagged,
                        previousSignalSummary.moderationMetrics.premoderationFlagged,
                        0,
                    ),
                    uniqueFlaggedBusinesses: this.buildTrendMetric(
                        moderationMetrics.uniqueFlaggedBusinesses,
                        previousSignalSummary.moderationMetrics.uniqueFlaggedBusinesses,
                        0,
                    ),
                },
                onboarding: {
                    completionRatePct: this.buildTrendMetric(
                        onboardingMetrics.completionRatePct,
                        previousSignalSummary.onboardingMetrics.completionRatePct,
                    ),
                    step1Sessions: this.buildTrendMetric(
                        onboardingMetrics.step1Sessions,
                        previousSignalSummary.onboardingMetrics.step1Sessions,
                        0,
                    ),
                    completedSessions: this.buildTrendMetric(
                        onboardingMetrics.completedSessions,
                        previousSignalSummary.onboardingMetrics.completedSessions,
                        0,
                    ),
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

        const [
            records,
            activePromotions,
            pendingBookings,
            confirmedBookings,
            subscription,
            growthEventsSummary,
            bookingsCreated,
            successfulTransactionsSummary,
            adSpendSummary,
        ] = await Promise.all([
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
            this.prisma.growthEvent.groupBy({
                by: ['eventType'],
                where: {
                    organizationId,
                    occurredAt: { gte: rangeStart },
                },
                _count: {
                    _all: true,
                },
            }),
            this.prisma.booking.count({
                where: {
                    organizationId,
                    createdAt: { gte: rangeStart },
                    deletedAt: null,
                },
            }),
            this.prisma.transaction.aggregate({
                where: {
                    organizationId,
                    createdAt: { gte: rangeStart },
                    status: 'SUCCEEDED',
                },
                _sum: {
                    grossAmount: true,
                    platformFeeAmount: true,
                    netAmount: true,
                },
            }),
            this.prisma.adEvent.aggregate({
                where: {
                    occurredAt: { gte: rangeStart },
                    campaign: {
                        is: {
                            organizationId,
                        },
                    },
                },
                _sum: {
                    costAmount: true,
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

        const growthEventsMap = new Map(
            growthEventsSummary.map((item) => [item.eventType, item._count._all]),
        );
        const searchQueries = growthEventsMap.get(GrowthEventType.SEARCH_QUERY) ?? 0;
        const contactClicks = growthEventsMap.get(GrowthEventType.CONTACT_CLICK) ?? 0;
        const whatsappClicks = growthEventsMap.get(GrowthEventType.WHATSAPP_CLICK) ?? 0;
        const bookingIntents = growthEventsMap.get(GrowthEventType.BOOKING_INTENT) ?? 0;

        const transactionRevenue = Number(
            successfulTransactionsSummary._sum.grossAmount?.toString() ?? '0',
        );
        const transactionFees = Number(
            successfulTransactionsSummary._sum.platformFeeAmount?.toString() ?? '0',
        );
        const adSpend = Number(adSpendSummary._sum.costAmount?.toString() ?? '0');
        const monthlySubscriptionCost = Number(
            subscription?.plan.priceMonthly?.toString() ?? '0',
        );
        const proratedSubscriptionCost = monthlySubscriptionCost * (normalizedDays / 30);
        const totalCosts = transactionFees + adSpend + proratedSubscriptionCost;
        const periodRevenue = transactionRevenue > 0 ? transactionRevenue : totals.grossRevenue;
        const netRevenue = periodRevenue - totalCosts;

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
            funnel: {
                searchQueries,
                contactClicks,
                whatsappClicks,
                bookingIntents,
                bookingsCreated,
                searchToContactRate: searchQueries > 0
                    ? Number(((contactClicks / searchQueries) * 100).toFixed(2))
                    : 0,
                contactToWhatsappRate: contactClicks > 0
                    ? Number(((whatsappClicks / contactClicks) * 100).toFixed(2))
                    : 0,
                whatsappToBookingRate: whatsappClicks > 0
                    ? Number(((bookingIntents / whatsappClicks) * 100).toFixed(2))
                    : 0,
                bookingIntentToBookingRate: bookingIntents > 0
                    ? Number(((bookingsCreated / bookingIntents) * 100).toFixed(2))
                    : 0,
            },
            roi: {
                periodRevenue: this.roundMoney(periodRevenue),
                transactionFees: this.roundMoney(transactionFees),
                adSpend: this.roundMoney(adSpend),
                subscriptionCost: this.roundMoney(proratedSubscriptionCost),
                totalCosts: this.roundMoney(totalCosts),
                netRevenue: this.roundMoney(netRevenue),
                roiPercent: totalCosts > 0
                    ? Number(((netRevenue / totalCosts) * 100).toFixed(2))
                    : 0,
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

    private readMetadataString(
        metadata: Prisma.JsonValue | null,
        key: string,
    ): string | null {
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            return null;
        }

        const candidate = (metadata as Record<string, Prisma.JsonValue>)[key];
        return typeof candidate === 'string' ? candidate : null;
    }

    private readMetadataStringArray(
        metadata: Prisma.JsonValue | null,
        key: string,
    ): string[] {
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            return [];
        }

        const candidate = (metadata as Record<string, Prisma.JsonValue>)[key];
        if (!Array.isArray(candidate)) {
            return [];
        }

        return candidate.filter((value): value is string => typeof value === 'string');
    }

    private readMetadataNumber(
        metadata: Prisma.JsonValue | null,
        key: string,
    ): number | null {
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            return null;
        }

        const candidate = (metadata as Record<string, Prisma.JsonValue>)[key];
        return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
    }

    private buildGrowthSignalSummary(
        rows: GrowthSignalEventRow[],
        limit: number,
    ): GrowthSignalSummary {
        const activationMetrics = {
            shareClicks: 0,
            passwordResetRequests: 0,
            passwordResetCompletions: 0,
            googleAuthSuccesses: 0,
            googleAuthLoginSuccesses: 0,
            googleAuthRegistrationSuccesses: 0,
            stickyPhoneClicks: 0,
            stickyWhatsAppClicks: 0,
            totalWhatsAppClicks: 0,
        };
        const discoveryMetrics = {
            listingFilterApplies: 0,
            listingSortChanges: 0,
            mapViewChanges: 0,
            listViewChanges: 0,
            mapSelections: 0,
            listingResultClicks: 0,
            sponsoredResultClicks: 0,
        };
        const flaggedBusinessIds = new Set<string>();
        const moderationReasonCounts = new Map<string, number>();
        const moderationMetrics = {
            premoderationFlagged: 0,
            uniqueFlaggedBusinesses: 0,
            premoderationReleased: 0,
            premoderationConfirmed: 0,
            releaseRatePct: 0,
            topReasons: [] as Array<{ reason: string; count: number }>,
        };
        const onboardingStepSessions = {
            1: new Set<string>(),
            2: new Set<string>(),
            3: new Set<string>(),
            4: new Set<string>(),
        };
        const onboardingCompletionSessions = new Set<string>();
        const onboardingMetrics = {
            step1Sessions: 0,
            step2Sessions: 0,
            step3Sessions: 0,
            step4Sessions: 0,
            completedSessions: 0,
            completionRatePct: 0,
        };

        for (const row of rows) {
            switch (row.eventType) {
                case GrowthEventType.SEARCH_RESULT_CLICK: {
                    const source = this.readMetadataString(row.metadata, 'source');
                    if (source === 'businesses-list' || source === 'listing-map-selected') {
                        discoveryMetrics.listingResultClicks += 1;
                    }
                    if (source === 'sponsored-placement') {
                        discoveryMetrics.sponsoredResultClicks += 1;
                    }
                    break;
                }
                case GrowthEventType.SHARE_CLICK:
                    activationMetrics.shareClicks += 1;
                    break;
                case GrowthEventType.PASSWORD_RESET_REQUEST:
                    activationMetrics.passwordResetRequests += 1;
                    break;
                case GrowthEventType.PASSWORD_RESET_COMPLETE:
                    activationMetrics.passwordResetCompletions += 1;
                    break;
                case GrowthEventType.GOOGLE_AUTH_SUCCESS: {
                    activationMetrics.googleAuthSuccesses += 1;
                    const intent = this.readMetadataString(row.metadata, 'intent');
                    if (intent === 'login') {
                        activationMetrics.googleAuthLoginSuccesses += 1;
                    } else if (intent === 'register') {
                        activationMetrics.googleAuthRegistrationSuccesses += 1;
                    }
                    break;
                }
                case GrowthEventType.CONTACT_CLICK: {
                    const placement = this.readMetadataString(row.metadata, 'placement');
                    const channel = this.readMetadataString(row.metadata, 'channel');
                    if (placement === 'sticky_mobile' && channel === 'phone') {
                        activationMetrics.stickyPhoneClicks += 1;
                    }
                    break;
                }
                case GrowthEventType.WHATSAPP_CLICK: {
                    activationMetrics.totalWhatsAppClicks += 1;
                    const placement = this.readMetadataString(row.metadata, 'placement');
                    if (placement === 'sticky_mobile') {
                        activationMetrics.stickyWhatsAppClicks += 1;
                    }
                    break;
                }
                case GrowthEventType.LISTING_FILTER_APPLY: {
                    const filterKey = this.readMetadataString(row.metadata, 'filterKey');
                    if (filterKey === 'sort') {
                        discoveryMetrics.listingSortChanges += 1;
                    } else {
                        discoveryMetrics.listingFilterApplies += 1;
                    }
                    break;
                }
                case GrowthEventType.LISTING_VIEW_CHANGE: {
                    const nextView = this.readMetadataString(row.metadata, 'nextView');
                    if (nextView === 'map') {
                        discoveryMetrics.mapViewChanges += 1;
                    } else if (nextView === 'list') {
                        discoveryMetrics.listViewChanges += 1;
                    }
                    break;
                }
                case GrowthEventType.LISTING_MAP_SELECT:
                    discoveryMetrics.mapSelections += 1;
                    break;
                case GrowthEventType.PREMODERATION_FLAGGED: {
                    moderationMetrics.premoderationFlagged += 1;
                    if (row.businessId) {
                        flaggedBusinessIds.add(row.businessId);
                    }
                    this.readMetadataStringArray(row.metadata, 'reasons').forEach((reason) => {
                        moderationReasonCounts.set(reason, (moderationReasonCounts.get(reason) ?? 0) + 1);
                    });
                    break;
                }
                case GrowthEventType.PREMODERATION_RELEASED:
                    moderationMetrics.premoderationReleased += 1;
                    break;
                case GrowthEventType.PREMODERATION_CONFIRMED:
                    moderationMetrics.premoderationConfirmed += 1;
                    break;
                case GrowthEventType.BUSINESS_ONBOARDING_STEP: {
                    const step = this.readMetadataNumber(row.metadata, 'step');
                    if (!row.sessionId || !step || !(step in onboardingStepSessions)) {
                        break;
                    }
                    onboardingStepSessions[step as 1 | 2 | 3 | 4].add(row.sessionId);
                    break;
                }
                case GrowthEventType.BUSINESS_ONBOARDING_COMPLETE:
                    if (row.sessionId) {
                        onboardingCompletionSessions.add(row.sessionId);
                    }
                    break;
                default:
                    break;
            }
        }

        moderationMetrics.uniqueFlaggedBusinesses = flaggedBusinessIds.size;
        const reviewedPremoderationCount =
            moderationMetrics.premoderationReleased + moderationMetrics.premoderationConfirmed;
        moderationMetrics.releaseRatePct = reviewedPremoderationCount > 0
            ? Number(((moderationMetrics.premoderationReleased / reviewedPremoderationCount) * 100).toFixed(2))
            : 0;
        moderationMetrics.topReasons = [...moderationReasonCounts.entries()]
            .map(([reason, count]) => ({ reason, count }))
            .sort((left, right) => right.count - left.count)
            .slice(0, limit);
        onboardingMetrics.step1Sessions = onboardingStepSessions[1].size;
        onboardingMetrics.step2Sessions = onboardingStepSessions[2].size;
        onboardingMetrics.step3Sessions = onboardingStepSessions[3].size;
        onboardingMetrics.step4Sessions = onboardingStepSessions[4].size;
        onboardingMetrics.completedSessions = onboardingCompletionSessions.size;
        onboardingMetrics.completionRatePct = onboardingMetrics.step1Sessions > 0
            ? Number(((onboardingMetrics.completedSessions / onboardingMetrics.step1Sessions) * 100).toFixed(2))
            : 0;

        return {
            activationMetrics,
            discoveryMetrics,
            moderationMetrics,
            onboardingMetrics,
            derivedMetrics: {
                recoveryCompletionRatePct: activationMetrics.passwordResetRequests > 0
                    ? Number(((activationMetrics.passwordResetCompletions / activationMetrics.passwordResetRequests) * 100).toFixed(2))
                    : 0,
                mapSelectionRatePct: discoveryMetrics.mapViewChanges > 0
                    ? Number(((discoveryMetrics.mapSelections / discoveryMetrics.mapViewChanges) * 100).toFixed(2))
                    : 0,
            },
        };
    }

    private buildTrendMetric(
        current: number,
        previous: number,
        precision = 2,
    ): GrowthTrendMetric {
        const normalize = (value: number) => (
            precision === 0
                ? Math.round(value)
                : Number(value.toFixed(precision))
        );
        const normalizedCurrent = normalize(current);
        const normalizedPrevious = normalize(previous);
        const delta = normalize(normalizedCurrent - normalizedPrevious);

        return {
            current: normalizedCurrent,
            previous: normalizedPrevious,
            delta,
            direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
        };
    }

    private buildActionableAlert(alert: GrowthActionableAlert): GrowthActionableAlert {
        return alert;
    }

    private normalizeDays(days: number | string | null | undefined): number {
        const parsedDays = typeof days === 'string'
            ? Number.parseInt(days, 10)
            : days;

        if (!Number.isFinite(parsedDays)) {
            return 30;
        }
        const safeDays = parsedDays as number;
        return Math.min(Math.max(Math.floor(safeDays), 1), 365);
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
