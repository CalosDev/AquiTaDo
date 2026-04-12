import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import {
    AdminCatalogPublicationTargetDto,
    AdminMarkBusinessClaimedTargetDto,
    AdminUnclaimBusinessTargetDto,
    BusinessClaimRequestQueryDto,
    ReviewBusinessClaimRequestDto,
} from './dto/business.dto';
import {
    BusinessDuplicateCaseQueryDto,
    ResolveBusinessDuplicateCaseDto,
} from './dto/business-duplicate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCatalogController {
    constructor(private readonly businessesService: BusinessesService) { }

    @Get('business-claim-requests')
    async listClaimRequests(@Query() query: BusinessClaimRequestQueryDto) {
        return this.businessesService.listClaimRequests(query);
    }

    @Get('business-claim-requests/:id')
    async getClaimRequestAdmin(@Param('id', new ParseUUIDPipe()) id: string) {
        return this.businessesService.getClaimRequestAdmin(id);
    }

    @Post('business-claim-requests/:id/review')
    async reviewClaimRequest(
        @Param('id', new ParseUUIDPipe()) id: string,
        @Body() dto: ReviewBusinessClaimRequestDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.reviewClaimRequest(id, dto, adminUserId);
    }

    @Get('catalog/duplicates')
    async listDuplicateCases(@Query() query: BusinessDuplicateCaseQueryDto) {
        return this.businessesService.listDuplicateCases(query);
    }

    @Post('catalog/merge')
    async resolveDuplicateCase(
        @Body() dto: ResolveBusinessDuplicateCaseDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.resolveDuplicateCase(dto, adminUserId);
    }

    @Post('catalog/publish')
    async publishBusiness(
        @Body() dto: AdminCatalogPublicationTargetDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.updateAdminPublicationState(dto.businessId, true, dto.notes, adminUserId);
    }

    @Post('catalog/unpublish')
    async unpublishBusiness(
        @Body() dto: AdminCatalogPublicationTargetDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.updateAdminPublicationState(dto.businessId, false, dto.notes, adminUserId);
    }

    @Post('catalog/mark-claimed')
    async markClaimedBusiness(
        @Body() dto: AdminMarkBusinessClaimedTargetDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.markBusinessClaimedAdmin(dto.businessId, dto, adminUserId);
    }

    @Post('catalog/unclaim')
    async unclaimBusiness(
        @Body() dto: AdminUnclaimBusinessTargetDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.businessesService.unclaimBusinessAdmin(dto.businessId, dto, adminUserId);
    }
}
