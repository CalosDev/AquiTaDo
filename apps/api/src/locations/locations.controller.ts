import { Controller, Get, Inject, Param } from '@nestjs/common';
import { LocationsService } from './locations.service';

@Controller()
export class LocationsController {
    constructor(
        @Inject(LocationsService)
        private readonly locationsService: LocationsService,
    ) { }

    @Get('provinces')
    async findAllProvinces() {
        return this.locationsService.findAllProvinces();
    }

    @Get('provinces/:id/cities')
    async findCitiesByProvince(@Param('id') provinceId: string) {
        return this.locationsService.findCitiesByProvince(provinceId);
    }

    @Get('cities')
    async findAllCities() {
        return this.locationsService.findAllCities();
    }
}
