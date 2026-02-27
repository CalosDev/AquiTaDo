import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../cache/redis.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AdvancedRateLimitGuard } from './advanced-rate-limit.guard';

@Global()
@Module({
    imports: [RedisModule, ObservabilityModule],
    providers: [AdvancedRateLimitGuard],
    exports: [AdvancedRateLimitGuard],
})
export class SecurityModule { }
