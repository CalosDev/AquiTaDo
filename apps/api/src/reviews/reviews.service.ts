import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    async create(dto: CreateReviewDto, userId: string) {
        const business = await this.prisma.business.findUnique({
            where: { id: dto.businessId },
            select: { id: true, verified: true },
        });

        if (!business) {
            throw new BadRequestException('Negocio no encontrado');
        }

        if (!business.verified) {
            throw new BadRequestException('No puedes reseñar un negocio no verificado');
        }

        // Check if user already reviewed this business
        const existingReview = await this.prisma.review.findFirst({
            where: {
                userId,
                businessId: dto.businessId,
            },
        });

        if (existingReview) {
            throw new BadRequestException('Ya has dejado una reseña para este negocio');
        }

        try {
            return await this.prisma.review.create({
                data: {
                    rating: dto.rating,
                    comment: dto.comment,
                    userId,
                    businessId: dto.businessId,
                },
                include: {
                    user: {
                        select: { id: true, name: true },
                    },
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new BadRequestException('Ya has dejado una reseña para este negocio');
            }

            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2003'
            ) {
                throw new BadRequestException('Negocio no encontrado');
            }

            throw error;
        }
    }

    async findByBusiness(businessId: string) {
        return this.prisma.review.findMany({
            where: { businessId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
