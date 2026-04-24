import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { BusinessesController } from './businesses.controller';
import { AdminCatalogController } from './admin-catalog.controller';
import { BusinessSuggestionsController } from './business-suggestions.controller';
import { BusinessesService } from './businesses.service';
import { ReputationModule } from '../reputation/reputation.module';
import { SearchModule } from '../search/search.module';
import { BusinessProjectionListener } from './business-projection.listener';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
    imports: [ReputationModule, SearchModule, NotificationsModule, IntegrationsModule, OrganizationsModule],
    controllers: [BusinessesController, AdminCatalogController, BusinessSuggestionsController],
    providers: [
        BusinessesService,
        BusinessProjectionListener,
    ],
    exports: [BusinessesService],
})
export class BusinessesModule { }
