import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@Controller('health')
@SkipThrottle({ default: true })
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Get()
    getLiveness() {
        return this.healthService.getLiveness();
    }

    @Get('ready')
    async getReadiness() {
        return this.healthService.getReadiness();
    }
}

