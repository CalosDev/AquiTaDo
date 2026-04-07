import {
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
    CreateOrganizationDto,
    InviteOrganizationMemberDto,
    ListOrganizationAuditLogsQueryDto,
    UpdateOrganizationDto,
    UpdateOrganizationMemberRoleDto,
    UpdateOrganizationSubscriptionDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUSINESS_OWNER')
export class OrganizationsController {
    constructor(
        @Inject(OrganizationsService)
        private readonly organizationsService: OrganizationsService,
    ) { }

    @Post()
    async create(
        @Body() dto: CreateOrganizationDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.create(dto, userId);
    }

    @Get('mine')
    async findMine(@CurrentUser('id') userId: string) {
        return this.organizationsService.findMine(userId);
    }

    @Get(':id')
    async findById(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.findById(organizationId, userId);
    }

    @Patch(':id')
    async update(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @Body() dto: UpdateOrganizationDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.update(organizationId, dto, userId);
    }

    @Get(':id/members')
    async listMembers(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.listMembers(organizationId, userId);
    }

    @Get(':id/invites')
    async listInvites(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.listInvites(organizationId, userId);
    }

    @Get(':id/subscription')
    async getSubscription(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.getSubscription(organizationId, userId);
    }

    @Patch(':id/subscription')
    async updateSubscription(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @Body() dto: UpdateOrganizationSubscriptionDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.updateSubscription(organizationId, dto, userId);
    }

    @Get(':id/usage')
    async getUsage(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.getUsage(organizationId, userId);
    }

    @Get(':id/audit-logs')
    async listAuditLogs(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @Query() query: ListOrganizationAuditLogsQueryDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.listAuditLogs(
            organizationId,
            userId,
            query.limit,
        );
    }

    @Post(':id/invites')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async inviteMember(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @Body() dto: InviteOrganizationMemberDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.inviteMember(organizationId, dto, userId);
    }

    @Post('invites/:token/accept')
    @Roles('USER', 'BUSINESS_OWNER')
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async acceptInvite(
        @Param('token') token: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.acceptInvite(token, userId);
    }

    @Patch(':id/members/:userId/role')
    async updateMemberRole(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @Param('userId', new ParseUUIDPipe()) memberUserId: string,
        @Body() dto: UpdateOrganizationMemberRoleDto,
        @CurrentUser('id') actorUserId: string,
    ) {
        return this.organizationsService.updateMemberRole(
            organizationId,
            memberUserId,
            dto,
            actorUserId,
        );
    }

    @Delete(':id/members/:userId')
    async removeMember(
        @Param('id', new ParseUUIDPipe()) organizationId: string,
        @Param('userId', new ParseUUIDPipe()) memberUserId: string,
        @CurrentUser('id') actorUserId: string,
    ) {
        return this.organizationsService.removeMember(
            organizationId,
            memberUserId,
            actorUserId,
        );
    }
}
