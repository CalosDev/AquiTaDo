import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { PublicCache } from '../core/interceptors/public-cache.decorator';
import { AdvancedRateLimitGuard } from '../security/advanced-rate-limit.guard';
import { RateLimitPolicy } from '../security/rate-limit-policy.decorator';
import {
    CommercialAgendaQueryDto,
    DominicanHolidaysQueryDto,
    ExchangeRateQueryDto,
    CurrentWeatherQueryDto,
} from './dto/market-data.dto';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataController {
    constructor(
        @Inject(MarketDataService)
        private readonly marketDataService: MarketDataService,
    ) { }

    @Get('weather/current')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('search')
    @PublicCache({ maxAgeSeconds: 300, staleWhileRevalidateSeconds: 900 })
    async getCurrentWeather(@Query() query: CurrentWeatherQueryDto) {
        return this.marketDataService.getCurrentWeather(query.lat, query.lng);
    }

    @Get('exchange-rate')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('search')
    @PublicCache({ maxAgeSeconds: 900, staleWhileRevalidateSeconds: 3600 })
    async getExchangeRate(@Query() query: ExchangeRateQueryDto) {
        const base = query.base?.toUpperCase() || 'USD';
        const target = query.target?.toUpperCase() || 'DOP';
        const normalizedAmount = query.amount && Number.isFinite(query.amount)
            ? query.amount
            : 1;

        return this.marketDataService.getExchangeRate(base, target, normalizedAmount);
    }

    @Get('holidays/rd')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('search')
    @PublicCache({ maxAgeSeconds: 3600, staleWhileRevalidateSeconds: 7200 })
    async getDominicanHolidays(@Query() query: DominicanHolidaysQueryDto) {
        const year = query.year ?? new Date().getUTCFullYear();
        const upcomingOnly = query.upcomingOnly === '1' || query.upcomingOnly === 'true';
        return this.marketDataService.getDominicanHolidays(year, {
            limit: query.limit,
            upcomingOnly,
        });
    }

    @Get('commercial-agenda/rd')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('search')
    @PublicCache({ maxAgeSeconds: 1800, staleWhileRevalidateSeconds: 3600 })
    async getDominicanCommercialAgenda(@Query() query: CommercialAgendaQueryDto) {
        return this.marketDataService.getDominicanCommercialAgenda({
            limit: query.limit,
            horizonDays: query.horizonDays,
        });
    }
}
