import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    Patch,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgRoles } from '../organizations/decorators/org-roles.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import {
    CreateSalesLeadDto,
    ListCustomersQueryDto,
    ListSalesPipelineQueryDto,
    UpdateSalesLeadStageDto,
} from './dto/crm.dto';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
    constructor(
        @Inject(CrmService)
        private readonly crmService: CrmService,
    ) { }

    @Get('customers/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listCustomers(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListCustomersQueryDto,
    ) {
        return this.crmService.listCustomers(organizationId, query);
    }

    @Get('customers/:customerUserId/history')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getCustomerHistory(
        @CurrentOrganization('organizationId') organizationId: string,
        @Param('customerUserId', new ParseUUIDPipe()) customerUserId: string,
        @Query('businessId') businessId?: string,
    ) {
        return this.crmService.getCustomerHistory(
            organizationId,
            customerUserId,
            businessId,
        );
    }

    @Get('pipeline/my')
    @UseGuards(JwtAuthGuard, RolesGuard, OrgContextGuard, OrgRolesGuard)
    @Roles('BUSINESS_OWNER')
    @OrgRoles('OWNER', 'MANAGER')
    async listPipeline(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListSalesPipelineQueryDto,
    ) {
        return this.crmService.listSalesPipeline(organizationId, query);
    }

    @Post('pipeline/my/leads')
    @UseGuards(JwtAuthGuard, RolesGuard, OrgContextGuard, OrgRolesGuard)
    @Roles('BUSINESS_OWNER')
    @OrgRoles('OWNER', 'MANAGER')
    async createLead(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentUser('id') actorUserId: string,
        @Body() dto: CreateSalesLeadDto,
    ) {
        return this.crmService.createSalesLead(organizationId, actorUserId, dto);
    }

    @Patch('pipeline/my/leads/:leadId/stage')
    @UseGuards(JwtAuthGuard, RolesGuard, OrgContextGuard, OrgRolesGuard)
    @Roles('BUSINESS_OWNER')
    @OrgRoles('OWNER', 'MANAGER')
    async updateLeadStage(
        @CurrentOrganization('organizationId') organizationId: string,
        @Param('leadId', new ParseUUIDPipe()) leadId: string,
        @Body() dto: UpdateSalesLeadStageDto,
    ) {
        return this.crmService.updateSalesLeadStage(organizationId, leadId, dto);
    }
}
