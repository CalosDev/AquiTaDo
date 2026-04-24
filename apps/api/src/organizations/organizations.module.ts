import { Module } from '@nestjs/common';
import { OrganizationAccessService } from './organization-access.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsUsageService } from './organizations-usage.service';

@Module({
    controllers: [OrganizationsController],
    providers: [OrganizationsService, OrganizationsUsageService, OrganizationAccessService],
    exports: [OrganizationsService, OrganizationAccessService],
})
export class OrganizationsModule { }
