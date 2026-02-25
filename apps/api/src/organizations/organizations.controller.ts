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
export class OrganizationsController {
    constructor(
        @Inject(OrganizationsService)
        private readonly organizationsService: OrganizationsService,
    ) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    async create(
        @Body() dto: CreateOrganizationDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.create(dto, userId);
    }

    @Get('mine')
    @UseGuards(JwtAuthGuard)
    async findMine(@CurrentUser('id') userId: string) {
        return this.organizationsService.findMine(userId);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    async findById(
        @Param('id') organizationId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.findById(organizationId, userId, userRole);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    async update(
        @Param('id') organizationId: string,
        @Body() dto: UpdateOrganizationDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.update(organizationId, dto, userId, userRole);
    }

    @Get(':id/members')
    @UseGuards(JwtAuthGuard)
    async listMembers(
        @Param('id') organizationId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.listMembers(organizationId, userId, userRole);
    }

    @Get(':id/invites')
    @UseGuards(JwtAuthGuard)
    async listInvites(
        @Param('id') organizationId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.listInvites(organizationId, userId, userRole);
    }

    @Get(':id/subscription')
    @UseGuards(JwtAuthGuard)
    async getSubscription(
        @Param('id') organizationId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.getSubscription(organizationId, userId, userRole);
    }

    @Patch(':id/subscription')
    @UseGuards(JwtAuthGuard)
    async updateSubscription(
        @Param('id') organizationId: string,
        @Body() dto: UpdateOrganizationSubscriptionDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.updateSubscription(organizationId, dto, userId, userRole);
    }

    @Get(':id/usage')
    @UseGuards(JwtAuthGuard)
    async getUsage(
        @Param('id') organizationId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.getUsage(organizationId, userId, userRole);
    }

    @Get(':id/audit-logs')
    @UseGuards(JwtAuthGuard)
    async listAuditLogs(
        @Param('id') organizationId: string,
        @Query() query: ListOrganizationAuditLogsQueryDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.listAuditLogs(
            organizationId,
            userId,
            userRole,
            query.limit,
        );
    }

    @Post(':id/invites')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    async inviteMember(
        @Param('id') organizationId: string,
        @Body() dto: InviteOrganizationMemberDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.organizationsService.inviteMember(organizationId, dto, userId, userRole);
    }

    @Post('invites/:token/accept')
    @UseGuards(JwtAuthGuard)
    @Throttle({ default: { limit: 20, ttl: 60_000 } })
    async acceptInvite(
        @Param('token') token: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.organizationsService.acceptInvite(token, userId);
    }

    @Patch(':id/members/:userId/role')
    @UseGuards(JwtAuthGuard)
    async updateMemberRole(
        @Param('id') organizationId: string,
        @Param('userId', new ParseUUIDPipe()) memberUserId: string,
        @Body() dto: UpdateOrganizationMemberRoleDto,
        @CurrentUser('id') actorUserId: string,
        @CurrentUser('role') actorGlobalRole: string,
    ) {
        return this.organizationsService.updateMemberRole(
            organizationId,
            memberUserId,
            dto,
            actorUserId,
            actorGlobalRole,
        );
    }

    @Delete(':id/members/:userId')
    @UseGuards(JwtAuthGuard)
    async removeMember(
        @Param('id') organizationId: string,
        @Param('userId', new ParseUUIDPipe()) memberUserId: string,
        @CurrentUser('id') actorUserId: string,
        @CurrentUser('role') actorGlobalRole: string,
    ) {
        return this.organizationsService.removeMember(
            organizationId,
            memberUserId,
            actorUserId,
            actorGlobalRole,
        );
    }
}
