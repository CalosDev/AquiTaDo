import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('reviews')
export class ReviewsController {
    constructor(private readonly reviewsService: ReviewsService) { }

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
}
