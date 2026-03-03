import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ObservabilityModule } from '../observability/observability.module';
import { SearchModule } from '../search/search.module';

@Module({
    imports: [ObservabilityModule, SearchModule],
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule { }
