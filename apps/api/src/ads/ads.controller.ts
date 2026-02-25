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
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { AdsService } from './ads.service';
import {
    AdPlacementQueryDto,
    CreateAdCampaignDto,
    ListAdCampaignsQueryDto,
    TrackAdInteractionDto,
    UpdateAdCampaignStatusDto,
} from './dto/ads.dto';

@Controller('ads')
export class AdsController {
    constructor(
        @Inject(AdsService)
        private readonly adsService: AdsService,
    ) { }

    @Get('placements')
    async getPlacements(@Query() query: AdPlacementQueryDto) {
        return this.adsService.getPlacements(query);
    }

    @Post('campaigns/:id/impression')
    async trackImpression(
        @Param('id', new ParseUUIDPipe()) campaignId: string,
        @Body() dto: TrackAdInteractionDto,
    ) {
        return this.adsService.trackImpression(campaignId, dto);
    }

    @Post('campaigns/:id/click')
    async trackClick(
        @Param('id', new ParseUUIDPipe()) campaignId: string,
        @Body() dto: TrackAdInteractionDto,
    ) {
        return this.adsService.trackClick(campaignId, dto);
    }

    @Post('campaigns')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async createCampaign(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('id') actorUserId: string,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: CreateAdCampaignDto,
    ) {
        return this.adsService.createCampaign(
            organizationId,
            actorUserId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }

    @Get('campaigns/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listMyCampaigns(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListAdCampaignsQueryDto,
    ) {
        return this.adsService.listMyCampaigns(organizationId, query);
    }

    @Patch('campaigns/:id/status')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async updateCampaignStatus(
        @Param('id', new ParseUUIDPipe()) campaignId: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: UpdateAdCampaignStatusDto,
    ) {
        return this.adsService.updateCampaignStatus(
            campaignId,
            organizationId,
            actorGlobalRole,
            organizationRole,
            dto.status,
        );
    }
}
