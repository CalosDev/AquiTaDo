import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgRoles } from '../organizations/decorators/org-roles.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import {
    ConvertConversationToBookingDto,
    CreateConversationDto,
    ListConversationsQueryDto,
    SendConversationMessageDto,
    UpdateConversationStatusDto,
} from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@Controller('messaging')
export class MessagingController {
    constructor(
        @Inject(MessagingService)
        private readonly messagingService: MessagingService,
    ) { }

    @Post('conversations')
    @UseGuards(JwtAuthGuard)
    async createConversation(
        @CurrentUser('id') customerUserId: string,
        @Body() dto: CreateConversationDto,
    ) {
        return this.messagingService.createConversation(customerUserId, dto);
    }

    @Get('conversations/me')
    @UseGuards(JwtAuthGuard)
    async listMyConversations(
        @CurrentUser('id') customerUserId: string,
        @Query() query: ListConversationsQueryDto,
    ) {
        return this.messagingService.listMyConversations(customerUserId, query);
    }

    @Get('conversations/me/:id')
    @UseGuards(JwtAuthGuard)
    async getMyThread(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentUser('id') customerUserId: string,
        @CurrentUser('role') globalRole: string,
    ) {
        return this.messagingService.getConversationThreadForCustomer(
            conversationId,
            customerUserId,
            globalRole,
        );
    }

    @Post('conversations/me/:id/messages')
    @UseGuards(JwtAuthGuard)
    async sendMessageAsCustomer(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentUser('id') customerUserId: string,
        @CurrentUser('role') globalRole: string,
        @Body() dto: SendConversationMessageDto,
    ) {
        return this.messagingService.sendMessageAsCustomer(
            conversationId,
            customerUserId,
            globalRole,
            dto,
        );
    }

    @Get('conversations/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listOrganizationConversations(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListConversationsQueryDto,
    ) {
        return this.messagingService.listOrganizationConversations(organizationId, query);
    }

    @Get('conversations/my/:id')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getOrganizationThread(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentUser('role') globalRole: string,
    ) {
        return this.messagingService.getConversationThreadForOrganization(
            conversationId,
            organizationId,
            globalRole,
        );
    }

    @Post('conversations/my/:id/messages')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async sendMessageAsOrganization(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('id') senderUserId: string,
        @CurrentUser('role') globalRole: string,
        @Body() dto: SendConversationMessageDto,
    ) {
        return this.messagingService.sendMessageAsOrganization(
            conversationId,
            organizationId,
            senderUserId,
            globalRole,
            organizationRole,
            dto,
        );
    }

    @Patch('conversations/my/:id/status')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async updateConversationStatus(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') globalRole: string,
        @Body() dto: UpdateConversationStatusDto,
    ) {
        return this.messagingService.updateConversationStatus(
            conversationId,
            organizationId,
            globalRole,
            organizationRole,
            dto,
        );
    }

    @Post('conversations/my/:id/convert-booking')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async convertToBooking(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') globalRole: string,
        @Body() dto: ConvertConversationToBookingDto,
    ) {
        return this.messagingService.convertConversationToBooking(
            conversationId,
            organizationId,
            globalRole,
            organizationRole,
            dto,
        );
    }
}
