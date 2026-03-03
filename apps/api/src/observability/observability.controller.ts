import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
    constructor(
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) { }

    @Get('metrics')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async getMetrics(@Res() response: Response) {
        response.setHeader(
            'Content-Type',
            this.observabilityService.getMetricsContentType(),
        );
        response.send(await this.observabilityService.getMetrics());
    }
}
