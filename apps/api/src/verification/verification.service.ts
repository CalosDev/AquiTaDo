import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    BusinessVerificationStatus,
    OrganizationRole,
    Prisma,
    VerificationDocumentStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { NotificationsQueueService } from '../notifications/notifications.queue.service';
import {
    ListVerificationDocumentsQueryDto,
    ReviewBusinessVerificationDto,
    ReviewVerificationDocumentDto,
    SubmitBusinessVerificationDto,
    SubmitVerificationDocumentDto,
} from './dto/verification.dto';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class VerificationService {
    private readonly logger = new Logger(VerificationService.name);

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(ReputationService)
        private readonly reputationService: ReputationService,
        @Inject(NotificationsQueueService)
        private readonly notificationsQueueService: NotificationsQueueService,
    ) { }

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
                await tx.business.update({
                    where: { id: business.id },
                    data: {
                        verificationStatus: 'PENDING',
                        verificationSubmittedAt: new Date(),
                    },
                });
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

        return this.prisma.$transaction(async (tx) => {
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

            await tx.business.update({
                where: { id: businessId },
                data: {
                    verificationStatus: 'PENDING',
                    verificationSubmittedAt: new Date(),
                    verificationNotes: dto.notes?.trim() || null,
                },
            });

            return this.getBusinessVerificationStatus(tx, businessId, organizationId, actorGlobalRole);
        });
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
                `No se pudo encolar alerta de verificacion para negocio "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
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

        if (
            !normalized.startsWith('http://') &&
            !normalized.startsWith('https://') &&
            !normalized.startsWith('/uploads/')
        ) {
            throw new BadRequestException('La URL del documento debe ser absoluta o del bucket interno');
        }
    }
}
