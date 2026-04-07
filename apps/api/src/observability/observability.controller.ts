import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TrackFrontendSignalDto } from './dto/frontend-observability.dto';
import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
    constructor(
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) { }

    @Post('frontend')
    @HttpCode(202)
    trackFrontendSignal(@Body() dto: TrackFrontendSignalDto) {
        this.observabilityService.trackFrontendSignal(dto);
        return { accepted: true };
    }

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
