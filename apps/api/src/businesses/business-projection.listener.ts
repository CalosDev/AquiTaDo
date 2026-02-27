import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../cache/redis.service';
import { DomainEventsService } from '../core/events/domain-events.service';
import { SearchService } from '../search/search.service';

@Injectable()
export class BusinessProjectionListener implements OnModuleInit {
    private static readonly PUBLIC_LIST_CACHE_PREFIX = 'public:businesses:list:';
    private static readonly PUBLIC_NEARBY_CACHE_PREFIX = 'public:businesses:nearby:';
    private static readonly PUBLIC_DETAIL_ID_CACHE_PREFIX = 'public:businesses:detail:id:';
    private static readonly PUBLIC_DETAIL_SLUG_CACHE_PREFIX = 'public:businesses:detail:slug:';
    private static readonly PUBLIC_SEARCH_CACHE_PREFIX = 'search:businesses:list:';

    constructor(
        @Inject(DomainEventsService)
        private readonly domainEventsService: DomainEventsService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(SearchService)
        private readonly searchService: SearchService,
    ) { }

    onModuleInit() {
        this.domainEventsService.onBusinessChanged(async (event) => {
            await this.invalidateBusinessCaches(event.businessId, event.slug);

            if (event.operation === 'deleted') {
                await this.searchService.removeBusiness(event.businessId);
                return;
            }

            await this.searchService.indexBusinessById(event.businessId);
        });
    }

    private async invalidateBusinessCaches(
        businessId: string,
        slug: string | null,
    ): Promise<void> {
        await Promise.allSettled([
            this.redisService.deleteByPrefix(BusinessProjectionListener.PUBLIC_LIST_CACHE_PREFIX),
            this.redisService.deleteByPrefix(BusinessProjectionListener.PUBLIC_NEARBY_CACHE_PREFIX),
            this.redisService.deleteByPrefix(BusinessProjectionListener.PUBLIC_SEARCH_CACHE_PREFIX),
            this.redisService.deleteByPrefix(
                `${BusinessProjectionListener.PUBLIC_DETAIL_ID_CACHE_PREFIX}${businessId}`,
            ),
            slug
                ? this.redisService.deleteByPrefix(
                    `${BusinessProjectionListener.PUBLIC_DETAIL_SLUG_CACHE_PREFIX}${slug}`,
                )
                : Promise.resolve(0),
        ]);
    }
}

