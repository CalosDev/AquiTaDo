import {
    Body,
    Controller,
    Inject,
    Post,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AdvancedRateLimitGuard } from '../security/advanced-rate-limit.guard';
import { RateLimitPolicy } from '../security/rate-limit-policy.decorator';
import { AnalyticsService } from './analytics.service';
import { TrackBusinessEventDto, TrackGrowthEventDto } from './dto/analytics.dto';

@Controller(['events', 'telemetry'])
export class EventTrackingController {
    constructor(
        @Inject(AnalyticsService)
        private readonly analyticsService: AnalyticsService,
    ) { }

    @Post('business')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('default')
    async trackBusinessEvent(@Body() dto: TrackBusinessEventDto) {
        return this.analyticsService.trackBusinessEvent(dto);
    }

    @Post('growth')
    @UseGuards(AdvancedRateLimitGuard, OptionalJwtAuthGuard)
    @RateLimitPolicy('default')
    async trackGrowthEvent(
        @Body() dto: TrackGrowthEventDto,
        @CurrentUser('id') userId?: string,
    ) {
        return this.analyticsService.trackGrowthEvent({
            ...dto,
            userId,
        });
    }
}
