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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AnalyticsService } from './analytics.service';
import {
    AnalyticsRangeQueryDto,
    GenerateMarketReportDto,
    GrowthInsightsQueryDto,
    ListMarketReportsQueryDto,
    MarketInsightsQueryDto,
    TrackGrowthEventDto,
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

    @Post('events/growth')
    @UseGuards(OptionalJwtAuthGuard)
    async trackGrowthEvent(
        @Body() dto: TrackGrowthEventDto,
        @CurrentUser('id') userId?: string,
    ) {
        return this.analyticsService.trackGrowthEvent({
            ...dto,
            userId: dto.userId ?? userId,
        });
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

    @Get('growth/insights')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async getGrowthInsights(@Query() query: GrowthInsightsQueryDto) {
        return this.analyticsService.getGrowthInsights(query);
    }

    @Post('market-reports/generate')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async generateMarketReport(
        @CurrentUser('id') generatedByUserId: string,
        @Body() dto: GenerateMarketReportDto,
    ) {
        return this.analyticsService.generateMarketReport(generatedByUserId, dto);
    }

    @Get('market-reports')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async listMarketReports(@Query() query: ListMarketReportsQueryDto) {
        return this.analyticsService.listMarketReports(query);
    }

    @Get('market-reports/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async getMarketReport(
        @Param('id', new ParseUUIDPipe()) reportId: string,
    ) {
        return this.analyticsService.getMarketReportById(reportId);
    }
}
