import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BusinessesService } from './businesses.service';
import {
    BusinessSuggestionQueryDto,
    CreateBusinessSuggestionDto,
    ReviewBusinessSuggestionDto,
} from './dto/business-suggestion.dto';

@Controller('business-suggestions')
export class BusinessSuggestionsController {
    constructor(
        @Inject(BusinessesService)
        private readonly businessesService: BusinessesService,
    ) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    async createSuggestion(
        @Body() dto: CreateBusinessSuggestionDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.businessesService.submitBusinessSuggestion(dto, userId);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard)
    async listMySuggestions(
        @Query() query: BusinessSuggestionQueryDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.businessesService.listBusinessSuggestions(query, userId);
    }

    @Get('admin')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async listSuggestionsAdmin(@Query() query: BusinessSuggestionQueryDto) {
        return this.businessesService.listBusinessSuggestions(query);
    }

    @Post('admin/:id/review')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async reviewSuggestion(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body() dto: ReviewBusinessSuggestionDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.reviewBusinessSuggestion(id, dto, adminUserId);
    }
}
