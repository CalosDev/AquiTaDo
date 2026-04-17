import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../cache/redis.service';
import { hashedCacheKey } from '../cache/cache-key';
import { AnalyticsService } from '../analytics/analytics.service';
import {
    BusinessQueryDto,
    NearbyQueryDto,
} from '../businesses/dto/business.dto';
import {
    buildTodayBusinessHoursLabel,
    calculateBusinessProfileCompletenessScore,
    isBusinessOpenNow,
} from '../businesses/business-profile';
import { NearbyBusinessesQueryDto } from '../discovery/dto/discovery.dto';
import {
    ReindexBusinessesQueryDto,
    SearchBusinessesQueryDto,
} from './dto/search-businesses.dto';
import {
    calculateBusinessDiscoveryRelevance,
    DiscoveryPopularitySignals,
} from './discovery-ranking';
import {
    normalizeCatalogSource,
    toLifecycleStatus,
} from '../businesses/catalog-taxonomy.helpers';

type DiscoveryTrackingContext = {
    visitorId?: string;
    sessionId?: string;
    source?: string | null;
};

type NormalizedPublicDiscoveryQuery = {
    search: string | null;
    categoryId: string | null;
    categorySlug: string | null;
    provinceId: string | null;
    provinceSlug: string | null;
    cityId: string | null;
    sectorId: string | null;
    feature: string | null;
    openNow: boolean;
    lat: number | null;
    lng: number | null;
    radiusKm: number | null;
    page: number;
    limit: number;
};

const publicBusinessRankingSelect = {
    id: true,
    name: true,
    description: true,
    address: true,
    phone: true,
    whatsapp: true,
    website: true,
    email: true,
    instagramUrl: true,
    facebookUrl: true,
    tiktokUrl: true,
    priceRange: true,
    verified: true,
    publicStatus: true,
    claimStatus: true,
    source: true,
    catalogSource: true,
    lifecycleStatus: true,
    isClaimable: true,
    isActive: true,
    primaryManagingOrganizationId: true,
    reputationScore: true,
    verificationStatus: true,
    createdAt: true,
    latitude: true,
    longitude: true,
    province: {
        select: { name: true },
    },
    city: {
        select: { name: true },
    },
    sector: {
        select: { name: true },
    },
    categories: {
        select: {
            category: {
                select: { name: true },
            },
        },
    },
    images: {
        select: { isCover: true },
        orderBy: [
            { isCover: Prisma.SortOrder.desc },
            { sortOrder: Prisma.SortOrder.asc },
            { id: Prisma.SortOrder.asc },
        ],
        take: 1,
    },
    hours: {
        select: {
            dayOfWeek: true,
            opensAt: true,
            closesAt: true,
            closed: true,
        },
        orderBy: { dayOfWeek: Prisma.SortOrder.asc },
    },
    _count: {
        select: { reviews: true },
    },
} satisfies Prisma.BusinessSelect;

const publicBusinessListItemHydrationSelect = {
    id: true,
    slug: true,
    province: {
        select: { id: true, name: true, slug: true },
    },
    city: {
        select: { id: true, name: true, slug: true },
    },
    sector: {
        select: { id: true, name: true, slug: true },
    },
    categories: {
        select: {
            category: {
                select: { id: true, name: true, slug: true, icon: true, parentId: true },
            },
        },
    },
    images: {
        select: { id: true, url: true, isCover: true, caption: true, type: true },
        orderBy: [
            { isCover: Prisma.SortOrder.desc },
            { sortOrder: Prisma.SortOrder.asc },
            { id: Prisma.SortOrder.asc },
        ],
        take: 1,
    },
} satisfies Prisma.BusinessSelect;

type PublicBusinessRankingCandidate = Prisma.BusinessGetPayload<{
    select: typeof publicBusinessRankingSelect;
}>;

type PublicBusinessListItemHydration = Prisma.BusinessGetPayload<{
    select: typeof publicBusinessListItemHydrationSelect;
}>;

