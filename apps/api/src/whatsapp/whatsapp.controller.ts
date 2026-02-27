import {
    Body,
    Controller,
    Get,
    Headers,
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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgRoles } from '../organizations/decorators/org-roles.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import {
    CreateClickToChatDto,
    ListWhatsAppConversationsDto,
    UpdateWhatsAppConversationStatusDto,
} from './dto/click-to-chat.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
    constructor(
        @Inject(WhatsAppService)
        private readonly whatsAppService: WhatsAppService,
    ) { }

    @Get('webhook')
    verifyWebhook(
        @Query('hub.mode') mode?: string,
        @Query('hub.verify_token') token?: string,
        @Query('hub.challenge') challenge?: string,
    ) {
        return this.whatsAppService.verifyWebhookChallenge(mode, token, challenge);
    }

    @Post('webhook')
    async receiveWebhook(
        @Body() payload: unknown,
        @Headers('x-hub-signature-256') _signature?: string,
    ) {
        return this.whatsAppService.handleWebhookPayload(payload);
    }

    @Post('click-to-chat')
    @UseGuards(OptionalJwtAuthGuard)
    async createClickToChat(
        @Body() dto: CreateClickToChatDto,
        @CurrentUser('id') userId?: string,
    ) {
        return this.whatsAppService.createClickToChatLink(dto, userId);
    }

    @Get('conversations/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listOrganizationConversations(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListWhatsAppConversationsDto,
    ) {
        return this.whatsAppService.listOrganizationConversations(organizationId, query);
    }

    @Patch('conversations/my/:id/status')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async updateConversationStatus(
        @Param('id', new ParseUUIDPipe()) conversationId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @Body() dto: UpdateWhatsAppConversationStatusDto,
    ) {
        return this.whatsAppService.updateConversationStatus(
            organizationId,
            conversationId,
            dto,
        );
    }
}

