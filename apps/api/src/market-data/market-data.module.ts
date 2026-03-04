import { Module } from '@nestjs/common';
import { ResilienceModule } from '../resilience/resilience.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
    imports: [PrismaModule, ResilienceModule, ObservabilityModule],
    controllers: [MarketDataController],
    providers: [MarketDataService],
    exports: [MarketDataService],
})
export class MarketDataModule { }