type RankedBusinessCandidate = PublicBusinessRankingCandidate & {
    relevanceScore: number;
    distanceKm: number | null;
};

type NearbyDiscoveryQuery = {
    lat: number;
    lng: number;
    radiusKm?: number;
    limit?: number;
    categoryId?: string;
    sectorId?: string;
    organizationId?: string;
};

type NearbyBusinessRow = {
    id: string;
    name: string;
    slug: string;
    address: string;
    verified: boolean;
    organizationId: string | null;
    provinceId: string;
    cityId: string | null;
    sectorId: string | null;
    distanceMeters: number;
};

type DistanceFilteredBusinessRow = {
    id: string;
};

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);
    private static readonly PUBLIC_DISCOVERY_CACHE_PREFIX = 'public:businesses:discovery';
    private static readonly PUBLIC_NEARBY_CACHE_PREFIX = 'public:businesses:nearby';
    private static readonly LEGACY_SEARCH_CACHE_PREFIX = 'search:businesses:list';
    private static readonly LEGACY_PUBLIC_LIST_CACHE_PREFIX = 'public:businesses:list';

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(AnalyticsService)
        private readonly analyticsService: AnalyticsService,
    ) { }

    async onModuleInit() {
        this.logger.log('Search provider: PostgreSQL');
    }

    isConfigured(): boolean {
        return true;
    }

    async ping(): Promise<boolean | null> {
        return true;
    }

    async listPublicBusinesses(
        query: BusinessQueryDto,
        trackingContext?: DiscoveryTrackingContext,
    ) {
        const normalizedQuery = this.normalizePublicDiscoveryQuery(query);
        const cacheKey = hashedCacheKey(SearchService.PUBLIC_DISCOVERY_CACHE_PREFIX, normalizedQuery);
        const result = await this.redisService.rememberJsonStaleWhileRevalidate(cacheKey, 45, 300, async () => {
            return this.listPublicBusinessesViaDatabase(normalizedQuery);
        });

        if (this.shouldTrackDiscoveryIntent(normalizedQuery)) {
            void this.analyticsService.trackGrowthEvent({
                eventType: 'SEARCH_QUERY',
                categoryId: normalizedQuery.categoryId ?? undefined,
                provinceId: normalizedQuery.provinceId ?? undefined,
                cityId: normalizedQuery.cityId ?? undefined,
                searchQuery: normalizedQuery.search || undefined,
                visitorId: trackingContext?.visitorId,
                sessionId: trackingContext?.sessionId,
                metadata: {
                    source: trackingContext?.source ?? 'api.businesses.list',
                    page: normalizedQuery.page,
                    limit: normalizedQuery.limit,
                    feature: normalizedQuery.feature ?? undefined,
                    sectorId: normalizedQuery.sectorId ?? undefined,
                    openNow: normalizedQuery.openNow,
                    geoContext: normalizedQuery.lat !== null && normalizedQuery.lng !== null,
                    resultCount: Array.isArray((result as { data?: unknown }).data)
                        ? ((result as { data: unknown[] }).data.length)
                        : null,
                    resultSource: (result as { source?: string }).source ?? null,
                },
            }).catch(() => undefined);
        }

        return result;
    }

    async searchBusinesses(
        query: SearchBusinessesQueryDto,
        trackingContext?: DiscoveryTrackingContext,
    ) {
        return this.listPublicBusinesses(
            {
                search: query.q,
                categoryId: query.categoryId,
                categorySlug: query.categorySlug,
                provinceId: query.provinceId,
                provinceSlug: query.provinceSlug,
                cityId: query.cityId,
                sectorId: query.sectorId,
                feature: query.feature,
                openNow: query.openNow,
                latitude: query.lat,
                longitude: query.lng,
                radiusKm: query.radiusKm,
                page: query.page,
                limit: query.limit,
            },
            {
                ...trackingContext,
                source: trackingContext?.source ?? 'api.search.businesses',
            },
        );
    }

    async findNearbyBusinesses(query: NearbyDiscoveryQuery | NearbyBusinessesQueryDto | NearbyQueryDto) {
        const normalizedQuery = this.normalizeNearbyQuery(query);
        const cacheKey = hashedCacheKey(SearchService.PUBLIC_NEARBY_CACHE_PREFIX, normalizedQuery);
        return this.redisService.rememberJsonStaleWhileRevalidate(cacheKey, 30, 180, async () => {
            const radiusKm = normalizedQuery.radiusKm ?? 5;
            const radiusMeters = radiusKm * 1000;
            const limit = normalizedQuery.limit ?? 25;
            const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${normalizedQuery.lng}, ${normalizedQuery.lat}), 4326)::geography`;

            const categoryClause = normalizedQuery.categoryId
                ? Prisma.sql`
                    AND EXISTS (
                        SELECT 1
                        FROM business_categories bc
                        WHERE bc."businessId" = b.id
                          AND bc."categoryId" = ${normalizedQuery.categoryId}
                    )
                `
                : Prisma.empty;

            const organizationClause = normalizedQuery.organizationId
                ? Prisma.sql`
                    AND EXISTS (
                        SELECT 1
                        FROM business_ownerships bo
                        WHERE bo."businessId" = b.id
                          AND bo."organizationId" = ${normalizedQuery.organizationId}
                          AND bo."isActive" = true
                    )
                `
                : Prisma.empty;

            const rows = await this.prisma.$queryRaw<NearbyBusinessRow[]>(Prisma.sql`
                SELECT
                    b.id,
                    b.name,
                    b.slug,
                    b.address,
                    b.verified,
                    COALESCE(b."primaryManagingOrganizationId", b."organizationId") AS "organizationId",
                    b."provinceId",
                    b."cityId",
                    b."sectorId",
                    ST_Distance(b.location::geography, ${origin}) AS "distanceMeters"
                FROM businesses b
                WHERE b."deletedAt" IS NULL
                  AND b."isActive" = true
                  AND b."publicStatus" = 'PUBLISHED'
                  AND b."isPublished" = true
                  AND b."isSearchable" = true
                  AND b."isDiscoverable" = true
                  AND b.location IS NOT NULL
                  AND ST_DWithin(
                        b.location::geography,
                        ${origin},
                        ${radiusMeters}
                  )
                  ${organizationClause}
                  ${categoryClause}
                  ${normalizedQuery.sectorId ? Prisma.sql`AND b."sectorId" = ${normalizedQuery.sectorId}` : Prisma.empty}
                ORDER BY "distanceMeters" ASC
                LIMIT ${limit}
            `);

            return {
                data: rows.map((row) => ({
                    id: row.id,
                    name: row.name,
                    slug: row.slug,
                    address: row.address,
                    verified: row.verified,
                    organizationId: row.organizationId,
                    provinceId: row.provinceId,
                    cityId: row.cityId,
                    sectorId: row.sectorId,
                    distanceMeters: Number(row.distanceMeters),
                    distanceKm: Number((Number(row.distanceMeters) / 1000).toFixed(2)),
                    distance: Number((Number(row.distanceMeters) / 1000).toFixed(2)),
                })),
                count: rows.length,
                radiusKm,
                limit,
                source: 'discovery',
            };
        });
    }

    async reindexBusinesses(_query: ReindexBusinessesQueryDto = {}) {
        await this.invalidateSearchCache();
        return {
            indexedCount: 0,
            source: 'database',
            message: 'No se requiere reindexacion: la busqueda usa PostgreSQL y cache organico',
        };
    }

    async indexBusinessById(_businessId: string): Promise<void> {
        await this.invalidateSearchCache();
    }

    async removeBusiness(_businessId: string): Promise<void> {
        await this.invalidateSearchCache();
    }

    private async listPublicBusinessesViaDatabase(query: NormalizedPublicDiscoveryQuery) {
        const where = await this.buildPublicWhere(query);
        let candidates = await this.prisma.business.findMany({
            where,
            select: publicBusinessRankingSelect,
        });

        if (query.openNow) {
            candidates = candidates.filter((candidate) => isBusinessOpenNow(candidate.hours) === true);
        }

        if (candidates.length === 0) {
            return {
                data: [],
                total: 0,
                page: query.page,
                limit: query.limit,
                totalPages: 1,
                source: 'discovery',
            };
        }

        const popularityByBusinessId = await this.loadPopularitySignals(candidates.map((business) => business.id));
        const rankedBusinesses = candidates
            .map((candidate) => this.rankCandidate(candidate, query, popularityByBusinessId.get(candidate.id)))
            .sort((left, right) => this.compareRankedBusinesses(left, right));

        const skip = (query.page - 1) * query.limit;
        const paginatedCandidates = rankedBusinesses.slice(skip, skip + query.limit);
        const hydratedPageItems = paginatedCandidates.length > 0
            ? await this.prisma.business.findMany({
                where: {
                    id: {
                        in: paginatedCandidates.map((candidate) => candidate.id),
                    },
                },
                select: publicBusinessListItemHydrationSelect,
            })
            : [];
        const hydratedPageItemsById = new Map(
            hydratedPageItems.map((candidate) => [candidate.id, candidate] as const),
        );
        const paginatedData = paginatedCandidates.map((candidate) => {
            const hydratedCandidate = hydratedPageItemsById.get(candidate.id);
            if (!hydratedCandidate) {
                return null;
            }

            return this.toPublicBusinessListItem(candidate, hydratedCandidate);
        }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

        return {
            data: paginatedData,
            total: rankedBusinesses.length,
            page: query.page,
            limit: query.limit,
            totalPages: Math.max(Math.ceil(rankedBusinesses.length / query.limit), 1),
            source: 'discovery',
        };
    }

    private rankCandidate(
        candidate: PublicBusinessRankingCandidate,
        query: NormalizedPublicDiscoveryQuery,
        popularitySignals?: DiscoveryPopularitySignals,
    ): RankedBusinessCandidate {
        const ranking = calculateBusinessDiscoveryRelevance(
            candidate,
            {
                search: query.search,
                lat: query.lat,
                lng: query.lng,
                radiusKm: query.radiusKm,
            },
            popularitySignals,
        );

        return {
            ...candidate,
            relevanceScore: ranking.score,
            distanceKm: ranking.breakdown.distanceKm,
        };
    }

    private compareRankedBusinesses(left: RankedBusinessCandidate, right: RankedBusinessCandidate): number {
        if (right.relevanceScore !== left.relevanceScore) {
            return right.relevanceScore - left.relevanceScore;
        }

        if (left.distanceKm !== null && right.distanceKm !== null && left.distanceKm !== right.distanceKm) {
            return left.distanceKm - right.distanceKm;
        }

        const reviewCountDelta = (right._count?.reviews ?? 0) - (left._count?.reviews ?? 0);
        if (reviewCountDelta !== 0) {
            return reviewCountDelta;
        }

        const reputationDelta = Number(right.reputationScore) - Number(left.reputationScore);
        if (reputationDelta !== 0) {
            return reputationDelta;
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
    }

    private normalizePublicDiscoveryQuery(query: BusinessQueryDto): NormalizedPublicDiscoveryQuery {
        const page = query.page && Number.isFinite(query.page) && query.page > 0 ? Math.floor(query.page) : 1;
        const requestedLimit = query.limit && Number.isFinite(query.limit) && query.limit > 0
            ? Math.floor(query.limit)
            : 12;
        const limit = Math.min(requestedLimit, 24);

        return {
            search: query.search?.trim() || null,
            categoryId: query.categoryId ?? null,
            categorySlug: query.categorySlug?.trim() || null,
            provinceId: query.provinceId ?? null,
            provinceSlug: query.provinceSlug?.trim() || null,
            cityId: query.cityId ?? null,
            sectorId: query.sectorId ?? null,
            feature: query.feature?.trim() || null,
            openNow: Boolean(query.openNow),
            lat: typeof query.latitude === 'number' ? query.latitude : null,
            lng: typeof query.longitude === 'number' ? query.longitude : null,
            radiusKm: typeof query.radiusKm === 'number' ? query.radiusKm : null,
            page,
            limit,
        };
    }

    private normalizeNearbyQuery(query: NearbyDiscoveryQuery | NearbyBusinessesQueryDto | NearbyQueryDto) {
        const radiusCandidate = 'radiusKm' in query && typeof query.radiusKm === 'number'
            ? query.radiusKm
            : 'radius' in query && typeof query.radius === 'number'
                ? query.radius
                : undefined;

        return {
            lat: query.lat,
            lng: query.lng,
            radiusKm: radiusCandidate ? Math.min(Math.max(radiusCandidate, 0.1), 100) : 5,
            limit: 'limit' in query && typeof query.limit === 'number'
                ? Math.min(Math.max(query.limit, 1), 50)
                : 25,
            categoryId: 'categoryId' in query ? query.categoryId : undefined,
            sectorId: 'sectorId' in query ? query.sectorId : undefined,
            organizationId: 'organizationId' in query ? query.organizationId : undefined,
        };
    }

    private async buildPublicWhere(query: NormalizedPublicDiscoveryQuery): Promise<Prisma.BusinessWhereInput> {
        const where: Prisma.BusinessWhereInput = {
            deletedAt: null,
            isActive: true,
            publicStatus: 'PUBLISHED',
            isPublished: true,
            isSearchable: true,
            isDiscoverable: true,
        };

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
                { address: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        const categoryFilterIds = await this.resolveCategoryFilterIds(query.categoryId, query.categorySlug);
        if (categoryFilterIds.length > 0) {
            where.categories = {
                some: {
                    categoryId: {
                        in: categoryFilterIds,
                    },
                },
            };
        } else if (query.categoryId || query.categorySlug) {
            where.id = '__no_category_match__';
            return where;
        }

        if (query.provinceId) {
            where.provinceId = query.provinceId;
        } else if (query.provinceSlug) {
            where.province = {
                slug: query.provinceSlug,
            };
        }

        if (query.cityId) {
            where.cityId = query.cityId;
        }

        if (query.sectorId) {
            where.sectorId = query.sectorId;
        }

        if (query.feature) {
            const featureIds = await this.resolveFeatureIds(query.feature);
            if (featureIds.length === 0) {
                where.id = '__no_feature_match__';
                return where;
            }

            where.features = {
                some: {
                    featureId: {
                        in: featureIds,
                    },
                },
            };
        }

        const geoFilteredBusinessIds = await this.resolveGeoFilteredBusinessIds(query);
        if (geoFilteredBusinessIds) {
            if (geoFilteredBusinessIds.length === 0) {
                where.id = '__no_geo_match__';
                return where;
            }

            where.id = {
                in: geoFilteredBusinessIds,
            };
        }

        return where;
    }

    private toPublicBusinessListItem(
        candidate: RankedBusinessCandidate,
        hydratedCandidate: PublicBusinessListItemHydration,
    ) {
        return {
            id: candidate.id,
            name: candidate.name,
            slug: hydratedCandidate.slug,
            description: candidate.description,
            address: candidate.address,
            verified: candidate.verified,
            publicStatus: candidate.publicStatus,
            claimStatus: candidate.claimStatus,
            source: candidate.source,
            catalogSource: normalizeCatalogSource(candidate.catalogSource ?? candidate.source),
            lifecycleStatus: toLifecycleStatus({
                lifecycleStatus: candidate.lifecycleStatus,
                publicStatus: candidate.publicStatus,
                isActive: candidate.isActive,
            }),
            isActive: candidate.isActive,
            isClaimable: candidate.isClaimable,
            reputationScore: candidate.reputationScore,
            verificationStatus: candidate.verificationStatus,
            primaryManagingOrganizationId: candidate.primaryManagingOrganizationId,
            province: hydratedCandidate.province,
            city: hydratedCandidate.city,
            categories: hydratedCandidate.categories,
            images: hydratedCandidate.images,
            _count: candidate._count,
            relevanceScore: candidate.relevanceScore,
            distanceKm: candidate.distanceKm,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            priceRange: candidate.priceRange,
            sector: hydratedCandidate.sector,
            openNow: isBusinessOpenNow(candidate.hours),
            todayHoursLabel: buildTodayBusinessHoursLabel(candidate.hours),
            profileCompletenessScore: calculateBusinessProfileCompletenessScore(candidate),
        };
    }

    private async resolveGeoFilteredBusinessIds(query: NormalizedPublicDiscoveryQuery): Promise<string[] | null> {
        if (typeof query.lat !== 'number' || typeof query.lng !== 'number') {
            return null;
        }

        const radiusKm = query.radiusKm ?? 5;
        const radiusMeters = radiusKm * 1000;
        const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography`;
        const rows = await this.prisma.$queryRaw<DistanceFilteredBusinessRow[]>(Prisma.sql`
            SELECT b.id
            FROM businesses b
            WHERE b."deletedAt" IS NULL
              AND b."isActive" = true
              AND b."publicStatus" = 'PUBLISHED'
              AND b."isPublished" = true
              AND b."isSearchable" = true
              AND b."isDiscoverable" = true
              AND b.location IS NOT NULL
              AND ST_DWithin(
                    b.location::geography,
                    ${origin},
                    ${radiusMeters}
              )
        `);

        return rows.map((row) => row.id);
    }

    private async resolveFeatureIds(featureQuery: string): Promise<string[]> {
        const rows = await this.prisma.feature.findMany({
            where: {
                name: {
                    contains: featureQuery,
                    mode: 'insensitive',
                },
            },
            select: { id: true },
            take: 25,
        });
        return rows.map((row) => row.id);
    }

    private async resolveCategoryFilterIds(categoryId: string | null, categorySlug: string | null): Promise<string[]> {
        if (!categoryId && !categorySlug) {
            return [];
        }

        const category = await this.prisma.category.findFirst({
            where: categoryId ? { id: categoryId } : { slug: categorySlug ?? undefined },
            select: { id: true },
        });

        if (!category) {
            return [];
        }

        const children = await this.prisma.category.findMany({
            where: { parentId: category.id },
            select: { id: true },
        });

        return [category.id, ...children.map((entry) => entry.id)];
    }

    private async loadPopularitySignals(businessIds: string[]): Promise<Map<string, DiscoveryPopularitySignals>> {
        if (businessIds.length === 0) {
            return new Map();
        }

        const rangeStart = new Date();
        rangeStart.setDate(rangeStart.getDate() - 30);

        const rows = await this.prisma.businessAnalytics.groupBy({
            by: ['businessId'],
            where: {
                businessId: {
                    in: businessIds,
                },
                date: {
                    gte: rangeStart,
                },
            },
            _sum: {
                views: true,
                clicks: true,
                reservationRequests: true,
            },
        });

        return new Map(
            rows.map((row) => [
                row.businessId,
                {
                    views: row._sum.views ?? 0,
                    clicks: row._sum.clicks ?? 0,
                    reservationRequests: row._sum.reservationRequests ?? 0,
                },
            ]),
        );
    }

    private shouldTrackDiscoveryIntent(query: NormalizedPublicDiscoveryQuery): boolean {
        return Boolean(
            query.search
            || query.categoryId
            || query.categorySlug
            || query.provinceId
            || query.provinceSlug
            || query.cityId
            || query.sectorId
            || query.feature,
        );
    }

    private async invalidateSearchCache(): Promise<void> {
        await Promise.all([
            this.redisService.deleteByPrefix(`${SearchService.PUBLIC_DISCOVERY_CACHE_PREFIX}:`),
            this.redisService.deleteByPrefix(`${SearchService.PUBLIC_NEARBY_CACHE_PREFIX}:`),
            this.redisService.deleteByPrefix(`${SearchService.LEGACY_SEARCH_CACHE_PREFIX}:`),
            this.redisService.deleteByPrefix(`${SearchService.LEGACY_PUBLIC_LIST_CACHE_PREFIX}:`),
        ]);
    }
}
