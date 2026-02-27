import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
    imports: [ObservabilityModule],
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule { }
