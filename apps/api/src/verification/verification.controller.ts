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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import {
    ListVerificationDocumentsQueryDto,
    ReviewBusinessVerificationDto,
    ReviewVerificationDocumentDto,
    SubmitBusinessVerificationDto,
    SubmitVerificationDocumentDto,
} from './dto/verification.dto';
import { VerificationService } from './verification.service';

@Controller('verification')
export class VerificationController {
    constructor(
        @Inject(VerificationService)
        private readonly verificationService: VerificationService,
    ) { }

    @Post('documents')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async submitDocument(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: SubmitVerificationDocumentDto,
    ) {
        return this.verificationService.submitDocument(
            organizationId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }

    @Get('documents/my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listMyDocuments(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListVerificationDocumentsQueryDto,
    ) {
        return this.verificationService.listMyDocuments(organizationId, query);
    }

    @Post('businesses/:businessId/submit')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async submitBusiness(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @Body() dto: SubmitBusinessVerificationDto,
    ) {
        return this.verificationService.submitBusinessForReview(
            organizationId,
            businessId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }

    @Get('businesses/:businessId/status')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async getBusinessStatus(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentUser('role') actorGlobalRole: string,
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
    ) {
        return this.verificationService.getBusinessVerificationStatusForOrganization(
            organizationId,
            businessId,
            actorGlobalRole,
        );
    }

    @Get('admin/pending-businesses')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async listPendingBusinesses(
        @Query('limit') limitRaw?: string,
    ) {
        const parsedLimit = limitRaw ? Number(limitRaw) : 50;
        return this.verificationService.listPendingBusinesses(
            Number.isFinite(parsedLimit) ? parsedLimit : 50,
        );
    }

    @Patch('admin/businesses/:businessId/review')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async reviewBusiness(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @CurrentUser('id') reviewerUserId: string,
        @Body() dto: ReviewBusinessVerificationDto,
    ) {
        return this.verificationService.reviewBusiness(
            businessId,
            reviewerUserId,
            dto,
        );
    }

    @Patch('admin/documents/:documentId/review')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async reviewDocument(
        @Param('documentId', new ParseUUIDPipe()) documentId: string,
        @CurrentUser('id') reviewerUserId: string,
        @Body() dto: ReviewVerificationDocumentDto,
    ) {
        return this.verificationService.reviewDocument(
            documentId,
            reviewerUserId,
            dto,
        );
    }
}
