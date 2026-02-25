import {
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Query,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { ListCustomersQueryDto } from './dto/crm.dto';
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
}
