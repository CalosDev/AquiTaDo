import {
    Body,
    Controller,
    Get,
    Inject,
    MaxFileSizeValidator,
    Param,
    ParseFilePipe,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
    FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import {
    ListVerificationDocumentsQueryDto,
    ResolvePreventiveModerationDto,
    ReviewBusinessVerificationDto,
    ReviewVerificationDocumentDto,
    SubmitBusinessVerificationDto,
    SubmitVerificationDocumentDto,
    UploadVerificationDocumentDto,
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

    @Post('documents/upload')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    @UseInterceptors(FileInterceptor('file'))
    async uploadDocument(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
                    new FileTypeValidator({ fileType: /^(application\/pdf|image\/(jpeg|png|webp))$/i }),
                ],
            }),
        )
        file: Express.Multer.File,
        @Body() dto: UploadVerificationDocumentDto,
    ) {
        return this.verificationService.uploadDocumentFile(
            organizationId,
            actorGlobalRole,
            organizationRole,
            file,
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

    @Get('admin/moderation-queue')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async listModerationQueue(
        @Query('limit') limitRaw?: string,
    ) {
        const parsedLimit = limitRaw ? Number(limitRaw) : 100;
        return this.verificationService.listModerationQueue(
            Number.isFinite(parsedLimit) ? parsedLimit : 100,
        );
    }

    @Patch('admin/businesses/:businessId/pre-moderation')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async resolvePreventiveModeration(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
        @CurrentUser('id') reviewerUserId: string,
        @Body() dto: ResolvePreventiveModerationDto,
    ) {
        return this.verificationService.resolvePreventiveModeration(
            businessId,
            reviewerUserId,
            dto,
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
