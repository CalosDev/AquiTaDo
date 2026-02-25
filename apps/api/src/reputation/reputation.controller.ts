import {
    Controller,
    Get,
    Inject,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ListReputationRankingQueryDto } from './dto/reputation.dto';
import { ReputationService } from './reputation.service';

@Controller('reputation')
export class ReputationController {
    constructor(
        @Inject(ReputationService)
        private readonly reputationService: ReputationService,
    ) { }

    @Get('rankings')
    async getRankings(@Query() query: ListReputationRankingQueryDto) {
        return this.reputationService.getRankings(query.provinceId, query.limit ?? 20);
    }

    @Get('business/:businessId')
    async getBusinessProfile(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
    ) {
        return this.reputationService.getBusinessProfile(businessId);
    }

    @Post('business/:businessId/recalculate')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async recalculateBusiness(
        @Param('businessId', new ParseUUIDPipe()) businessId: string,
    ) {
        return this.reputationService.recalculateBusinessReputation(businessId);
    }
}
