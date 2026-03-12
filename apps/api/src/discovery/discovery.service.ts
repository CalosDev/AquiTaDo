import { Inject, Injectable } from '@nestjs/common';
import { NearbyBusinessesQueryDto } from './dto/discovery.dto';
import { SearchService } from '../search/search.service';

@Injectable()
export class DiscoveryService {
    constructor(
        @Inject(SearchService)
        private readonly searchService: SearchService,
    ) { }

    async findNearbyBusinesses(query: NearbyBusinessesQueryDto) {
        return this.searchService.findNearbyBusinesses(query);
    }
}
