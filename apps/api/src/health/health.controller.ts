import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { HealthService } from './health.service';

@Controller('health')
@SkipThrottle({ default: true })
export class HealthController {
    constructor(
        @Inject(HealthService)
        private readonly healthService: HealthService,
    ) { }

    @Get()
    getLiveness() {
        return this.healthService.getLiveness();
    }

    @Get('ready')
    async getReadiness() {
        return this.healthService.getReadiness();
    }

    @Get('dashboard')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async getOperationalDashboard() {
        return this.healthService.getOperationalDashboard();
    }
}
