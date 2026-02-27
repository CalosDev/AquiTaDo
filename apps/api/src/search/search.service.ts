import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../cache/redis.service';
import { hashedCacheKey } from '../cache/cache-key';
import { AnalyticsService } from '../analytics/analytics.service';
import {
    ReindexBusinessesQueryDto,
    SearchBusinessesQueryDto,
} from './dto/search-businesses.dto';
import { MeiliSearch } from 'meilisearch';

type SearchBusinessDocument = {
    id: string;
    name: string;
    slug: string;
    description: string;
    address: string;
    verified: boolean;
    reputationScore: number;
    provinceId: string;
    province: { id: string; name: string; slug: string };
    city: { id: string; name: string } | null;
    categoryIds: string[];
    categories: Array<{ id: string; name: string; slug: string; icon: string | null }>;
    images: Array<{ id: string; url: string }>;
    reviewsCount: number;
    updatedAt: string;
};

@Injectable()
export class SearchService implements OnModuleInit {
    private readonly logger = new Logger(SearchService.name);
    private meiliClient: MeiliSearch | null = null;
    private meiliIndexUid = 'businesses';

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(AnalyticsService)
        private readonly analyticsService: AnalyticsService,
    ) { }

    async onModuleInit() {
        const meiliHost = this.configService.get<string>('MEILISEARCH_HOST')?.trim();
        if (!meiliHost) {
            this.logger.log('Meilisearch disabled: MEILISEARCH_HOST not configured');
            return;
        }

        this.meiliIndexUid =
            this.configService.get<string>('MEILISEARCH_INDEX_BUSINESSES')?.trim() || 'businesses';

        this.meiliClient = new MeiliSearch({
            host: meiliHost,
            apiKey: this.configService.get<string>('MEILISEARCH_API_KEY')?.trim() || undefined,
        });

        try {
            await this.ensureMeiliIndexConfiguration();
            this.logger.log(`Meilisearch enabled (index="${this.meiliIndexUid}")`);
        } catch (error) {
            this.logger.warn(
                `Meilisearch setup failed; falling back to database search (${error instanceof Error ? error.message : String(error)})`,
            );
            this.meiliClient = null;
        }
    }

    async searchBusinesses(
        query: SearchBusinessesQueryDto,
        trackingContext?: { visitorId?: string; sessionId?: string; source?: string | null },
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 12;
        const normalizedQuery = {
            q: query.q?.trim() ?? '',
            categoryId: query.categoryId ?? null,
            provinceId: query.provinceId ?? null,
            cityId: query.cityId ?? null,
            page,
            limit,
        };

        const cacheKey = hashedCacheKey('search:businesses:list', normalizedQuery);
        const result = await this.redisService.rememberJsonStaleWhileRevalidate(cacheKey, 30, 180, async () => {
            if (this.meiliClient) {
                try {
                    return await this.searchBusinessesViaMeili(normalizedQuery);
                } catch (error) {
                    this.logger.warn(
                        `Meilisearch query failed; using database fallback (${error instanceof Error ? error.message : String(error)})`,
                    );
                }
            }

            return this.searchBusinessesViaDatabase(normalizedQuery);
        });

        void this.analyticsService.trackGrowthEvent({
            eventType: 'SEARCH_QUERY',
            categoryId: normalizedQuery.categoryId ?? undefined,
            provinceId: normalizedQuery.provinceId ?? undefined,
            cityId: normalizedQuery.cityId ?? undefined,
            searchQuery: normalizedQuery.q || undefined,
            visitorId: trackingContext?.visitorId,
            sessionId: trackingContext?.sessionId,
            metadata: {
                source: trackingContext?.source ?? 'search-endpoint',
                page: normalizedQuery.page,
                limit: normalizedQuery.limit,
                resultCount: Array.isArray((result as { data?: unknown }).data)
                    ? ((result as { data: unknown[] }).data.length)
                    : null,
                resultSource: (result as { source?: string }).source ?? null,
            },
        }).catch(() => undefined);

        return result;
    }

    async reindexBusinesses(query: ReindexBusinessesQueryDto = {}) {
        if (!this.meiliClient) {
            return {
                indexedCount: 0,
                source: 'disabled',
                message: 'Meilisearch no esta configurado en este entorno',
            };
        }

        const limit = query.limit ?? 5000;
        const businesses = await this.prisma.business.findMany({
            where: { verified: true },
            include: this.searchInclude,
            orderBy: { updatedAt: 'desc' },
            take: limit,
        });

        const documents = businesses.map((business) => this.toSearchDocument(business));
        const index = this.meiliClient.index(this.meiliIndexUid);
        await index.addDocuments(documents, { primaryKey: 'id' });
        await this.invalidateSearchCache();

        return {
            indexedCount: documents.length,
            source: 'meilisearch',
            message: 'Reindexacion completada',
        };
    }

    async indexBusinessById(businessId: string): Promise<void> {
        if (!this.meiliClient) {
            return;
        }

        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            include: this.searchInclude,
        });

        const index = this.meiliClient.index(this.meiliIndexUid);
        if (!business || !business.verified) {
            await index.deleteDocument(businessId);
            await this.invalidateSearchCache();
            return;
        }

        await index.addDocuments([this.toSearchDocument(business)], {
            primaryKey: 'id',
        });
        await this.invalidateSearchCache();
    }

    async removeBusiness(businessId: string): Promise<void> {
        if (!this.meiliClient) {
            return;
        }

        const index = this.meiliClient.index(this.meiliIndexUid);
        await index.deleteDocument(businessId);
        await this.invalidateSearchCache();
    }

    private async searchBusinessesViaMeili(query: {
        q: string;
        categoryId: string | null;
        provinceId: string | null;
        cityId: string | null;
        page: number;
        limit: number;
    }) {
        if (!this.meiliClient) {
            return this.searchBusinessesViaDatabase(query);
        }

        const filterExpressions: string[] = ['verified = true'];
        if (query.categoryId) {
            filterExpressions.push(`categoryIds = "${query.categoryId}"`);
        }
        if (query.provinceId) {
            filterExpressions.push(`provinceId = "${query.provinceId}"`);
        }
        if (query.cityId) {
            filterExpressions.push(`city.id = "${query.cityId}"`);
        }

        const searchResult = await this.meiliClient.index(this.meiliIndexUid).search<SearchBusinessDocument>(
            query.q,
            {
                filter: filterExpressions,
                page: query.page,
                hitsPerPage: query.limit,
                sort: ['reputationScore:desc'],
            },
        );

        const hits = (searchResult.hits ?? []).map((hit) => ({
            id: hit.id,
            name: hit.name,
            slug: hit.slug,
            description: hit.description,
            address: hit.address,
            verified: hit.verified,
            reputationScore: hit.reputationScore,
            province: hit.province,
            city: hit.city,
            categories: hit.categories.map((category) => ({ category })),
            images: hit.images,
            _count: {
                reviews: hit.reviewsCount,
            },
        }));

        const totals = searchResult as typeof searchResult & {
            totalHits?: number;
            estimatedTotalHits?: number;
        };
        const total = totals.totalHits ?? totals.estimatedTotalHits ?? hits.length;
        return {
            data: hits,
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.max(Math.ceil(total / query.limit), 1),
            source: 'meilisearch',
        };
    }

    private async searchBusinessesViaDatabase(query: {
        q: string;
        categoryId: string | null;
        provinceId: string | null;
        cityId: string | null;
        page: number;
        limit: number;
    }) {
        const skip = (query.page - 1) * query.limit;
        const where: Prisma.BusinessWhereInput = {
            verified: true,
        };

        if (query.categoryId) {
            where.categories = {
                some: {
                    categoryId: query.categoryId,
                },
            };
        }

        if (query.provinceId) {
            where.provinceId = query.provinceId;
        }

        if (query.cityId) {
            where.cityId = query.cityId;
        }

        if (query.q) {
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
                { address: { contains: query.q, mode: 'insensitive' } },
            ];
        }

        const [data, total] = await Promise.all([
            this.prisma.business.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    description: true,
                    address: true,
                    verified: true,
                    reputationScore: true,
                    province: {
                        select: { id: true, name: true, slug: true },
                    },
                    city: {
                        select: { id: true, name: true },
                    },
                    categories: {
                        select: {
                            category: {
                                select: { id: true, name: true, slug: true, icon: true },
                            },
                        },
                    },
                    images: {
                        select: { id: true, url: true },
                        orderBy: { id: 'asc' },
                        take: 1,
                    },
                    _count: {
                        select: { reviews: true },
                    },
                },
                orderBy: [{ reputationScore: 'desc' }, { createdAt: 'desc' }],
                skip,
                take: query.limit,
            }),
            this.prisma.business.count({ where }),
        ]);

        return {
            data,
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.max(Math.ceil(total / query.limit), 1),
            source: 'database',
        };
    }

    private async ensureMeiliIndexConfiguration(): Promise<void> {
        if (!this.meiliClient) {
            return;
        }

        const index = await this.meiliClient.getIndex(this.meiliIndexUid).catch(async () => {
            await this.meiliClient?.createIndex(this.meiliIndexUid, { primaryKey: 'id' });
            return this.meiliClient!.getIndex(this.meiliIndexUid);
        });

        await Promise.all([
            index.updateFilterableAttributes([
                'verified',
                'provinceId',
                'city.id',
                'categoryIds',
            ]),
            index.updateSortableAttributes([
                'reputationScore',
                'updatedAt',
            ]),
            index.updateSearchableAttributes([
                'name',
                'description',
                'address',
                'province.name',
                'city.name',
                'categories.name',
            ]),
        ]);
    }

    private readonly searchInclude = {
        province: {
            select: { id: true, name: true, slug: true },
        },
        city: {
            select: { id: true, name: true },
        },
        categories: {
            select: {
                category: {
                    select: { id: true, name: true, slug: true, icon: true },
                },
            },
        },
        images: {
            select: { id: true, url: true },
            orderBy: { id: 'asc' as const },
            take: 1,
        },
        _count: {
            select: { reviews: true },
        },
    };

    private toSearchDocument(business: {
        id: string;
        name: string;
        slug: string;
        description: string;
        address: string;
        verified: boolean;
        reputationScore: Prisma.Decimal;
        provinceId: string;
        province: { id: string; name: string; slug: string };
        city: { id: string; name: string } | null;
        categories: Array<{ category: { id: string; name: string; slug: string; icon: string | null } }>;
        images: Array<{ id: string; url: string }>;
        _count: { reviews: number };
        updatedAt: Date;
    }): SearchBusinessDocument {
        return {
            id: business.id,
            name: business.name,
            slug: business.slug,
            description: business.description,
            address: business.address,
            verified: business.verified,
            reputationScore: Number(business.reputationScore.toString()),
            provinceId: business.provinceId,
            province: business.province,
            city: business.city,
            categoryIds: business.categories.map((entry) => entry.category.id),
            categories: business.categories.map((entry) => entry.category),
            images: business.images,
            reviewsCount: business._count.reviews,
            updatedAt: business.updatedAt.toISOString(),
        };
    }

    private async invalidateSearchCache(): Promise<void> {
        await this.redisService.deleteByPrefix('search:businesses:list:');
    }
}
