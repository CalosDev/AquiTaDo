import {
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { CreatePromotionDto, ListMyPromotionsQueryDto, ListPublicPromotionsQueryDto, UpdatePromotionDto } from './dto/promotion.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
    constructor(
        @Inject(PromotionsService)
        private readonly promotionsService: PromotionsService,
    ) { }

    @Get()
    async listPublic(@Query() query: ListPublicPromotionsQueryDto) {
        return this.promotionsService.listPublic(query);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async listMine(
        @CurrentOrganization('organizationId') organizationId: string,
        @Query() query: ListMyPromotionsQueryDto,
    ) {
        return this.promotionsService.listMine(organizationId, query);
    }

    @Post()
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async create(
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('id') actorUserId: string,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: CreatePromotionDto,
    ) {
        return this.promotionsService.create(
            organizationId,
            actorUserId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async update(
        @Param('id', new ParseUUIDPipe()) id: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
        @Body() dto: UpdatePromotionDto,
    ) {
        return this.promotionsService.update(
            id,
            organizationId,
            actorGlobalRole,
            organizationRole,
            dto,
        );
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async delete(
        @Param('id', new ParseUUIDPipe()) id: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: 'OWNER' | 'MANAGER' | 'STAFF' | null,
        @CurrentUser('role') actorGlobalRole: string,
    ) {
        return this.promotionsService.delete(
            id,
            organizationId,
            actorGlobalRole,
            organizationRole,
        );
    }
}
