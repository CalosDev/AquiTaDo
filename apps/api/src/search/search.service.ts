import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../cache/redis.service';
import { hashedCacheKey } from '../cache/cache-key';
import { AnalyticsService } from '../analytics/analytics.service';
import {
    ReindexBusinessesQueryDto,
    SearchBusinessesQueryDto,
} from './dto/search-businesses.dto';

@Injectable()
export class SearchService {
    private readonly logger = new Logger(SearchService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(AnalyticsService)
        private readonly analyticsService: AnalyticsService,
    ) {}

    async onModuleInit() {
        this.logger.log('Search provider: PostgreSQL');
    }

    isConfigured(): boolean {
        return true;
    }

    async ping(): Promise<boolean | null> {
        return true;
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

    async reindexBusinesses(_query: ReindexBusinessesQueryDto = {}) {
        await this.invalidateSearchCache();
        return {
            indexedCount: 0,
            source: 'database',
            message: 'No se requiere reindexación: la búsqueda usa PostgreSQL',
        };
    }

    async indexBusinessById(_businessId: string): Promise<void> {
        await this.invalidateSearchCache();
    }

    async removeBusiness(_businessId: string): Promise<void> {
        await this.invalidateSearchCache();
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
            deletedAt: null,
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

    private async invalidateSearchCache(): Promise<void> {
        await this.redisService.deleteByPrefix('search:businesses:list:');
    }
}
