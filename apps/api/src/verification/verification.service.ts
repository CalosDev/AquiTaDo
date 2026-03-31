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
    ListVerificationDocumentsQueryDto,
    ResolvePreventiveModerationDto,
    ReviewBusinessVerificationDto,
    ReviewVerificationDocumentDto,
    SubmitBusinessVerificationDto,
    SubmitVerificationDocumentDto,
    UploadVerificationDocumentDto,
} from './dto/verification.dto';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

type PreventiveModerationResult = {
    blocked: boolean;
    score: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    riskClusters: string[];
    reasons: string[];
    currentStatus: BusinessVerificationStatus;
    currentNotes: string | null;
};

const PREVENTIVE_MODERATION_THRESHOLD = 40;
const PREVENTIVE_MODERATION_NOTE_PREFIX = 'Revision preventiva requerida antes del KYC';
const PREVENTIVE_SPAM_KEYWORDS = [
    'gana dinero',
    'click aqui',
    'haz clic aqui',
    'prestamo rapido',
    'viagra',
    'crypto',
    'bitcoin',
    'onlyfans',
    'telegram',
    'casino',
    'apuesta',
    'contenido xxx',
    'dm',
    'inbox',
];
const EXTERNAL_LINK_REGEX = /(https?:\/\/|www\.|wa\.me|bit\.ly|instagram\.com|facebook\.com|tiktok\.com)/i;
const EXTERNAL_CONTACT_REGEX = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(\+?\d[\d\s().-]{7,}\d))/i;

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
                include: this.documentInclude(),
            });

            if (business.verificationStatus === 'UNVERIFIED' || business.verificationStatus === 'REJECTED') {
                const moderation = await this.evaluatePreventiveModeration(tx, business.id);

                if (moderation.blocked) {
                    await tx.business.update({
                        where: { id: business.id },
                        data: {
                            verificationStatus: this.resolvePreventiveBlockedStatus(moderation.currentStatus),
                            verificationSubmittedAt: null,
                            verificationNotes: this.buildPreventiveModerationNote(
                                moderation.reasons,
                                moderation.currentNotes,
                            ),
                        },
                    });

                    await this.recordPreventiveModerationEvent(
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

            await this.recalculateRiskScore(business.id, tx);

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
                include: this.documentInclude(),
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

            const moderation = await this.evaluatePreventiveModeration(tx, businessId);

            if (moderation.blocked) {
                await tx.business.update({
                    where: { id: businessId },
                    data: {
                        verificationStatus: this.resolvePreventiveBlockedStatus(moderation.currentStatus),
                        verificationSubmittedAt: null,
                        verificationNotes: this.buildPreventiveModerationNote(
                            moderation.reasons,
                            moderation.currentNotes,
                        ),
                    },
                });

                await this.recordPreventiveModerationEvent(
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
                    message: this.buildPreventiveModerationErrorMessage(moderation.reasons),
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

            const moderation = await this.evaluatePreventiveModeration(tx, businessId);
            const hasPreventiveBlock = moderation.blocked || this.isPreventiveModerationNote(business.verificationNotes);

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

                await this.recordPreventiveModerationEvent(
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
                    verificationStatus: this.resolvePreventiveBlockedStatus(business.verificationStatus),
                    verificationSubmittedAt: null,
                    verificationReviewedAt: null,
                    verified: false,
                    verifiedAt: null,
                    verificationNotes: this.buildPreventiveModerationNote(
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

            await this.recordPreventiveModerationEvent(
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

            await this.recalculateRiskScore(businessId, tx);

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
                include: this.documentInclude(),
            });

            await this.recalculateRiskScore(document.businessId, tx);

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
            || this.isPreventiveModerationNote(business.verificationNotes)
        ));

        const evaluated = await Promise.all(relevantCandidates.map(async (business) => {
            const moderation = await this.evaluatePreventiveModeration(this.prisma, business.id);

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
                    preventiveSuggestedActions: this.buildPreventiveSuggestedActions(moderation.reasons),
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

    private async evaluatePreventiveModeration(
        prismaClient: PrismaClientLike,
        businessId: string,
    ): Promise<PreventiveModerationResult> {
        const business = await prismaClient.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                ownerId: true,
                organizationId: true,
                provinceId: true,
                name: true,
                description: true,
                address: true,
                phone: true,
                whatsapp: true,
                website: true,
                email: true,
                verificationStatus: true,
                verificationNotes: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        const reasons: Array<{ reason: string; points: number }> = [];
        const normalizedName = this.normalizeModerationText(business.name);
        const normalizedDescription = this.normalizeModerationText(business.description);
        const normalizedText = `${normalizedName} ${normalizedDescription}`.trim();

        if (PREVENTIVE_SPAM_KEYWORDS.some((keyword) => normalizedText.includes(keyword))) {
            reasons.push({
                reason: 'Palabras clave de spam o captacion externa en la ficha',
                points: 45,
            });
        }

        if (EXTERNAL_CONTACT_REGEX.test(business.description)) {
            reasons.push({
                reason: 'La descripcion incluye datos de contacto fuera de los campos estructurados',
                points: 20,
            });
        }

        if (EXTERNAL_LINK_REGEX.test(business.description)) {
            reasons.push({
                reason: 'La descripcion deriva trafico a canales externos antes de la verificacion',
                points: 15,
            });
        }

        if (business.description.length > 0 && business.description.length < 40 && (EXTERNAL_CONTACT_REGEX.test(business.description) || EXTERNAL_LINK_REGEX.test(business.description))) {
            reasons.push({
                reason: 'Descripcion demasiado corta para sustentar una oferta legitima',
                points: 10,
            });
        }

        if (!business.phone?.trim() && !business.whatsapp?.trim() && !business.website?.trim() && !business.email?.trim() && EXTERNAL_CONTACT_REGEX.test(business.description)) {
            reasons.push({
                reason: 'Intenta derivar el contacto sin dejar un canal estructurado verificable',
                points: 15,
            });
        }

        const uppercaseRatio = business.description.replace(/[^A-Z]/g, '').length
            / Math.max(1, business.description.replace(/\s/g, '').length);
        if (Number.isFinite(uppercaseRatio) && uppercaseRatio > 0.65 && business.description.length > 30) {
            reasons.push({
                reason: 'Uso excesivo de mayusculas promocionales',
                points: 15,
            });
        }

        if (/(.)\1{5,}/.test(business.description)) {
            reasons.push({
                reason: 'Patron repetitivo poco natural en la descripcion',
                points: 10,
            });
        }

        const descriptionWords = normalizedDescription.split(' ').filter(Boolean);
        if (descriptionWords.length >= 10) {
            const uniqueWords = new Set(descriptionWords);
            const diversityRatio = uniqueWords.size / descriptionWords.length;
            if (diversityRatio < 0.45) {
                reasons.push({
                    reason: 'Baja diversidad de contenido en la descripcion comercial',
                    points: 10,
                });
            }
        }

        if (normalizedDescription.length > 0 && normalizedDescription === normalizedName) {
            reasons.push({
                reason: 'Nombre y descripcion repiten casi el mismo texto',
                points: 10,
            });
        }

        const [
            ownerBusinessBurst,
            duplicateListingCount,
            duplicatePhoneCount,
            duplicateWhatsappCount,
            duplicateEmailCount,
            duplicateWebsiteCount,
        ] = await Promise.all([
            prismaClient.business.count({
                where: {
                    ownerId: business.ownerId,
                    deletedAt: null,
                    createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                },
            }),
            prismaClient.business.count({
                where: {
                    id: { not: business.id },
                    deletedAt: null,
                    organizationId: { not: business.organizationId },
                    provinceId: business.provinceId,
                    name: {
                        equals: business.name,
                        mode: 'insensitive',
                    },
                    address: {
                        equals: business.address,
                        mode: 'insensitive',
                    },
                },
            }),
            this.countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'phone', business.phone),
            this.countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'whatsapp', business.whatsapp),
            this.countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'email', business.email),
            this.countDuplicateBusinessField(prismaClient, business.id, business.organizationId, 'website', business.website),
        ]);

        if (ownerBusinessBurst >= 3) {
            reasons.push({
                reason: 'Creacion acelerada de multiples negocios por la misma cuenta',
                points: ownerBusinessBurst >= 5 ? 35 : 20,
            });
        }

        if (duplicateListingCount > 0) {
            reasons.push({
                reason: 'Existe otra ficha casi identica en una organizacion distinta',
                points: 35,
            });
        }

        const duplicateContactFields = [
            duplicatePhoneCount > 0 ? 'telefono' : null,
            duplicateWhatsappCount > 0 ? 'whatsapp' : null,
            duplicateEmailCount > 0 ? 'email' : null,
            duplicateWebsiteCount > 0 ? 'sitio web' : null,
        ].filter(Boolean);

        if (duplicateContactFields.length > 0) {
            reasons.push({
                reason: `Comparte ${duplicateContactFields.join(', ')} con otro negocio fuera de su organizacion`,
                points: 25,
            });
        }

        const score = Math.min(
            100,
            reasons.reduce((total, current) => total + current.points, 0),
        );
        const severity: 'LOW' | 'MEDIUM' | 'HIGH' = score >= 70
            ? 'HIGH'
            : score >= PREVENTIVE_MODERATION_THRESHOLD
                ? 'MEDIUM'
                : 'LOW';

        return {
            blocked: score >= PREVENTIVE_MODERATION_THRESHOLD,
            score,
            severity,
            riskClusters: this.buildPreventiveRiskClusters(reasons.map((item) => item.reason)),
            reasons: reasons.map((item) => item.reason),
            currentStatus: business.verificationStatus,
            currentNotes: business.verificationNotes,
        };
    }

    private async recalculateRiskScore(
        businessId: string,
        prismaClient?: PrismaClientLike,
    ): Promise<number> {
        const tx = prismaClient ?? this.prisma;
        const [spamReviews, flaggedReviews, rejectedDocs, noShowBookings] = await Promise.all([
            tx.review.count({
                where: {
                    businessId,
                    isSpam: true,
                },
            }),
            tx.review.count({
                where: {
                    businessId,
                    moderationStatus: 'FLAGGED',
                },
            }),
            tx.businessVerificationDocument.count({
                where: {
                    businessId,
                    status: 'REJECTED',
                },
            }),
            tx.booking.count({
                where: {
                    businessId,
                    status: 'NO_SHOW',
                },
            }),
        ]);

        const score = Math.min(
            100,
            spamReviews * 20 + flaggedReviews * 10 + rejectedDocs * 15 + noShowBookings * 2,
        );

        await tx.business.update({
            where: { id: businessId },
            data: { riskScore: score },
        });

        return score;
    }

    private async countDuplicateBusinessField(
        prismaClient: PrismaClientLike,
        businessId: string,
        organizationId: string,
        field: 'phone' | 'whatsapp' | 'email' | 'website',
        rawValue?: string | null,
    ): Promise<number> {
        const value = rawValue?.trim();
        if (!value) {
            return 0;
        }

        return prismaClient.business.count({
            where: {
                id: { not: businessId },
                deletedAt: null,
                organizationId: { not: organizationId },
                [field]: {
                    equals: value,
                    mode: 'insensitive',
                },
            },
        });
    }

    private normalizeModerationText(value?: string | null): string {
        return (value ?? '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private resolvePreventiveBlockedStatus(
        currentStatus: BusinessVerificationStatus,
    ): BusinessVerificationStatus {
        if (currentStatus === 'REJECTED' || currentStatus === 'SUSPENDED') {
            return currentStatus;
        }

        return 'UNVERIFIED';
    }

    private buildPreventiveModerationNote(
        reasons: string[],
        currentNotes?: string | null,
        adminNotes?: string | null,
    ): string {
        const baseMessage = `${PREVENTIVE_MODERATION_NOTE_PREFIX}: ${reasons.join('; ')}. Ajusta la ficha y vuelve a intentarlo.`;
        const extraNotes = [
            currentNotes?.trim() && !this.isPreventiveModerationNote(currentNotes)
                ? `Observacion previa: ${currentNotes.trim()}`
                : null,
            adminNotes?.trim()
                ? `Decision admin: ${adminNotes.trim()}`
                : null,
        ].filter((note): note is string => Boolean(note));

        return [baseMessage, ...extraNotes].join(' ').slice(0, 500);
    }

    private buildPreventiveModerationErrorMessage(reasons: string[]): string {
        return `Tu negocio requiere revision preventiva antes del KYC: ${reasons.join('; ')}. Corrige la ficha y vuelve a intentarlo.`;
    }

    private buildPreventiveRiskClusters(reasons: string[]): string[] {
        const clusters = new Set<string>();

        for (const reason of reasons) {
            if (
                reason.includes('spam')
                || reason.includes('mayusculas')
                || reason.includes('repetitivo')
                || reason.includes('diversidad')
                || reason.includes('Descripcion demasiado corta')
                || reason.includes('Nombre y descripcion')
            ) {
                clusters.add('Contenido');
            }
            if (
                reason.includes('contacto')
                || reason.includes('canales externos')
                || reason.includes('canal estructurado')
            ) {
                clusters.add('Contacto');
            }
            if (reason.includes('Creacion acelerada')) {
                clusters.add('Velocidad');
            }
            if (reason.includes('ficha casi identica') || reason.includes('Comparte')) {
                clusters.add('Identidad');
            }
        }

        return [...clusters];
    }

    private buildPreventiveSuggestedActions(reasons: string[]): string[] {
        const suggestions = new Set<string>();

        for (const reason of reasons) {
            if (reason.includes('contacto fuera de los campos estructurados')) {
                suggestions.add('Mueve telefonos, WhatsApp y emails a sus campos dedicados.');
            }
            if (reason.includes('canales externos')) {
                suggestions.add('Quita links y derivaciones externas de la descripcion antes de reenviar a KYC.');
            }
            if (reason.includes('Descripcion demasiado corta')) {
                suggestions.add('Amplia la descripcion con propuesta, zona y servicios reales antes de reenviar.');
            }
            if (reason.includes('spam')) {
                suggestions.add('Reescribe la descripcion con enfoque informativo, sin frases de captacion o spam.');
            }
            if (reason.includes('canal estructurado')) {
                suggestions.add('Agrega al menos un canal estructurado verificable antes de volver a enviar la ficha.');
            }
            if (reason.includes('mayusculas')) {
                suggestions.add('Normaliza el texto y evita bloques promocionales en mayusculas.');
            }
            if (reason.includes('diversidad') || reason.includes('repetitivo')) {
                suggestions.add('Haz la descripcion mas especifica y menos repetitiva.');
            }
            if (reason.includes('Nombre y descripcion')) {
                suggestions.add('Evita repetir el nombre del negocio en la descripcion y agrega contexto comercial real.');
            }
            if (reason.includes('Creacion acelerada')) {
                suggestions.add('Agrupa altas legitimas y evita bursts de negocios casi simultaneos desde la misma cuenta.');
            }
            if (reason.includes('ficha casi identica') || reason.includes('Comparte')) {
                suggestions.add('Revisa duplicados, contactos compartidos y diferencias reales entre fichas antes de reenviar.');
            }
        }

        return [...suggestions].slice(0, 4);
    }

    private isPreventiveModerationNote(note?: string | null): boolean {
        return note?.startsWith(PREVENTIVE_MODERATION_NOTE_PREFIX) ?? false;
    }

    private async recordPreventiveModerationEvent(
        prismaClient: PrismaClientLike,
        eventType: 'PREMODERATION_FLAGGED' | 'PREMODERATION_RELEASED' | 'PREMODERATION_CONFIRMED',
        businessId: string,
        organizationId: string,
        userId: string | null,
        metadata: Record<string, unknown>,
    ) {
        await prismaClient.growthEvent.create({
            data: {
                eventType,
                businessId,
                organizationId,
                userId,
                metadata: metadata as Prisma.InputJsonValue,
            },
        });
    }

    private documentInclude(): Prisma.BusinessVerificationDocumentInclude {
        return {
            business: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    verificationStatus: true,
                    verified: true,
                },
            },
            reviewedByUser: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        };
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
