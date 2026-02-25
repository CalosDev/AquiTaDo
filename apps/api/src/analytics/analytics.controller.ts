import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import {
    AnalyticsRangeQueryDto,
    MarketInsightsQueryDto,
    TrackBusinessEventDto,
} from './dto/analytics.dto';

@Controller('analytics')
export class AnalyticsController {
    constructor(
        @Inject(AnalyticsService)
        private readonly analyticsService: AnalyticsService,
    ) { }

    @Post('events')
    async trackEvent(@Body() dto: TrackBusinessEventDto) {
        return this.analyticsService.trackBusinessEvent(dto);
    }

    @Get('dashboard/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getMyDashboard(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: AnalyticsRangeQueryDto,
    ) {
        return this.analyticsService.getOrganizationDashboard(
            organizationId,
            query.days ?? 30,
        );
    }

    @Get('business/:businessId')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getBusinessAnalytics(
        @CurrentOrganization('organizationId') organizationId: string,
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @Query() query: AnalyticsRangeQueryDto,
    ) {
        return this.analyticsService.getBusinessAnalytics(
            organizationId,
            businessId,
            query.days ?? 30,
        );
    }

    @Get('market-insights')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async getMarketInsights(@Query() query: MarketInsightsQueryDto) {
        return this.analyticsService.getMarketInsights(query);
    }
}
