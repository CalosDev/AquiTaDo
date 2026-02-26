import {
    Controller, Post, Delete, UseGuards, UseInterceptors,
    UploadedFile, Body, Param, ParseUUIDPipe, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UploadBusinessImageDto } from './dto/upload-business-image.dto';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgRoles } from '../organizations/decorators/org-roles.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { OrganizationRole } from '../generated/prisma/client';

@Controller('upload')
export class UploadsController {
    constructor(
        @Inject(UploadsService)
        private readonly uploadsService: UploadsService,
    ) { }

    @Post('business-image')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    @UseInterceptors(FileInterceptor('file'))
    async uploadBusinessImage(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
                    new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/i }),
                ],
            }),
        )
        file: Express.Multer.File,
        @Body() dto: UploadBusinessImageDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: OrganizationRole,
    ) {
        return this.uploadsService.uploadBusinessImage(
            file,
            dto.businessId,
            userId,
            userRole,
            organizationId,
            organizationRole,
        );
    }

    @Delete('business-image/:imageId')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async deleteBusinessImage(
        @Param('imageId', new ParseUUIDPipe()) imageId: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: OrganizationRole,
    ) {
        return this.uploadsService.deleteBusinessImage(
            imageId,
            userId,
            userRole,
            organizationId,
            organizationRole,
        );
    }
}
