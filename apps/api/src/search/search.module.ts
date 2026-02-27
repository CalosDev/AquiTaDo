import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { ObservabilityModule } from '../observability/observability.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
    imports: [AnalyticsModule, ObservabilityModule],
    controllers: [SearchController],
    providers: [SearchService],
    exports: [SearchService],
})
export class SearchModule { }
