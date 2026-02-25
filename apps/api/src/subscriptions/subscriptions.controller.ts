import {
    Body,
    Controller,
    Get,
    Inject,
    Post,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { CreateCheckoutSessionDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
    constructor(
        @Inject(SubscriptionsService)
        private readonly subscriptionsService: SubscriptionsService,
    ) { }

    @Get('current')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getCurrent(
        @CurrentOrganization('organizationId') organizationId: string,
    ) {
        return this.subscriptionsService.getCurrent(organizationId);
    }

    @Post('checkout-session')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async createCheckoutSession(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentUser('id') actorUserId: string,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: CreateCheckoutSessionDto,
    ) {
        return this.subscriptionsService.createCheckoutSession(
            organizationId,
            actorUserId,
            actorGlobalRole,
            dto,
        );
    }

    @Post('cancel-at-period-end')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async cancelAtPeriodEnd(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentUser('id') actorUserId: string,
        @CurrentUser('role') actorGlobalRole: string,
    ) {
        return this.subscriptionsService.cancelAtPeriodEnd(
            organizationId,
            actorUserId,
            actorGlobalRole,
        );
    }
}
