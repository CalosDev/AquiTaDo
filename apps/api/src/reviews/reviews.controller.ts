import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import {
    CreateReviewDto,
    ListFlaggedReviewsQueryDto,
    ModerateReviewDto,
} from './dto/review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('reviews')
export class ReviewsController {
    constructor(
        @Inject(ReviewsService)
        private readonly reviewsService: ReviewsService,
    ) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    async create(
        @Body() dto: CreateReviewDto,
        @CurrentUser('id') userId: string,
    ) {
        return this.reviewsService.create(dto, userId);
    }

    @Get('business/:businessId')
    async findByBusiness(@Param('businessId') businessId: string) {
        return this.reviewsService.findByBusiness(businessId);
    }

    @Get('moderation/flagged')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async listFlaggedReviews(@Query() query: ListFlaggedReviewsQueryDto) {
        return this.reviewsService.listFlaggedReviews(query.limit, query.businessId);
    }

    @Patch(':reviewId/moderation')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async moderateReview(
        @Param('reviewId') reviewId: string,
        @Body() dto: ModerateReviewDto,
        @CurrentUser('id') adminUserId: string,
    ) {
        return this.reviewsService.moderateReview(reviewId, dto, adminUserId);
    }
}
