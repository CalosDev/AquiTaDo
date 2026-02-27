import {
    Body,
    Controller,
    Inject,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgRoles } from '../organizations/decorators/org-roles.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { AdvancedRateLimitGuard } from '../security/advanced-rate-limit.guard';
import { RateLimitPolicy } from '../security/rate-limit-policy.decorator';
import { AiService } from './ai.service';
import { AskConciergeDto } from './dto/ask-concierge.dto';
import {
    BusinessAssistantConfigDto,
    BusinessAutoReplyDto,
} from './dto/business-assistant-config.dto';

@Controller('ai')
export class AiController {
    constructor(
        @Inject(AiService)
        private readonly aiService: AiService,
    ) { }

    @Post('concierge/query')
    @UseGuards(AdvancedRateLimitGuard)
    @RateLimitPolicy('ai')
    async askConcierge(@Body() dto: AskConciergeDto) {
        return this.aiService.askConcierge(dto);
    }

    @Patch('businesses/:businessId/assistant-config')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async updateAssistantConfig(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: BusinessAssistantConfigDto,
    ) {
        return this.aiService.updateBusinessAssistantConfig(
            businessId,
            organizationId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }

    @Post('businesses/:businessId/reindex')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async reindexBusiness(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
    ) {
        return this.aiService.reindexBusinessEmbedding(
            businessId,
            organizationId,
            actorGlobalRole,
            organizationRole,
        );
    }

    @Post('businesses/:businessId/auto-reply')
    @UseGuards(AdvancedRateLimitGuard, JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @RateLimitPolicy('ai')
    @OrgRoles('OWNER', 'MANAGER', 'STAFF')
    async generateAutoReply(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @Body() dto: BusinessAutoReplyDto,
    ) {
        return this.aiService.generateBusinessAutoReply(
            businessId,
            dto.message,
            dto.customerName,
        );
    }

    @Post('reviews/:reviewId/analyze')
    @UseGuards(AdvancedRateLimitGuard, JwtAuthGuard)
    @RateLimitPolicy('ai')
    async analyzeReview(
        @Param('reviewId', new ParseUUIDPipe()) reviewId: string,
    ) {
        return this.aiService.analyzeReviewSentiment(reviewId);
    }
}
