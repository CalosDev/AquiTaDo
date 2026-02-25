import {
    Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Inject,
} from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto, UpdateBusinessDto, BusinessQueryDto, NearbyQueryDto } from './dto/business.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentOrganization } from '../organizations/decorators/current-organization.decorator';
import { OrgRoles } from '../organizations/decorators/org-roles.decorator';
import { OrgContextGuard } from '../organizations/guards/org-context.guard';
import { OptionalOrgContextGuard } from '../organizations/guards/optional-org-context.guard';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { OrganizationRole } from '../generated/prisma/client';

@Controller('businesses')
export class BusinessesController {
    constructor(
        @Inject(BusinessesService)
        private readonly businessesService: BusinessesService,
    ) { }

    @Get()
    async findAll(@Query() query: BusinessQueryDto) {
        return this.businessesService.findAll(query);
    }

    @Get('nearby')
    async findNearby(@Query() query: NearbyQueryDto) {
        return this.businessesService.findNearby(query);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard, OrgContextGuard)
    async findMine(
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
        @CurrentOrganization('organizationId') organizationId: string,
    ) {
        return this.businessesService.findMine(userId, userRole, organizationId);
    }

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async findAllAdmin(@Query() query: BusinessQueryDto) {
        return this.businessesService.findAllAdmin(query);
    }

    @Get(':id')
    @UseGuards(OptionalJwtAuthGuard, OptionalOrgContextGuard)
    async findById(
        @Param('id') id: string,
        @CurrentUser('id') userId?: string,
        @CurrentUser('role') userRole?: string,
        @CurrentOrganization('organizationId') organizationId?: string,
    ) {
        return this.businessesService.findById(id, userId, userRole, organizationId);
    }

    @Post()
    @UseGuards(JwtAuthGuard, OptionalOrgContextGuard)
    async create(
        @Body() dto: CreateBusinessDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
        @CurrentOrganization('organizationId') organizationId?: string,
        @CurrentOrganization('organizationRole') organizationRole?: OrganizationRole,
    ) {
        return this.businessesService.create(dto, userId, userRole, organizationId, organizationRole);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateBusinessDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: OrganizationRole,
    ) {
        return this.businessesService.update(id, dto, userId, userRole, organizationId, organizationRole);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, OrgContextGuard, OrgRolesGuard)
    @OrgRoles('OWNER', 'MANAGER')
    async delete(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
        @CurrentOrganization('organizationId') organizationId: string,
        @CurrentOrganization('organizationRole') organizationRole: OrganizationRole,
    ) {
        return this.businessesService.delete(id, userId, userRole, organizationId, organizationRole);
    }

    @Put(':id/verify')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async verify(@Param('id') id: string) {
        return this.businessesService.verify(id);
    }
}
