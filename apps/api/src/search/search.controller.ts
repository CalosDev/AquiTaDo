import { Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
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
    async searchBusinesses(@Query() query: SearchBusinessesQueryDto) {
        return this.searchService.searchBusinesses(query);
    }

    @Post('businesses/reindex')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async reindexBusinesses(@Query() query: ReindexBusinessesQueryDto) {
        return this.searchService.reindexBusinesses(query);
    }
}
