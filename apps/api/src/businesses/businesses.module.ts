import { Module } from '@nestjs/common';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { ReputationModule } from '../reputation/reputation.module';
import { SearchModule } from '../search/search.module';
import { BusinessRepository } from './business.repository';
import { BusinessCoreService } from './business-core.service';
import { BusinessProjectionListener } from './business-projection.listener';

@Module({
    imports: [ReputationModule, SearchModule],
    controllers: [BusinessesController],
    providers: [
        BusinessesService,
        BusinessRepository,
        BusinessCoreService,
        BusinessProjectionListener,
    ],
    exports: [BusinessesService],
})
export class BusinessesModule { }
