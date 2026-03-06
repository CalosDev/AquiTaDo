import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { ResilienceModule } from '../resilience/resilience.module';
import { IntegrationsService } from './integrations.service';

@Module({
    imports: [ResilienceModule, ObservabilityModule],
    providers: [IntegrationsService],
    exports: [IntegrationsService],
})
export class IntegrationsModule { }

