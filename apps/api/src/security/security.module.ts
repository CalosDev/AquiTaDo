import { Global, Module } from '@nestjs/common';
import { AdvancedRateLimitGuard } from './advanced-rate-limit.guard';

@Global()
@Module({
    providers: [AdvancedRateLimitGuard],
    exports: [AdvancedRateLimitGuard],
})
export class SecurityModule { }
