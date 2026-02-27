import { Controller, Get, Headers, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdvancedRateLimitGuard } from '../security/advanced-rate-limit.guard';
import { RateLimitPolicy } from '../security/rate-limit-policy.decorator';
import { PublicCache } from '../core/interceptors/public-cache.decorator';
import {
    ReindexBusinessesQueryDto,
    SearchBusinessesQueryDto,
} from './dto/search-businesses.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
    constructor(
        @Inject(SearchService)
        private readonly searchService: SearchService,
    ) { }

    @Get('businesses')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('search')
    @PublicCache({ maxAgeSeconds: 30, staleWhileRevalidateSeconds: 180 })
    async searchBusinesses(
        @Query() query: SearchBusinessesQueryDto,
        @Headers('x-visitor-id') visitorId?: string,
        @Headers('x-session-id') sessionId?: string,
    ) {
        return this.searchService.searchBusinesses(query, {
            visitorId,
            sessionId,
            source: 'api.search.businesses',
        });
    }

    @Post('businesses/reindex')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async reindexBusinesses(@Query() query: ReindexBusinessesQueryDto) {
        return this.searchService.reindexBusinesses(query);
    }
}
