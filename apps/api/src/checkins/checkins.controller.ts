import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CheckInsService } from './checkins.service';
import { CreateCheckInDto, ListMyCheckInsQueryDto } from './dto/checkins.dto';

@Controller('checkins')
export class CheckInsController {
    constructor(
        @Inject(CheckInsService)
        private readonly checkInsService: CheckInsService,
    ) { }

    @Get('business/:businessId/stats')
    async getBusinessStats(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
    ) {
        return this.checkInsService.getBusinessCheckInStats(businessId);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('USER')
    async createCheckIn(
        @CurrentUser('id') userId: string,
        @Body() dto: CreateCheckInDto,
    ) {
        return this.checkInsService.createCheckIn(userId, dto);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('USER')
    async getMyCheckIns(
        @CurrentUser('id') userId: string,
        @Query() query: ListMyCheckInsQueryDto,
    ) {
        return this.checkInsService.listMyCheckIns(userId, query);
    }
}
