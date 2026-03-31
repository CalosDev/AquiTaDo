import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsUsageService } from './organizations-usage.service';

@Module({
    controllers: [OrganizationsController],
    providers: [OrganizationsService, OrganizationsUsageService],
    exports: [OrganizationsService],
})
export class OrganizationsModule { }
