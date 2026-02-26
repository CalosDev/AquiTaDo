import { Controller, Get, Header, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import { LocationsService } from './locations.service';

@Controller()
export class LocationsController {
    constructor(
        @Inject(LocationsService)
        private readonly locationsService: LocationsService,
    ) { }

    @Get('provinces')
    @Header('Cache-Control', 'public, max-age=600, stale-while-revalidate=1200')
    async findAllProvinces() {
        return this.locationsService.findAllProvinces();
    }

    @Get('provinces/:id/cities')
    @Header('Cache-Control', 'public, max-age=600, stale-while-revalidate=1200')
    async findCitiesByProvince(@Param('id', new ParseUUIDPipe()) provinceId: string) {
        return this.locationsService.findCitiesByProvince(provinceId);
    }

    @Get('cities')
    @Header('Cache-Control', 'public, max-age=600, stale-while-revalidate=1200')
    async findAllCities() {
        return this.locationsService.findAllCities();
    }
}
