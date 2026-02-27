import { Controller, Get, Header, Inject } from '@nestjs/common';
import { FeaturesService } from './features.service';

@Controller('features')
export class FeaturesController {
    constructor(
        @Inject(FeaturesService)
        private readonly featuresService: FeaturesService,
    ) { }

    @Get()
    @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
    async findAll() {
        return this.featuresService.findAll();
    }
}
