import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { ObservabilityService } from './observability.service';

@Controller('observability')
export class ObservabilityController {
    constructor(
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) { }

    @Get('metrics')
    async getMetrics(@Res() response: Response) {
        response.setHeader(
            'Content-Type',
            this.observabilityService.getMetricsContentType(),
        );
        response.send(await this.observabilityService.getMetrics());
    }
}
