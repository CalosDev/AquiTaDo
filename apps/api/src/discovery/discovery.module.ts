import { Module } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { SearchModule } from '../search/search.module';

@Module({
    imports: [SearchModule],
    controllers: [DiscoveryController],
    providers: [DiscoveryService],
    exports: [DiscoveryService],
})
export class DiscoveryModule { }
