import { Module } from '@nestjs/common';
import { RedisModule } from '../cache/redis.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';

@Module({
    imports: [RedisModule],
    controllers: [ObservabilityController],
    providers: [ObservabilityService],
    exports: [ObservabilityService],
})
export class ObservabilityModule { }
