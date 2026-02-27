import { Controller, Get, Inject, Query } from '@nestjs/common';
import { NearbyBusinessesQueryDto } from './dto/discovery.dto';
import { DiscoveryService } from './discovery.service';

@Controller('discovery')
export class DiscoveryController {
    constructor(
        @Inject(DiscoveryService)
        private readonly discoveryService: DiscoveryService,
    ) { }

    @Get('businesses/nearby')
    findNearbyBusinesses(@Query() query: NearbyBusinessesQueryDto) {
        return this.discoveryService.findNearbyBusinesses(query);
    }
}

