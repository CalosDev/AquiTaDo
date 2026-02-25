import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateReviewDto } from './dto/review.dto';
import { ReputationService } from '../reputation/reputation.service';

@Injectable()
export class ReviewsService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
        @Inject(ReputationService)
        private readonly reputationService: ReputationService,
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

        const recentReviewsCount = await this.prisma.review.count({
            where: {
                userId,
                createdAt: {
                    gte: new Date(Date.now() - 10 * 60 * 1000),
                },
            },
        });

        if (recentReviewsCount >= 8) {
            throw new BadRequestException('Has alcanzado el límite temporal de reseñas. Intenta más tarde.');
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

        const moderation = await this.resolveModerationDecision(
            userId,
            dto.businessId,
            dto.comment,
        );

        try {
            const createdReview = await this.prisma.review.create({
                data: {
                    rating: dto.rating,
                    comment: dto.comment,
                    userId,
                    businessId: dto.businessId,
                    moderationStatus: moderation.status,
                    moderationReason: moderation.reason,
                    flaggedAt: moderation.status === 'FLAGGED' ? new Date() : null,
                    isSpam: moderation.status === 'FLAGGED',
                },
                include: {
                    user: {
                        select: { id: true, name: true },
                    },
                },
            });

            await this.reputationService.recalculateBusinessReputation(dto.businessId);

            return createdReview;
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
            where: {
                businessId,
                moderationStatus: 'APPROVED',
                isSpam: false,
            },
            include: {
                user: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    private async resolveModerationDecision(
        userId: string,
        businessId: string,
        rawComment?: string,
    ): Promise<{ status: 'APPROVED' | 'FLAGGED'; reason: string | null }> {
        const comment = rawComment?.trim() ?? '';
        if (!comment) {
            return { status: 'APPROVED', reason: null };
        }

        const reasons: string[] = [];
        const normalizedComment = comment.toLowerCase();

        if (/(https?:\/\/|www\.)/i.test(comment)) {
            reasons.push('Contiene enlaces externos');
        }

        if (/(.)\1{5,}/.test(comment)) {
            reasons.push('Patrón repetitivo sospechoso');
        }

        const uppercaseRatio = comment.replace(/[^A-Z]/g, '').length / comment.replace(/\s/g, '').length;
        if (Number.isFinite(uppercaseRatio) && uppercaseRatio > 0.75 && comment.length > 20) {
            reasons.push('Uso excesivo de mayúsculas');
        }

        const spamKeywords = [
            'gana dinero',
            'click aqui',
            'prestamo rapido',
            'viagra',
            'bitcoin',
            'crypto',
            'contenido xxx',
        ];
        if (spamKeywords.some((keyword) => normalizedComment.includes(keyword))) {
            reasons.push('Palabras clave de spam');
        }

        const sameCommentCount = await this.prisma.review.count({
            where: {
                userId,
                businessId: { not: businessId },
                comment: {
                    equals: comment,
                    mode: 'insensitive',
                },
                createdAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            },
        });

        if (sameCommentCount > 0) {
            reasons.push('Comentario duplicado en múltiples negocios');
        }

        if (reasons.length === 0) {
            return { status: 'APPROVED', reason: null };
        }

        return {
            status: 'FLAGGED',
            reason: reasons.join('; ').slice(0, 255),
        };
    }
}
