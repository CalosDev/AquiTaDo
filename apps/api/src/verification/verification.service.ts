import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    BusinessVerificationStatus,
    GrowthEventType,
    OrganizationRole,
    Prisma,
    VerificationDocumentStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { NotificationsQueueService } from '../notifications/notifications.queue.service';
import { UploadsService } from '../uploads/uploads.service';
import {
    buildPreventiveModerationErrorMessage,
    buildPreventiveModerationNote,
    buildPreventiveSuggestedActions,
    isPreventiveModerationNote,
    resolvePreventiveBlockedStatus,
} from './preventive-moderation';
import {
    ListVerificationDocumentsQueryDto,
    ResolvePreventiveModerationDto,
    ReviewBusinessVerificationDto,
    ReviewVerificationDocumentDto,
    SubmitBusinessVerificationDto,
    SubmitVerificationDocumentDto,
    UploadVerificationDocumentDto,
} from './dto/verification.dto';
import {
    businessVerificationDocumentInclude,
    evaluatePreventiveModerationForBusiness,
    recalculateBusinessRiskScore,
    recordPreventiveModerationGrowthEvent,
    type PrismaClientLike,
} from './verification.helpers';

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(ReputationService)
        private readonly reputationService: ReputationService,
        @Inject(NotificationsQueueService)
        private readonly notificationsQueueService: NotificationsQueueService,
        @Inject(UploadsService)
        private readonly uploadsService: UploadsService,
    ) { }

    async uploadDocumentFile(
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        file: Express.Multer.File,
        dto: UploadVerificationDocumentDto,
    ) {
        this.assertCanSubmitDocuments(actorGlobalRole, organizationRole);
        return this.uploadsService.uploadVerificationDocument(
            file,
            dto.businessId,
            actorGlobalRole,
            organizationId,
            organizationRole,
        );
    }

    async submitDocument(
        organizationId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: SubmitVerificationDocumentDto,
    ) {
        this.assertCanSubmitDocuments(actorGlobalRole, organizationRole);
        this.assertDocumentUrl(dto.fileUrl);

        return this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: dto.businessId },
                select: {
                    id: true,
                    organizationId: true,
                    verificationStatus: true,
                },
            });

            if (!business || (actorGlobalRole !== 'ADMIN' && business.organizationId !== organizationId)) {
                throw new NotFoundException('Negocio no encontrado en la organización activa');
            }

            const document = await tx.businessVerificationDocument.create({
                data: {
                    organizationId: business.organizationId,
                    businessId: business.id,
                    documentType: dto.documentType,
                    fileUrl: dto.fileUrl.trim(),
                    status: 'PENDING',
                },
                include: businessVerificationDocumentInclude,
            });

            if (business.verificationStatus === 'UNVERIFIED' || business.verificationStatus === 'REJECTED') {
                const moderation = await evaluatePreventiveModerationForBusiness(tx, business.id);

                if (moderation.blocked) {
                    await tx.business.update({
                        where: { id: business.id },
                        data: {
                            verificationStatus: resolvePreventiveBlockedStatus(moderation.currentStatus),
                            verificationSubmittedAt: null,
                            verificationNotes: buildPreventiveModerationNote(
                                moderation.reasons,
                                moderation.currentNotes,
                            ),
                        },
                    });

                    await recordPreventiveModerationGrowthEvent(
                        tx,
                        GrowthEventType.PREMODERATION_FLAGGED,
                        business.id,
                        business.organizationId,
                        null,
                        {
                            trigger: 'document_submit',
                            score: moderation.score,
                            reasons: moderation.reasons,
                            currentStatus: moderation.currentStatus,
                        },
                    );
                } else {
                    await tx.business.update({
                        where: { id: business.id },
                        data: {
                            verificationStatus: 'PENDING',
                            verificationSubmittedAt: new Date(),
                            verificationNotes: null,
                        },
                    });
                }
            }

            await recalculateBusinessRiskScore(tx, business.id);

            return document;
        });
    }

    async listMyDocuments(
        organizationId: string,
        query: ListVerificationDocumentsQueryDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where: Prisma.BusinessVerificationDocumentWhereInput = {
            organizationId,
        };

        if (query.businessId) {
            where.businessId = query.businessId;
        }

        if (query.status) {
            where.status = query.status;
        }

        const [data, total] = await Promise.all([
            this.prisma.businessVerificationDocument.findMany({
                where,
                include: businessVerificationDocumentInclude,
                orderBy: [{ submittedAt: 'desc' }],
                skip,
                take: limit,
            }),
            this.prisma.businessVerificationDocument.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async submitBusinessForReview(
        organizationId: string,
        businessId: string,
        actorGlobalRole: string,
        organizationRole: OrganizationRole | null,
        dto: SubmitBusinessVerificationDto,
    ) {
        this.assertCanManageBusinessVerification(actorGlobalRole, organizationRole);

        const result = await this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: businessId },
                select: {
                    id: true,
                    organizationId: true,
                    verificationStatus: true,
                },
            });

            if (!business || (actorGlobalRole !== 'ADMIN' && business.organizationId !== organizationId)) {
                throw new NotFoundException('Negocio no encontrado en la organización activa');
            }

            const docsCount = await tx.businessVerificationDocument.count({
                where: {
                    businessId,
                },
            });

            if (docsCount === 0) {
                throw new BadRequestException('Debes subir al menos un documento antes de enviar a revisión');
            }

            const moderation = await evaluatePreventiveModerationForBusiness(tx, businessId);

            if (moderation.blocked) {
                await tx.business.update({
                    where: { id: businessId },
                    data: {
                        verificationStatus: resolvePreventiveBlockedStatus(moderation.currentStatus),
                        verificationSubmittedAt: null,
                        verificationNotes: buildPreventiveModerationNote(
                            moderation.reasons,
                            moderation.currentNotes,
                        ),
                    },
                });

                await recordPreventiveModerationGrowthEvent(
                    tx,
                    GrowthEventType.PREMODERATION_FLAGGED,
                    business.id,
                    business.organizationId,
                    null,
                    {
                        trigger: 'business_submit',
                        score: moderation.score,
                        reasons: moderation.reasons,
                        currentStatus: moderation.currentStatus,
                    },
                );

                return {
                    blocked: true as const,
                    message: buildPreventiveModerationErrorMessage(moderation.reasons),
                };
            }

            await tx.business.update({
                where: { id: businessId },
                data: {
                    verificationStatus: 'PENDING',
                    verificationSubmittedAt: new Date(),
                    verificationNotes: dto.notes?.trim() || null,
                },
            });

            return {
                blocked: false as const,
                data: await this.getBusinessVerificationStatus(tx, businessId, organizationId, actorGlobalRole),
            };
        });

        if (result.blocked) {
            throw new BadRequestException(result.message);
        }

        return result.data;
    }

    async getBusinessVerificationStatusForOrganization(
        organizationId: string,
        businessId: string,
        actorGlobalRole: string,
    ) {
        return this.getBusinessVerificationStatus(this.prisma, businessId, organizationId, actorGlobalRole);
    }

    async listPendingBusinesses(limit = 50) {
        const take = Math.min(Math.max(limit, 1), 100);

        const pending = await this.prisma.business.findMany({
            where: {
                verificationStatus: 'PENDING',
            },
            select: {
                id: true,
                name: true,
                slug: true,
                organizationId: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                province: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                city: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                verificationStatus: true,
                verificationSubmittedAt: true,
                verificationNotes: true,
                riskScore: true,
                _count: {
                    select: {
                        verificationDocuments: true,
                        reviews: true,
                    },
                },
            },
            orderBy: [{ verificationSubmittedAt: 'asc' }, { createdAt: 'asc' }],
            take,
        });

        const businessIds = pending.map((business) => business.id);
        const docStatus = businessIds.length > 0
            ? await this.prisma.businessVerificationDocument.groupBy({
                by: ['businessId', 'status'],
                where: { businessId: { in: businessIds } },
                _count: { _all: true },
            })
            : [];

        const docsMap = new Map<string, Record<string, number>>();
        for (const row of docStatus) {
            const current = docsMap.get(row.businessId) ?? {};
            current[row.status] = row._count._all;
            docsMap.set(row.businessId, current);
        }

        return pending.map((business) => ({
            ...business,
            documents: {
                total: business._count.verificationDocuments,
                pending: docsMap.get(business.id)?.PENDING ?? 0,
                approved: docsMap.get(business.id)?.APPROVED ?? 0,
                rejected: docsMap.get(business.id)?.REJECTED ?? 0,
            },
        }));
    }

    async listModerationQueue(limit = 100) {
        const take = Math.min(Math.max(limit, 1), 200);

        const [pendingBusinesses, pendingDocuments, flaggedReviews, preventiveBusinesses] = await Promise.all([
            this.listPendingBusinesses(take),
            this.prisma.businessVerificationDocument.findMany({
                where: {
                    status: 'PENDING',
                },
                select: {
                    id: true,
                    documentType: true,
                    status: true,
                    submittedAt: true,
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            riskScore: true,
                            verificationStatus: true,
                            organization: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { submittedAt: 'asc' },
                take,
            }),
            this.prisma.review.findMany({
                where: {
                    moderationStatus: 'FLAGGED',
                },
                select: {
                    id: true,
                    rating: true,
                    comment: true,
                    moderationReason: true,
                    flaggedAt: true,
                    createdAt: true,
                    isSpam: true,
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
                            slug: true,
                            riskScore: true,
                            organization: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [{ flaggedAt: 'asc' }, { createdAt: 'asc' }],
                take,
            }),
            this.listPreventiveModerationBusinesses(take),
        ]);

        const queueItems = [
            ...pendingBusinesses.map((business) => ({
                id: `business-${business.id}`,
                queueType: 'BUSINESS_VERIFICATION' as const,
                entityId: business.id,
                status: business.verificationStatus,
                priority: business.riskScore >= 70 ? 'HIGH' as const : 'MEDIUM' as const,
                createdAt: business.verificationSubmittedAt ?? new Date(0).toISOString(),
                organization: business.organization,
                business: {
                    id: business.id,
                    name: business.name,
                    slug: business.slug,
                    riskScore: business.riskScore,
                },
                payload: {
                    verificationNotes: business.verificationNotes,
                    documents: business.documents,
                },
            })),
            ...preventiveBusinesses.map((business) => ({
                id: `pre-moderation-${business.business.id}`,
                queueType: 'BUSINESS_PREMODERATION' as const,
                entityId: business.business.id,
                status: 'FLAGGED',
                priority: business.priority,
                createdAt: business.createdAt,
                organization: business.organization,
                business: business.business,
                payload: business.payload,
            })),
            ...pendingDocuments.map((document) => ({
                id: `document-${document.id}`,
                queueType: 'DOCUMENT_REVIEW' as const,
                entityId: document.id,
                status: document.status,
                priority: document.business.riskScore >= 70 ? 'HIGH' as const : 'MEDIUM' as const,
                createdAt: document.submittedAt.toISOString(),
                organization: document.business.organization,
                business: {
                    id: document.business.id,
                    name: document.business.name,
                    slug: document.business.slug,
                    riskScore: document.business.riskScore,
                },
                payload: {
                    documentType: document.documentType,
                    verificationStatus: document.business.verificationStatus,
                },
            })),
            ...flaggedReviews.map((review) => ({
                id: `review-${review.id}`,
                queueType: 'REVIEW_MODERATION' as const,
                entityId: review.id,
                status: 'FLAGGED',
                priority: review.isSpam || review.rating <= 2 ? 'HIGH' as const : 'MEDIUM' as const,
                createdAt: (review.flaggedAt ?? review.createdAt).toISOString(),
                organization: review.business.organization,
                business: {
                    id: review.business.id,
                    name: review.business.name,
                    slug: review.business.slug,
                    riskScore: review.business.riskScore,
                },
                payload: {
                    rating: review.rating,
                    comment: review.comment,
                    moderationReason: review.moderationReason,
                    user: review.user,
                },
            })),
        ]
            .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
            .slice(0, take);

        return {
            summary: {
                total: queueItems.length,
                businessVerifications: pendingBusinesses.length,
                preventiveBusinesses: preventiveBusinesses.length,
                documentReviews: pendingDocuments.length,
                flaggedReviews: flaggedReviews.length,
            },
            items: queueItems,
        };
    }

    async resolvePreventiveModeration(
        businessId: string,
        reviewerUserId: string,
        dto: ResolvePreventiveModerationDto,
    ) {
        const result = await this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: businessId },
                select: {
                    id: true,
                    name: true,
                    organizationId: true,
                    whatsapp: true,
                    verificationStatus: true,
                    verificationNotes: true,
                    owner: {
                        select: {
                            phone: true,
                        },
                    },
                    _count: {
                        select: {
                            verificationDocuments: true,
                        },
                    },
                },
            });

            if (!business) {
                throw new NotFoundException('Negocio no encontrado');
            }

            const moderation = await evaluatePreventiveModerationForBusiness(tx, businessId);
            const hasPreventiveBlock = moderation.blocked || isPreventiveModerationNote(business.verificationNotes);

            if (!hasPreventiveBlock) {
                throw new BadRequestException('El negocio no tiene una revision preventiva activa');
            }

            const now = new Date();

            if (dto.decision === 'APPROVE_FOR_KYC') {
                if (business._count.verificationDocuments === 0) {
                    throw new BadRequestException('Debes cargar al menos un documento antes de liberar el negocio a KYC');
                }

                const updatedBusiness = await tx.business.update({
                    where: { id: businessId },
                    data: {
                        verificationStatus: 'PENDING',
                        verificationSubmittedAt: now,
                        verificationReviewedAt: null,
                        verified: false,
                        verifiedAt: null,
                        verificationNotes: dto.notes?.trim() || 'Aprobado por moderacion preventiva para avanzar a KYC',
                    },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        verified: true,
                        verifiedAt: true,
                        verificationStatus: true,
                        verificationSubmittedAt: true,
                        verificationReviewedAt: true,
                        verificationNotes: true,
                        riskScore: true,
                    },
                });

                await recordPreventiveModerationGrowthEvent(
                    tx,
                    GrowthEventType.PREMODERATION_RELEASED,
                    business.id,
                    business.organizationId,
                    reviewerUserId,
                    {
                        decision: dto.decision,
                        score: moderation.score,
                        reasons: moderation.reasons,
                        documentsTotal: business._count.verificationDocuments,
                    },
                );

                return {
                    updatedBusiness,
                    notificationPayload: {
                        organizationId: business.organizationId,
                        businessId: business.id,
                        ownerPhone: business.owner?.phone ?? business.whatsapp ?? null,
                        businessName: business.name,
                        status: 'Aprobado para KYC',
                        notes: updatedBusiness.verificationNotes,
                },
            };
        }

            const blockedReasons = moderation.reasons.length > 0
                ? moderation.reasons
                : ['Bloqueo preventivo mantenido por revision administrativa'];

            const updatedBusiness = await tx.business.update({
                where: { id: businessId },
                data: {
                    verificationStatus: resolvePreventiveBlockedStatus(business.verificationStatus),
                    verificationSubmittedAt: null,
                    verificationReviewedAt: null,
                    verified: false,
                    verifiedAt: null,
                    verificationNotes: buildPreventiveModerationNote(
                        blockedReasons,
                        business.verificationNotes,
                        dto.notes,
                    ),
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    verified: true,
                    verifiedAt: true,
                    verificationStatus: true,
                    verificationSubmittedAt: true,
                    verificationReviewedAt: true,
                    verificationNotes: true,
                    riskScore: true,
                },
            });

            await recordPreventiveModerationGrowthEvent(
                tx,
                GrowthEventType.PREMODERATION_CONFIRMED,
                business.id,
                business.organizationId,
                reviewerUserId,
                {
                    decision: dto.decision,
                    score: moderation.score,
                    reasons: blockedReasons,
                    documentsTotal: business._count.verificationDocuments,
                },
            );

            return {
                updatedBusiness,
                notificationPayload: {
                    organizationId: business.organizationId,
                    businessId: business.id,
                    ownerPhone: business.owner?.phone ?? business.whatsapp ?? null,
                    businessName: business.name,
                    status: 'Revision preventiva mantenida',
                    notes: updatedBusiness.verificationNotes,
                },
            };
        });

        try {
            await this.notificationsQueueService.enqueueVerificationAlert(result.notificationPayload);
        } catch (error) {
            this.logger.warn(
                `No se pudo encolar la resolucion de premoderacion para el negocio "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }

        return result.updatedBusiness;
    }

    async reviewBusiness(
        businessId: string,
        reviewerUserId: string,
        dto: ReviewBusinessVerificationDto,
    ) {
        if (dto.status === 'UNVERIFIED') {
            throw new BadRequestException('Estado de revisión inválido');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({
                where: { id: businessId },
                select: {
                    id: true,
                    name: true,
                    organizationId: true,
                    whatsapp: true,
                    verificationStatus: true,
                    owner: {
                        select: {
                            phone: true,
                        },
                    },
                },
            });

            if (!business) {
                throw new NotFoundException('Negocio no encontrado');
            }

            const now = new Date();
            const reviewStatus = dto.status;
            const shouldVerify = reviewStatus === 'VERIFIED';

            const updatedBusiness = await tx.business.update({
                where: { id: businessId },
                data: {
                    verificationStatus: reviewStatus,
                    verificationReviewedAt: now,
                    verificationNotes: dto.notes?.trim() || null,
                    verified: shouldVerify,
                    verifiedAt: shouldVerify ? now : null,
                },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    verified: true,
                    verifiedAt: true,
                    verificationStatus: true,
                    verificationSubmittedAt: true,
                    verificationReviewedAt: true,
                    verificationNotes: true,
                    riskScore: true,
                },
            });

            if (reviewStatus === 'VERIFIED') {
                await tx.businessVerificationDocument.updateMany({
                    where: {
                        businessId,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'APPROVED',
                        reviewedByUserId: reviewerUserId,
                        reviewedAt: now,
                        rejectionReason: null,
                    },
                });

                await this.reputationService.recalculateBusinessReputation(businessId, tx);
            } else if (reviewStatus === 'REJECTED' || reviewStatus === 'SUSPENDED') {
                await tx.businessVerificationDocument.updateMany({
                    where: {
                        businessId,
                        status: 'PENDING',
                    },
                    data: {
                        status: 'REJECTED',
                        reviewedByUserId: reviewerUserId,
                        reviewedAt: now,
                        rejectionReason: dto.notes?.trim() || 'Revisión administrativa',
                    },
                });
            }

            await recalculateBusinessRiskScore(tx, businessId);

            return {
                updatedBusiness,
                notificationPayload: {
                    organizationId: business.organizationId,
                    businessId: business.id,
                    ownerPhone: business.owner?.phone ?? business.whatsapp ?? null,
                    businessName: business.name,
                    status: reviewStatus,
                    notes: dto.notes?.trim() || null,
                },
            };
        });

        try {
            await this.notificationsQueueService.enqueueVerificationAlert(result.notificationPayload);
        } catch (error) {
            this.logger.warn(
                `No se pudo encolar la alerta de verificación para el negocio "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }

        return result.updatedBusiness;
    }

    async reviewDocument(
        documentId: string,
        reviewerUserId: string,
        dto: ReviewVerificationDocumentDto,
    ) {
        if (dto.status === 'REJECTED' && !dto.rejectionReason?.trim()) {
            throw new BadRequestException('Debes indicar una razón de rechazo para el documento');
        }

        return this.prisma.$transaction(async (tx) => {
            const document = await tx.businessVerificationDocument.findUnique({
                where: { id: documentId },
                select: {
                    id: true,
                    businessId: true,
                },
            });

            if (!document) {
                throw new NotFoundException('Documento de verificación no encontrado');
            }

            const reviewed = await tx.businessVerificationDocument.update({
                where: { id: documentId },
                data: {
                    status: dto.status,
                    rejectionReason: dto.status === 'REJECTED' ? dto.rejectionReason?.trim() : null,
                    reviewedByUserId: reviewerUserId,
                    reviewedAt: new Date(),
                },
                include: businessVerificationDocumentInclude,
            });

            await recalculateBusinessRiskScore(tx, document.businessId);

            return reviewed;
        });
    }

    private async getBusinessVerificationStatus(
        prismaClient: PrismaClientLike,
        businessId: string,
        organizationId: string,
        actorGlobalRole: string,
    ) {
        const business = await prismaClient.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                organizationId: true,
                verified: true,
                verifiedAt: true,
                verificationStatus: true,
                verificationSubmittedAt: true,
                verificationReviewedAt: true,
                verificationNotes: true,
                riskScore: true,
                verificationDocuments: {
                    orderBy: { submittedAt: 'desc' },
                    select: {
                        id: true,
                        documentType: true,
                        fileUrl: true,
                        status: true,
                        rejectionReason: true,
                        submittedAt: true,
                        reviewedAt: true,
                        reviewedByUser: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        if (!business || (actorGlobalRole !== 'ADMIN' && business.organizationId !== organizationId)) {
            throw new NotFoundException('Negocio no encontrado en la organización activa');
        }

        return business;
    }

    private async listPreventiveModerationBusinesses(limit: number) {
        const candidateLimit = Math.min(Math.max(limit * 2, 10), 200);
        const candidates = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
                verified: false,
                verificationStatus: {
                    in: ['UNVERIFIED', 'REJECTED', 'SUSPENDED'],
                },
            },
            select: {
                id: true,
                name: true,
                slug: true,
                riskScore: true,
                verificationNotes: true,
                verificationSubmittedAt: true,
                createdAt: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                _count: {
                    select: {
                        verificationDocuments: true,
                        reviews: true,
                    },
                },
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
            take: candidateLimit,
        });

        const relevantCandidates = candidates.filter((business) => (
            business._count.verificationDocuments > 0
            || isPreventiveModerationNote(business.verificationNotes)
        ));

        const evaluated = await Promise.all(relevantCandidates.map(async (business) => {
            const moderation = await evaluatePreventiveModerationForBusiness(this.prisma, business.id);

            if (!moderation.blocked) {
                return null;
            }

            const priority = moderation.score >= 70
                ? 'HIGH' as const
                : moderation.score >= 50
                    ? 'MEDIUM' as const
                    : 'LOW' as const;

            return {
                createdAt: (business.verificationSubmittedAt ?? business.createdAt).toISOString(),
                priority,
                organization: business.organization,
                business: {
                    id: business.id,
                    name: business.name,
                    slug: business.slug,
                    riskScore: Math.max(business.riskScore, moderation.score),
                },
                payload: {
                    preventiveScore: moderation.score,
                    preventiveSeverity: moderation.severity,
                    preventiveRiskClusters: moderation.riskClusters,
                    preventiveReasons: moderation.reasons,
                    preventiveSuggestedActions: buildPreventiveSuggestedActions(moderation.reasons),
                    verificationNotes: business.verificationNotes,
                    documents: {
                        total: business._count.verificationDocuments,
                    },
                    reviews: {
                        total: business._count.reviews,
                    },
                },
            };
        }));

        return evaluated
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .slice(0, limit);
    }

    private assertCanSubmitDocuments(
        globalRole: string,
        organizationRole: OrganizationRole | null,
    ): void {
        if (globalRole === 'ADMIN') {
            return;
        }

        if (!organizationRole) {
            throw new ForbiddenException('No tienes permisos para subir documentos de verificación');
        }
    }

    private assertCanManageBusinessVerification(
        globalRole: string,
        organizationRole: OrganizationRole | null,
    ): void {
        if (globalRole === 'ADMIN') {
            return;
        }

        if (!organizationRole || organizationRole === 'STAFF') {
            throw new ForbiddenException('No tienes permisos para enviar verificaciones');
        }
    }

    private assertDocumentUrl(fileUrl: string): void {
        const normalized = fileUrl.trim();
        if (!normalized) {
            throw new BadRequestException('La URL del documento es obligatoria');
        }

        if (normalized.startsWith('/uploads/verification/')) {
            return;
        }

        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            throw new BadRequestException('La URL del documento debe provenir del storage de la plataforma');
        }

        let parsed: URL;
        try {
            parsed = new URL(normalized);
        } catch {
            throw new BadRequestException('La URL del documento no es válida');
        }

        if (!parsed.pathname.includes('/verification/')) {
            throw new BadRequestException('La URL del documento debe pertenecer a verificación interna');
        }

        const configuredPublicBase = this.configService.get<string>('STORAGE_PUBLIC_BASE_URL')?.trim().replace(/\/+$/, '');
        if (configuredPublicBase) {
            if (!normalized.startsWith(`${configuredPublicBase}/`)) {
                throw new BadRequestException('La URL del documento no pertenece al bucket configurado');
            }
            return;
        }

        const bucket = this.configService.get<string>('STORAGE_S3_BUCKET')?.trim();
        const region = (this.configService.get<string>('STORAGE_S3_REGION') || 'us-east-1').trim();
        const endpoint = this.configService.get<string>('STORAGE_S3_ENDPOINT')?.trim().replace(/\/+$/, '');
        const forcePathStyle = ['1', 'true'].includes(
            (this.configService.get<string>('STORAGE_S3_FORCE_PATH_STYLE') || 'false').trim().toLowerCase(),
        );

        const allowedPrefixes: string[] = [];
        if (endpoint) {
            allowedPrefixes.push(forcePathStyle && bucket
                ? `${endpoint}/${bucket}/`
                : `${endpoint}/`);
        }

        if (bucket) {
            allowedPrefixes.push(`https://${bucket}.s3.${region}.amazonaws.com/`);
        }

        if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
            throw new BadRequestException('La URL del documento no pertenece al storage autorizado');
        }
    }
}
