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
    @UseGuards(JwtAuthGuard)
    async findMine(@CurrentUser('id') userId: string) {
        return this.businessesService.findMine(userId);
    }

    @Get('admin/all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async findAllAdmin(@Query() query: BusinessQueryDto) {
        return this.businessesService.findAllAdmin(query);
    }

    @Get(':id')
    @UseGuards(OptionalJwtAuthGuard)
    async findById(
        @Param('id') id: string,
        @CurrentUser('id') userId?: string,
        @CurrentUser('role') userRole?: string,
    ) {
        return this.businessesService.findById(id, userId, userRole);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    async create(
        @Body() dto: CreateBusinessDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.businessesService.create(dto, userId);
    }

    @Put(':id')
    @UseGuards(JwtAuthGuard)
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateBusinessDto,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.businessesService.update(id, dto, userId, userRole);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    async delete(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
        @CurrentUser('role') userRole: string,
    ) {
        return this.businessesService.delete(id, userId, userRole);
    }

    @Put(':id/verify')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async verify(@Param('id') id: string) {
        return this.businessesService.verify(id);
    }
}
