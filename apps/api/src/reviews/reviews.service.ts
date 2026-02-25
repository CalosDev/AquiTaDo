import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import {
    CreateReviewDto,
    ModerateReviewDto,
} from './dto/review.dto';

@Injectable()
export class ReviewsService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
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
            throw new BadRequestException('No puedes resenar un negocio no verificado');
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
            throw new BadRequestException('Has alcanzado el limite temporal de resenas. Intenta mas tarde.');
        }

        const existingReview = await this.prisma.review.findFirst({
            where: {
                userId,
                businessId: dto.businessId,
            },
        });

        if (existingReview) {
            throw new BadRequestException('Ya has dejado una resena para este negocio');
        }

        const moderation = await this.resolveModerationDecision(
            userId,
            dto.businessId,
            dto.rating,
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
                throw new BadRequestException('Ya has dejado una resena para este negocio');
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

    async listFlaggedReviews(limit = 50, businessId?: string) {
        const boundedLimit = Math.min(Math.max(limit, 1), 100);

        return this.prisma.review.findMany({
            where: {
                moderationStatus: 'FLAGGED',
                ...(businessId ? { businessId } : {}),
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                business: {
                    select: {
                        id: true,
                        name: true,
                        organizationId: true,
                    },
                },
            },
            orderBy: [
                { flaggedAt: 'desc' },
                { createdAt: 'desc' },
            ],
            take: boundedLimit,
        });
    }

    async moderateReview(
        reviewId: string,
        dto: ModerateReviewDto,
        adminUserId: string,
    ) {
        const currentReview = await this.prisma.review.findUnique({
            where: { id: reviewId },
            select: {
                id: true,
                businessId: true,
                moderationStatus: true,
                flaggedAt: true,
                business: {
                    select: {
                        organizationId: true,
                    },
                },
            },
        });

        if (!currentReview) {
            throw new NotFoundException('Resena no encontrada');
        }

        const normalizedReason = dto.reason?.trim();
        const moderationReason = normalizedReason
            ? normalizedReason
            : dto.status === 'APPROVED'
                ? 'Aprobada por moderacion admin'
                : 'Marcada por moderacion admin';

        const updatedReview = await this.prisma.review.update({
            where: { id: reviewId },
            data: {
                moderationStatus: dto.status,
                isSpam: dto.status === 'FLAGGED',
                flaggedAt: dto.status === 'FLAGGED'
                    ? (currentReview.flaggedAt ?? new Date())
                    : null,
                moderationReason,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                business: {
                    select: {
                        id: true,
                        name: true,
                        organizationId: true,
                    },
                },
            },
        });

        await Promise.all([
            this.reputationService.recalculateBusinessReputation(currentReview.businessId),
            this.prisma.auditLog.create({
                data: {
                    organizationId: currentReview.business.organizationId,
                    actorUserId: adminUserId,
                    action: 'REVIEW_MODERATION_UPDATED',
                    targetType: 'REVIEW',
                    targetId: reviewId,
                    metadata: ({
                        previousStatus: currentReview.moderationStatus,
                        newStatus: dto.status,
                        reason: moderationReason,
                    } as Prisma.InputJsonValue),
                },
            }),
        ]);

        return updatedReview;
    }

    private async resolveModerationDecision(
        userId: string,
        businessId: string,
        rating: number,
        rawComment?: string,
    ): Promise<{ status: 'APPROVED' | 'FLAGGED'; reason: string | null }> {
        const comment = rawComment?.trim() ?? '';
        const reasons: string[] = [];

        const normalizedComment = comment.toLowerCase();
        const normalizedCommentCompacted = normalizedComment
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!comment) {
            const [ratingOnlyBurst, extremeRatingBurst] = await Promise.all([
                this.prisma.review.count({
                    where: {
                        userId,
                        comment: null,
                        createdAt: {
                            gte: new Date(Date.now() - 60 * 60 * 1000),
                        },
                    },
                }),
                (rating === 1 || rating === 5)
                    ? this.prisma.review.count({
                        where: {
                            userId,
                            rating,
                            createdAt: {
                                gte: new Date(Date.now() - 45 * 60 * 1000),
                            },
                        },
                    })
                    : Promise.resolve(0),
            ]);

            if (ratingOnlyBurst >= 5) {
                reasons.push('Patron masivo de resenas sin comentario');
            }

            if (extremeRatingBurst >= 4) {
                reasons.push('Burst de puntuacion extrema');
            }
        }

        if (/(https?:\/\/|www\.)/i.test(comment)) {
            reasons.push('Contiene enlaces externos');
        }

        if (/(.)\1{5,}/.test(comment)) {
            reasons.push('Patron repetitivo sospechoso');
        }

        const uppercaseRatio = comment.replace(/[^A-Z]/g, '').length / comment.replace(/\s/g, '').length;
        if (Number.isFinite(uppercaseRatio) && uppercaseRatio > 0.75 && comment.length > 20) {
            reasons.push('Uso excesivo de mayusculas');
        }

        const spamKeywords = [
            'gana dinero',
            'click aqui',
            'haz clic aqui',
            'prestamo rapido',
            'viagra',
            'bitcoin',
            'crypto',
            'contenido xxx',
            'telegram',
            'whatsapp',
            'onlyfans',
            'trabajo remoto urgente',
            'duplicar ingresos',
        ];
        if (spamKeywords.some((keyword) => normalizedComment.includes(keyword))) {
            reasons.push('Palabras clave de spam');
        }

        if (/(whatsapp|telegram|instagram|tiktok|dm|inbox)/i.test(comment)) {
            reasons.push('Contenido promocional externo');
        }

        if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(comment) || /(\+?\d[\d\s().-]{7,}\d)/.test(comment)) {
            reasons.push('Incluye datos de contacto externos');
        }

        if (comment.length >= 40) {
            const repeatedToken = /\b([a-z0-9]{3,})\b(?:\s+\1\b){2,}/i.test(normalizedCommentCompacted);
            if (repeatedToken) {
                reasons.push('Repeticion anomala de terminos');
            }
        }

        const words = normalizedCommentCompacted.split(' ').filter(Boolean);
        if (words.length >= 8) {
            const uniqueWords = new Set(words);
            const diversityRatio = uniqueWords.size / words.length;
            if (diversityRatio < 0.35) {
                reasons.push('Baja diversidad de contenido');
            }
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
            reasons.push('Comentario duplicado en multiples negocios');
        }

        const [flaggedByUserRecent, userReviewBurst] = await Promise.all([
            this.prisma.review.count({
                where: {
                    userId,
                    moderationStatus: 'FLAGGED',
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                    },
                },
            }),
            this.prisma.review.count({
                where: {
                    userId,
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 60 * 1000),
                    },
                },
            }),
        ]);

        if (flaggedByUserRecent >= 3) {
            reasons.push('Usuario con historial de riesgo');
        }

        if (userReviewBurst >= 5) {
            reasons.push('Actividad de resenas inusual');
        }

        if (normalizedCommentCompacted) {
            const coordinatedCommentCount = await this.prisma.review.count({
                where: {
                    userId: { not: userId },
                    businessId,
                    comment: {
                        equals: comment,
                        mode: 'insensitive',
                    },
                    createdAt: {
                        gte: new Date(Date.now() - 6 * 60 * 60 * 1000),
                    },
                },
            });
            if (coordinatedCommentCount >= 2) {
                reasons.push('Patron coordinado de comentario');
            }
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
