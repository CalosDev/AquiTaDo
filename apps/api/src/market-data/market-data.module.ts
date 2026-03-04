import { Module } from '@nestjs/common';
import { ResilienceModule } from '../resilience/resilience.module';
import { ObservabilityModule } from '../observability/observability.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
    imports: [ResilienceModule, ObservabilityModule],
    controllers: [MarketDataController],
    providers: [MarketDataService],
    exports: [MarketDataService],
})
export class MarketDataModule { }
