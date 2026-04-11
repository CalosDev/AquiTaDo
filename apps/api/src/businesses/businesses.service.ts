import {
    Inject,
    Injectable,
    Logger,
    BadRequestException,
    ConflictException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { GrowthEventType, OrganizationRole, Prisma, SalesLeadStage } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
    CreateBusinessDto,
    UpdateBusinessDto,
    BusinessQueryDto,
    NearbyQueryDto,
    CreatePublicLeadDto,
    ClaimSearchQueryDto,
    CreateBusinessClaimRequestDto,
    ReviewBusinessClaimRequestDto,
    BusinessClaimRequestQueryDto,
    CreateAdminCatalogBusinessDto,
} from './dto/business.dto';
import {
    BusinessSuggestionQueryDto,
    CreateBusinessSuggestionDto,
    ReviewBusinessSuggestionDto,
} from './dto/business-suggestion.dto';
import {
    BusinessDuplicateCaseQueryDto,
    ResolveBusinessDuplicateCaseDto,
} from './dto/business-duplicate.dto';
import slugify from 'slugify';
import { getOrganizationPlanLimits } from '../organizations/organization-plan-limits';
import { ReputationService } from '../reputation/reputation.service';
import { RedisService } from '../cache/redis.service';
import { DomainEventsService } from '../core/events/domain-events.service';
import { NotificationsQueueService } from '../notifications/notifications.queue.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { SearchService } from '../search/search.service';
import {
    assertCoordinatePair,
    canAccessUnverified,
    decorateBusinessProfile,
    decorateBusinessProfiles,
    findDuplicateCandidates,
    normalizeBusinessHours,
    normalizeOptionalEmail,
    normalizeOptionalText,
    normalizePublicListQuery,
    resolvePagination,
} from './businesses.helpers';
import {
    adminListBusinessSelect,
    businessDetailBaseSelect,
    catalogQualityBusinessSelect,
    mineListBusinessSelect,
} from './businesses.selects';

type CatalogBusinessInput = {
    name: string;
    description: string;
    phone?: string;
    whatsapp?: string;
    website?: string | null;
    email?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    priceRange?: CreateAdminCatalogBusinessDto['priceRange'];
    address: string;
    latitude?: number;
    longitude?: number;
    provinceId: string;
    cityId?: string | null;
    sectorId?: string | null;
    categoryIds?: string[];
    featureIds?: string[];
    hours?: CreateAdminCatalogBusinessDto['hours'];
    ignorePotentialDuplicates?: boolean;
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    catalogManagedByAdmin?: boolean;
    isClaimable?: boolean;
    source: 'ADMIN' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
};

type BusinessDuplicateSignalInput = {
    name?: string | null;
    search?: string | null;
    address?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    website?: string | null;
    instagramUrl?: string | null;
    provinceId?: string | null;
    cityId?: string | null;
    sectorId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    categoryIds?: string[];
};

const ACTIVE_CLAIM_REQUEST_STATUSES = ['PENDING', 'UNDER_REVIEW'] as const;

@Injectable()
export class BusinessesService {
    private readonly logger = new Logger(BusinessesService.name);
    private static readonly DETAIL_ID_CACHE_PREFIX = 'public:businesses:detail:id';
    private static readonly DETAIL_SLUG_CACHE_PREFIX = 'public:businesses:detail:slug';

    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
        @Inject(ReputationService)
        private readonly reputationService: ReputationService,
        @Inject(RedisService)
        private readonly redisService: RedisService,
        @Inject(DomainEventsService)
        private readonly domainEventsService: DomainEventsService,
        @Inject(NotificationsQueueService)
        private readonly notificationsQueueService: NotificationsQueueService,
        @Inject(IntegrationsService)
        private readonly integrationsService: IntegrationsService,
        @Inject(SearchService)
        private readonly searchService: SearchService,
    ) { }
    private readonly uploadsRoot = path.resolve(process.cwd(), 'uploads');

    async createPublicLead(
        businessId: string,
        dto: CreatePublicLeadDto,
    ) {
        const business = await this.prisma.business.findFirst({
            where: {
                id: businessId,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                claimStatus: true,
                ownerId: true,
                organizationId: true,
                whatsapp: true,
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

        if (business.claimStatus !== 'CLAIMED') {
            throw new BadRequestException('Este negocio todavia no ha sido reclamado y no puede recibir consultas operativas');
        }

        if (!business.organizationId || !business.ownerId) {
            throw new BadRequestException('Este negocio todavia no tiene configuracion operativa completa');
        }

        const contactName = dto.contactName.trim();
        const contactEmail = dto.contactEmail?.trim().toLowerCase() || null;
        const contactPhone = dto.contactPhone.trim();
        const phoneValidation = await this.integrationsService.validateDominicanPhone(contactPhone);
        if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
            throw new BadRequestException('El teléfono de contacto no es válido para República Dominicana');
        }
        const normalizedPhone = phoneValidation.normalizedPhone;
        const preferredChannel = dto.preferredChannel?.trim().toUpperCase() || null;
        const message = dto.message.trim();

        const duplicateWindowStart = new Date(Date.now() - 10 * 60 * 1000);
        const recentDuplicate = await this.prisma.salesLead.findFirst({
            where: {
                businessId: business.id,
                stage: 'LEAD',
                deletedAt: null,
                createdAt: {
                    gte: duplicateWindowStart,
                },
                metadata: {
                    path: ['contactPhoneNormalized'],
                    equals: normalizedPhone,
                },
            },
            select: {
                id: true,
            },
        });

        if (recentDuplicate) {
            throw new BadRequestException(
                'Ya existe una solicitud reciente con este teléfono. Intenta nuevamente en unos minutos.',
            );
        }

        const stage: SalesLeadStage = 'LEAD';
        const createdLead = await this.prisma.salesLead.create({
            data: {
                organizationId: business.organizationId,
                businessId: business.id,
                createdByUserId: business.ownerId,
                stage,
                title: `Lead web: ${contactName}`,
                notes: message,
                metadata: {
                    source: 'public-business-page',
                    contactName,
                    contactPhone,
                    contactPhoneNormalized: normalizedPhone,
                    contactEmail,
                    preferredChannel,
                    businessSlug: business.slug,
                },
            },
            select: {
                id: true,
                stage: true,
                createdAt: true,
            },
        });

        try {
            await this.prisma.growthEvent.create({
                data: {
                    eventType: GrowthEventType.CONTACT_CLICK,
                    businessId: business.id,
                    organizationId: business.organizationId,
                    metadata: {
                        source: 'public-business-page',
                        leadId: createdLead.id,
                        preferredChannel,
                        businessSlug: business.slug,
                    } as Prisma.InputJsonValue,
                },
            });
        } catch (error) {
            this.logger.warn(
                `Failed to persist growth event CONTACT_CLICK for business ${business.id}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        try {
            await this.notificationsQueueService.enqueuePublicLeadAlert({
                organizationId: business.organizationId,
                businessId: business.id,
                businessName: business.name,
                businessWhatsapp: business.whatsapp,
                ownerPhone: business.owner?.phone ?? null,
                leadId: createdLead.id,
                contactName,
                contactPhone,
                contactEmail,
                message,
                preferredChannel,
                createdAt: createdLead.createdAt.toISOString(),
            });
        } catch (error) {
            this.logger.warn(
                `Failed to enqueue public lead alert for business ${business.id}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        return {
            id: createdLead.id,
            status: createdLead.stage,
            createdAt: createdLead.createdAt,
            message: 'Solicitud enviada. El negocio te contactara pronto.',
        };
    }

    async findAll(
        query: BusinessQueryDto,
        trackingContext?: { visitorId?: string; sessionId?: string; source?: string | null },
    ) {
        return this.searchService.listPublicBusinesses(query, trackingContext);
    }

    async findAllAdmin(query: BusinessQueryDto) {
        const normalizedQuery = normalizePublicListQuery(query);
        const { page, limit, skip } = resolvePagination(normalizedQuery.page, normalizedQuery.limit, 12, 100);
        const where = await this.buildWhere(normalizedQuery, true);

        const [data, total] = await Promise.all([
            this.prisma.business.findMany({
                where,
                select: adminListBusinessSelect,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.business.count({ where }),
        ]);

        const decoratedData = decorateBusinessProfiles(data as Record<string, any>[]);

        return {
            data: decoratedData,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findMine(_userId: string, _userRole: string, organizationId: string) {
        const businesses = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
                ownerships: {
                    some: {
                        organizationId,
                        isActive: true,
                    },
                },
            },
            select: mineListBusinessSelect,
            orderBy: { createdAt: 'desc' },
        });
        return decorateBusinessProfiles(businesses as Record<string, any>[]);
    }

    async findById(
        id: string,
        userId?: string,
        userRole?: string,
        currentOrganizationId?: string,
    ) {
        if (!userId) {
            const cacheKey = `${BusinessesService.DETAIL_ID_CACHE_PREFIX}:${id}`;
            return this.redisService.rememberJsonStaleWhileRevalidate(cacheKey, 120, 900, async () => {
                const publicBusiness = await this.findPublicBusinessById(id);
                if (!publicBusiness) {
                    throw new NotFoundException('Negocio no encontrado');
                }
                return decorateBusinessProfile(publicBusiness as Record<string, any>);
            });
        }

        const business = await this.findBusinessByIdWithReviews(id);

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (!business.verified && !canAccessUnverified(
            business.ownerId,
            business.organizationId,
            userId,
            userRole,
            currentOrganizationId,
        )) {
            throw new NotFoundException('Negocio no encontrado');
        }

        return decorateBusinessProfile(business as Record<string, any>);
    }

    async findBySlug(
        slug: string,
        userId?: string,
        userRole?: string,
        currentOrganizationId?: string,
    ) {
        if (!userId) {
            const cacheKey = `${BusinessesService.DETAIL_SLUG_CACHE_PREFIX}:${slug}`;
            return this.redisService.rememberJsonStaleWhileRevalidate(cacheKey, 120, 900, async () => {
                const publicBusiness = await this.findPublicBusinessBySlug(slug);
                if (!publicBusiness) {
                    throw new NotFoundException('Negocio no encontrado');
                }
                return decorateBusinessProfile(publicBusiness as Record<string, any>);
            });
        }

        const business = await this.findBusinessBySlugWithReviews(slug);

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (!business.verified && !canAccessUnverified(
            business.ownerId,
            business.organizationId,
            userId,
            userRole,
            currentOrganizationId,
        )) {
            throw new NotFoundException('Negocio no encontrado');
        }

        return decorateBusinessProfile(business as Record<string, any>);
    }

    async claimSearch(query: ClaimSearchQueryDto) {
        const matches = await this.searchClaimCandidates({
            search: query.q,
            address: query.address,
            phone: query.phone,
            whatsapp: query.whatsapp,
            website: query.website,
            instagramUrl: query.instagramUrl,
            provinceId: query.provinceId,
            cityId: query.cityId,
            sectorId: query.sectorId,
            latitude: query.latitude,
            longitude: query.longitude,
            categoryIds: query.categoryIds,
            limit: query.limit,
        });

        return {
            data: matches,
            total: matches.length,
            query: query.q.trim(),
        };
    }

    async listClaimRequests(query: BusinessClaimRequestQueryDto) {
        const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
        const status = query.status ?? 'PENDING';
        const items = await this.prisma.businessClaimRequest.findMany({
            where: {
                status,
            },
            select: {
                id: true,
                status: true,
                evidenceType: true,
                evidenceValue: true,
                notes: true,
                adminNotes: true,
                createdAt: true,
                updatedAt: true,
                reviewedAt: true,
                approvedAt: true,
                rejectedAt: true,
                expiredAt: true,
                canceledAt: true,
                business: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        claimStatus: true,
                        publicStatus: true,
                        source: true,
                    },
                },
                requesterUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
                requesterOrganization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                reviewedByAdmin: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });

        const summary = await this.prisma.businessClaimRequest.groupBy({
            by: ['status'],
            _count: {
                _all: true,
            },
        });

        return {
            data: items,
            summary: summary.reduce<Record<string, number>>((accumulator, item) => {
                accumulator[item.status] = item._count._all;
                return accumulator;
            }, {}),
        };
    }

    async createClaimRequest(
        businessId: string,
        dto: CreateBusinessClaimRequestDto,
        requesterUserId: string,
        requesterOrganizationId?: string,
    ) {
        const normalizedEvidenceValue = normalizeOptionalText(dto.evidenceValue) ?? null;
        const normalizedNotes = normalizeOptionalText(dto.notes) ?? null;

        try {
            const claimRequest = await this.prisma.$transaction(async (tx) => {
                const business = await tx.business.findUnique({
                    where: { id: businessId },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        provinceId: true,
                        cityId: true,
                        claimStatus: true,
                        isClaimable: true,
                        deletedAt: true,
                    },
                });

                if (!business || business.deletedAt) {
                    throw new NotFoundException('Negocio no encontrado');
                }

                if (!business.isClaimable) {
                    throw new BadRequestException('Este negocio no esta disponible para reclamacion');
                }

                if (business.claimStatus === 'CLAIMED') {
                    throw new BadRequestException('Este negocio ya fue reclamado');
                }

                const activeOwnership = await tx.businessOwnership.findFirst({
                    where: {
                        businessId,
                        isActive: true,
                    },
                    select: { id: true },
                });

                if (activeOwnership) {
                    throw new ConflictException('Este negocio ya tiene un ownership activo');
                }

                const existingPendingRequest = await tx.businessClaimRequest.findFirst({
                    where: {
                        businessId,
                        status: {
                            in: [...ACTIVE_CLAIM_REQUEST_STATUSES],
                        },
                    },
                    select: { id: true },
                });

                if (existingPendingRequest) {
                    throw new ConflictException('Ya existe una solicitud de reclamacion pendiente para este negocio');
                }

                const createdRequest = await tx.businessClaimRequest.create({
                    data: {
                        businessId,
                        requesterUserId,
                        requesterOrganizationId: requesterOrganizationId ?? null,
                        evidenceType: dto.evidenceType,
                        evidenceValue: normalizedEvidenceValue,
                        notes: normalizedNotes,
                    },
                    select: {
                        id: true,
                        status: true,
                        createdAt: true,
                        business: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                });

                await tx.business.update({
                    where: { id: businessId },
                    data: {
                        claimStatus: 'PENDING_CLAIM',
                        updatedByUserId: requesterUserId,
                    },
                    select: { id: true },
                });

                await tx.auditLog.create({
                    data: {
                        organizationId: requesterOrganizationId ?? null,
                        actorUserId: requesterUserId,
                        action: 'business_claim_request.created',
                        targetType: 'business_claim_request',
                        targetId: createdRequest.id,
                        metadata: {
                            businessId,
                            businessSlug: business.slug,
                            evidenceType: dto.evidenceType,
                        } as Prisma.InputJsonValue,
                    },
                });

                await tx.growthEvent.create({
                    data: {
                        eventType: GrowthEventType.CLAIM_REQUEST_SUBMITTED,
                        businessId,
                        organizationId: requesterOrganizationId ?? null,
                        userId: requesterUserId,
                        provinceId: business.provinceId,
                        cityId: business.cityId,
                        metadata: {
                            claimRequestId: createdRequest.id,
                            evidenceType: dto.evidenceType,
                        } as Prisma.InputJsonValue,
                    },
                });

                return createdRequest;
            });

            this.domainEventsService.publishClaimRequestCreated({
                claimRequestId: claimRequest.id,
                businessId: claimRequest.business.id,
                businessSlug: claimRequest.business.slug,
                requesterUserId,
                requesterOrganizationId: requesterOrganizationId ?? null,
            });

            return {
                ...claimRequest,
                message: 'Solicitud de reclamacion enviada para revision administrativa',
            };
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async reviewClaimRequest(
        claimRequestId: string,
        dto: ReviewBusinessClaimRequestDto,
        adminUserId: string,
    ) {
        const reviewNotes = normalizeOptionalText(dto.notes) ?? null;
        const reviewedAt = new Date();

        try {
            const reviewedClaim = await this.prisma.$transaction(async (tx) => {
                const claimRequest = await tx.businessClaimRequest.findUnique({
                    where: { id: claimRequestId },
                    select: {
                        id: true,
                        businessId: true,
                        requesterUserId: true,
                        requesterOrganizationId: true,
                        status: true,
                        notes: true,
                        business: {
                            select: {
                                id: true,
                                slug: true,
                                claimStatus: true,
                            },
                        },
                    },
                });

                if (!claimRequest) {
                    throw new NotFoundException('Solicitud de reclamacion no encontrada');
                }

                if (!ACTIVE_CLAIM_REQUEST_STATUSES.includes(claimRequest.status as (typeof ACTIVE_CLAIM_REQUEST_STATUSES)[number])) {
                    throw new BadRequestException('Esta solicitud ya fue revisada');
                }

                if (dto.status === 'APPROVED') {
                    const effectiveOrganizationId = claimRequest.requesterOrganizationId
                        ?? await this.ensureOwnerOrganization(tx, claimRequest.requesterUserId);

                    const activeOwnership = await tx.businessOwnership.findFirst({
                        where: {
                            businessId: claimRequest.businessId,
                            isActive: true,
                        },
                        select: {
                            id: true,
                            organizationId: true,
                        },
                    });

                    if (activeOwnership) {
                        throw new ConflictException('El negocio ya tiene un ownership activo');
                    }

                    await tx.user.updateMany({
                        where: {
                            id: claimRequest.requesterUserId,
                            role: 'USER',
                        },
                        data: {
                            role: 'BUSINESS_OWNER',
                        },
                    });

                    await tx.business.update({
                        where: { id: claimRequest.businessId },
                        data: {
                            ownerId: claimRequest.requesterUserId,
                            organizationId: effectiveOrganizationId,
                            claimStatus: 'CLAIMED',
                            claimedAt: reviewedAt,
                            claimedByUserId: claimRequest.requesterUserId,
                            updatedByUserId: adminUserId,
                            lastReviewedAt: reviewedAt,
                        },
                        select: {
                            id: true,
                        },
                    });

                    const ownership = await tx.businessOwnership.create({
                        data: {
                            businessId: claimRequest.businessId,
                            organizationId: effectiveOrganizationId,
                            grantedByUserId: adminUserId,
                            claimRequestId,
                            role: 'PRIMARY_OWNER',
                            isActive: true,
                            grantedAt: reviewedAt,
                        },
                        select: {
                            id: true,
                        },
                    });

                    await tx.businessClaimRequest.update({
                        where: { id: claimRequestId },
                        data: {
                            status: 'APPROVED',
                            adminNotes: reviewNotes,
                            reviewedByAdminId: adminUserId,
                            reviewedAt,
                            approvedAt: reviewedAt,
                        },
                        select: { id: true },
                    });

                    await tx.businessClaimRequest.updateMany({
                        where: {
                            businessId: claimRequest.businessId,
                            status: {
                                in: [...ACTIVE_CLAIM_REQUEST_STATUSES],
                            },
                            id: {
                                not: claimRequestId,
                            },
                        },
                        data: {
                            status: 'CANCELED',
                            adminNotes: 'Cancelada automaticamente porque otro reclamo fue aprobado.',
                            reviewedByAdminId: adminUserId,
                            reviewedAt,
                            canceledAt: reviewedAt,
                        },
                    });

                    await tx.auditLog.create({
                        data: {
                            organizationId: effectiveOrganizationId,
                            actorUserId: adminUserId,
                            action: 'business_claim_request.reviewed',
                            targetType: 'business_claim_request',
                            targetId: claimRequestId,
                            metadata: {
                                status: 'APPROVED',
                                businessId: claimRequest.businessId,
                                businessSlug: claimRequest.business.slug,
                                requesterUserId: claimRequest.requesterUserId,
                                requesterOrganizationId: effectiveOrganizationId,
                            } as Prisma.InputJsonValue,
                        },
                    });

                    return {
                        id: claimRequest.id,
                        status: 'APPROVED' as const,
                        businessId: claimRequest.businessId,
                        businessSlug: claimRequest.business.slug,
                        requesterUserId: claimRequest.requesterUserId,
                        requesterOrganizationId: effectiveOrganizationId,
                        organizationId: effectiveOrganizationId,
                        ownershipId: ownership.id,
                    };
                }

                const [remainingActiveClaims, activeOwnership] = await Promise.all([
                    tx.businessClaimRequest.count({
                        where: {
                            businessId: claimRequest.businessId,
                            id: {
                                not: claimRequestId,
                            },
                            status: {
                                in: [...ACTIVE_CLAIM_REQUEST_STATUSES],
                            },
                        },
                    }),
                    tx.businessOwnership.findFirst({
                        where: {
                            businessId: claimRequest.businessId,
                            isActive: true,
                        },
                        select: {
                            id: true,
                        },
                    }),
                ]);

                await tx.businessClaimRequest.update({
                    where: { id: claimRequestId },
                    data: {
                        status: 'REJECTED',
                        adminNotes: reviewNotes,
                        reviewedByAdminId: adminUserId,
                        reviewedAt,
                        rejectedAt: reviewedAt,
                    },
                    select: { id: true },
                });

                await tx.business.update({
                    where: { id: claimRequest.businessId },
                    data: {
                        claimStatus: activeOwnership
                            ? 'CLAIMED'
                            : remainingActiveClaims > 0
                                ? 'PENDING_CLAIM'
                                : 'UNCLAIMED',
                        updatedByUserId: adminUserId,
                        lastReviewedAt: reviewedAt,
                    },
                    select: { id: true },
                });

                await tx.auditLog.create({
                    data: {
                        organizationId: claimRequest.requesterOrganizationId ?? null,
                        actorUserId: adminUserId,
                        action: 'business_claim_request.reviewed',
                        targetType: 'business_claim_request',
                        targetId: claimRequestId,
                        metadata: {
                            status: 'REJECTED',
                            businessId: claimRequest.businessId,
                            businessSlug: claimRequest.business.slug,
                            requesterUserId: claimRequest.requesterUserId,
                            requesterOrganizationId: claimRequest.requesterOrganizationId,
                        } as Prisma.InputJsonValue,
                    },
                });

                return {
                    id: claimRequest.id,
                    status: 'REJECTED' as const,
                    businessId: claimRequest.businessId,
                    businessSlug: claimRequest.business.slug,
                    requesterUserId: claimRequest.requesterUserId,
                    requesterOrganizationId: claimRequest.requesterOrganizationId,
                    organizationId: claimRequest.requesterOrganizationId,
                };
            });

            this.publishBusinessChangedEvent(
                reviewedClaim.businessId,
                reviewedClaim.businessSlug,
                'updated',
            );

            this.domainEventsService.publishClaimRequestReviewed({
                claimRequestId: reviewedClaim.id,
                businessId: reviewedClaim.businessId,
                businessSlug: reviewedClaim.businessSlug,
                status: reviewedClaim.status,
                requesterUserId: reviewedClaim.requesterUserId,
                requesterOrganizationId: reviewedClaim.requesterOrganizationId ?? null,
                reviewedByAdminId: adminUserId,
            });

            if (reviewedClaim.status === 'APPROVED' && reviewedClaim.organizationId) {
                this.domainEventsService.publishBusinessLinkedToOrganization({
                    businessId: reviewedClaim.businessId,
                    businessSlug: reviewedClaim.businessSlug,
                    organizationId: reviewedClaim.organizationId,
                    ownerUserId: reviewedClaim.requesterUserId,
                    linkedByUserId: adminUserId,
                });
            }

            return reviewedClaim;
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async listOwnershipHistory(businessId: string, limit = 20) {
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                claimStatus: true,
                ownerId: true,
                organizationId: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        const ownerships = await this.prisma.businessOwnership.findMany({
            where: {
                businessId,
            },
            orderBy: [
                { isActive: 'desc' },
                { grantedAt: 'desc' },
                { createdAt: 'desc' },
            ],
            take: safeLimit,
            select: {
                id: true,
                role: true,
                isActive: true,
                grantedAt: true,
                revokedAt: true,
                revokeReason: true,
                organization: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                grantedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                revokedByUser: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                claimRequest: {
                    select: {
                        id: true,
                        status: true,
                        requesterUser: {
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

        return {
            business,
            data: ownerships,
        };
    }

    async revokeBusinessOwnership(
        businessId: string,
        ownershipId: string,
        reason: string,
        adminUserId: string,
    ) {
        const revokeReason = normalizeOptionalText(reason);
        if (!revokeReason) {
            throw new BadRequestException('El motivo de revocacion es obligatorio');
        }

        const revokedAt = new Date();

        try {
            const result = await this.prisma.$transaction(async (tx) => {
                const ownership = await tx.businessOwnership.findFirst({
                    where: {
                        id: ownershipId,
                        businessId,
                    },
                    select: {
                        id: true,
                        businessId: true,
                        organizationId: true,
                        isActive: true,
                        business: {
                            select: {
                                id: true,
                                slug: true,
                            },
                        },
                    },
                });

                if (!ownership) {
                    throw new NotFoundException('Ownership no encontrado');
                }

                if (!ownership.isActive) {
                    throw new BadRequestException('Este ownership ya fue revocado');
                }

                await tx.businessOwnership.update({
                    where: { id: ownershipId },
                    data: {
                        isActive: false,
                        revokedAt,
                        revokedByUserId: adminUserId,
                        revokeReason,
                    },
                    select: { id: true },
                });

                const nextActiveOwnership = await tx.businessOwnership.findFirst({
                    where: {
                        businessId,
                        isActive: true,
                    },
                    orderBy: [
                        { grantedAt: 'desc' },
                        { createdAt: 'desc' },
                    ],
                    select: {
                        organizationId: true,
                    },
                });

                await tx.business.update({
                    where: { id: businessId },
                    data: {
                        organizationId: nextActiveOwnership?.organizationId ?? null,
                        ownerId: nextActiveOwnership ? undefined : null,
                        claimStatus: nextActiveOwnership ? 'CLAIMED' : 'UNCLAIMED',
                        claimedByUserId: nextActiveOwnership ? undefined : null,
                        claimedAt: nextActiveOwnership ? undefined : null,
                        updatedByUserId: adminUserId,
                        lastReviewedAt: revokedAt,
                    },
                    select: {
                        id: true,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        organizationId: ownership.organizationId,
                        actorUserId: adminUserId,
                        action: 'business_ownership.revoked',
                        targetType: 'business_ownership',
                        targetId: ownership.id,
                        metadata: {
                            businessId,
                            businessSlug: ownership.business.slug,
                            revokeReason,
                        } as Prisma.InputJsonValue,
                    },
                });

                return {
                    businessId,
                    businessSlug: ownership.business.slug,
                    ownershipId: ownership.id,
                };
            });

            this.publishBusinessChangedEvent(result.businessId, result.businessSlug, 'updated');

            return {
                ...result,
                revokedAt,
                message: 'Ownership revocado correctamente',
            };
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async submitBusinessSuggestion(
        dto: CreateBusinessSuggestionDto,
        submittedByUserId: string,
    ) {
        const normalizedName = dto.name.trim();
        const normalizedAddress = dto.address.trim();
        if (!normalizedName) {
            throw new BadRequestException('El nombre del negocio es obligatorio');
        }
        if (!normalizedAddress) {
            throw new BadRequestException('La direccion del negocio es obligatoria');
        }

        const normalizedDescription = normalizeOptionalText(dto.description) ?? null;
        const normalizedNotes = normalizeOptionalText(dto.notes) ?? null;
        const contactChannels = await this.normalizeBusinessContactChannels(dto.phone, dto.whatsapp);
        const website = normalizeOptionalText(dto.website) ?? null;
        const email = normalizeOptionalEmail(dto.email) ?? null;

        await this.assertCityBelongsToProvince(this.prisma, dto.provinceId, dto.cityId);

        const createdSuggestion = await this.prisma.businessSuggestion.create({
            data: {
                submittedByUserId,
                name: normalizedName,
                description: normalizedDescription,
                categoryId: dto.categoryId ?? null,
                address: normalizedAddress,
                provinceId: dto.provinceId,
                cityId: dto.cityId ?? null,
                phone: contactChannels.phone ?? null,
                whatsapp: contactChannels.whatsapp ?? null,
                website,
                email,
                notes: normalizedNotes,
            },
            select: {
                id: true,
                status: true,
                createdAt: true,
            },
        });

        try {
            await this.prisma.growthEvent.create({
                data: {
                    eventType: GrowthEventType.USER_SUGGESTION_SUBMITTED,
                    userId: submittedByUserId,
                    categoryId: dto.categoryId ?? null,
                    provinceId: dto.provinceId,
                    cityId: dto.cityId ?? null,
                    metadata: ({
                        suggestionId: createdSuggestion.id,
                    } as Prisma.InputJsonValue),
                },
            });
        } catch (error) {
            this.logger.warn(
                `Failed to persist growth event USER_SUGGESTION_SUBMITTED for suggestion ${createdSuggestion.id}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }

        return {
            ...createdSuggestion,
            message: 'Sugerencia enviada. El equipo admin la revisara antes de publicar la ficha.',
        };
    }

    async listBusinessSuggestions(
        query: BusinessSuggestionQueryDto,
        submittedByUserId?: string,
    ) {
        const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
        const where: Prisma.BusinessSuggestionWhereInput = {
            ...(query.status ? { status: query.status } : {}),
            ...(submittedByUserId ? { submittedByUserId } : {}),
        };

        const [items, summary] = await Promise.all([
            this.prisma.businessSuggestion.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    address: true,
                    phone: true,
                    whatsapp: true,
                    website: true,
                    email: true,
                    notes: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    reviewedAt: true,
                    category: {
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
                            slug: true,
                        },
                    },
                    submittedByUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    reviewedByAdmin: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                    createdBusiness: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            claimStatus: true,
                            publicStatus: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
            }),
            this.prisma.businessSuggestion.groupBy({
                by: ['status'],
                where: submittedByUserId ? { submittedByUserId } : undefined,
                _count: {
                    _all: true,
                },
            }),
        ]);

        return {
            data: items,
            summary: summary.reduce<Record<string, number>>((accumulator, item) => {
                accumulator[item.status] = item._count._all;
                return accumulator;
            }, {}),
        };
    }

    async reviewBusinessSuggestion(
        suggestionId: string,
        dto: ReviewBusinessSuggestionDto,
        adminUserId: string,
    ) {
        const reviewNotes = normalizeOptionalText(dto.notes) ?? null;
        const reviewedAt = new Date();

        const suggestion = await this.prisma.businessSuggestion.findUnique({
            where: { id: suggestionId },
            select: {
                id: true,
                name: true,
                description: true,
                categoryId: true,
                address: true,
                provinceId: true,
                cityId: true,
                phone: true,
                whatsapp: true,
                website: true,
                email: true,
                notes: true,
                status: true,
            },
        });

        if (!suggestion) {
            throw new NotFoundException('Sugerencia no encontrada');
        }

        if (suggestion.status !== 'PENDING') {
            throw new BadRequestException('Esta sugerencia ya fue revisada');
        }

        if (dto.status === 'APPROVED') {
            if (!suggestion.address || !suggestion.provinceId) {
                throw new BadRequestException(
                    'La sugerencia no tiene datos suficientes para crear la ficha publica',
                );
            }

            const createdBusiness = await this.createCatalogBusinessRecord(
                {
                    name: suggestion.name,
                    description: suggestion.description
                        ?? suggestion.notes
                        ?? 'Ficha creada desde una sugerencia moderada de la comunidad en AquiTa.do.',
                    address: suggestion.address,
                    provinceId: suggestion.provinceId,
                    cityId: suggestion.cityId ?? null,
                    phone: suggestion.phone ?? undefined,
                    whatsapp: suggestion.whatsapp ?? undefined,
                    website: suggestion.website,
                    email: suggestion.email,
                    categoryIds: suggestion.categoryId ? [suggestion.categoryId] : undefined,
                    publicStatus: dto.publicStatus ?? 'PUBLISHED',
                    catalogManagedByAdmin: true,
                    isClaimable: true,
                    ignorePotentialDuplicates: dto.ignorePotentialDuplicates,
                    source: 'USER_SUGGESTION',
                },
                adminUserId,
                'business-suggestion-approval',
            );

            await this.prisma.$transaction(async (tx) => {
                await tx.businessSuggestion.update({
                    where: { id: suggestionId },
                    data: {
                        status: 'APPROVED',
                        notes: reviewNotes ?? suggestion.notes,
                        reviewedByAdminId: adminUserId,
                        reviewedAt,
                        createdBusinessId: createdBusiness.id,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        organizationId: null,
                        actorUserId: adminUserId,
                        action: 'business_suggestion.reviewed',
                        targetType: 'business_suggestion',
                        targetId: suggestionId,
                        metadata: {
                            status: 'APPROVED',
                            createdBusinessId: createdBusiness.id,
                        } as Prisma.InputJsonValue,
                    },
                });
            });

            return {
                id: suggestionId,
                status: 'APPROVED' as const,
                createdBusinessId: createdBusiness.id,
                createdBusinessSlug: createdBusiness.slug,
            };
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.businessSuggestion.update({
                where: { id: suggestionId },
                data: {
                    status: 'REJECTED',
                    notes: reviewNotes ?? suggestion.notes,
                    reviewedByAdminId: adminUserId,
                    reviewedAt,
                },
            });

            await tx.auditLog.create({
                data: {
                    organizationId: null,
                    actorUserId: adminUserId,
                    action: 'business_suggestion.reviewed',
                    targetType: 'business_suggestion',
                    targetId: suggestionId,
                    metadata: {
                        status: 'REJECTED',
                    } as Prisma.InputJsonValue,
                },
            });
        });

        return {
            id: suggestionId,
            status: 'REJECTED' as const,
        };
    }

    async listDuplicateCases(query: BusinessDuplicateCaseQueryDto) {
        const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
        const where: Prisma.BusinessDuplicateCaseWhereInput = query.status
            ? { status: query.status }
            : {};

        const [items, summary] = await Promise.all([
            this.prisma.businessDuplicateCase.findMany({
                where,
                select: {
                    id: true,
                    clusterKey: true,
                    status: true,
                    businessIds: true,
                    reasons: true,
                    primaryBusinessId: true,
                    resolutionNotes: true,
                    resolutionMeta: true,
                    resolvedAt: true,
                    createdAt: true,
                    updatedAt: true,
                    primaryBusiness: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                        },
                    },
                    resolvedByAdmin: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
                orderBy: { resolvedAt: 'desc' },
                take: limit,
            }),
            this.prisma.businessDuplicateCase.groupBy({
                by: ['status'],
                _count: {
                    _all: true,
                },
            }),
        ]);

        return {
            data: items,
            summary: summary.reduce<Record<string, number>>((accumulator, item) => {
                accumulator[item.status] = item._count._all;
                return accumulator;
            }, {}),
        };
    }

    async resolveDuplicateCase(
        dto: ResolveBusinessDuplicateCaseDto,
        adminUserId: string,
    ) {
        const businessIds = [...new Set(dto.businessIds)];
        if (businessIds.length < 2) {
            throw new BadRequestException('Debes enviar al menos dos negocios para resolver el duplicado');
        }

        if (dto.status === 'MERGED' && (!dto.primaryBusinessId || !businessIds.includes(dto.primaryBusinessId))) {
            throw new BadRequestException('Debes elegir una ficha primaria valida para fusionar');
        }

        const businesses = await this.prisma.business.findMany({
            where: {
                id: { in: businessIds },
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                phone: true,
                whatsapp: true,
                website: true,
                email: true,
                address: true,
                latitude: true,
                longitude: true,
                cityId: true,
                sectorId: true,
                verified: true,
                publicStatus: true,
                claimStatus: true,
                source: true,
                ownerId: true,
                organizationId: true,
                createdAt: true,
            },
        });

        if (businesses.length !== businessIds.length) {
            throw new NotFoundException('No se encontraron todas las fichas seleccionadas');
        }

        const clusterKey = [...businessIds].sort().join(':');
        const reasons = (dto.reasons ?? [])
            .map((reason) => reason.trim())
            .filter((reason) => reason.length > 0);
        const resolutionNotes = normalizeOptionalText(dto.notes) ?? null;

        if (dto.status !== 'MERGED') {
            const duplicateCase = await this.prisma.$transaction(async (tx) => {
                const updatedCase = await tx.businessDuplicateCase.upsert({
                    where: { clusterKey },
                    update: {
                        status: dto.status,
                        businessIds,
                        reasons: reasons.length > 0 ? reasons : Prisma.JsonNull,
                        primaryBusinessId: null,
                        resolvedByAdminId: adminUserId,
                        resolutionNotes,
                        resolutionMeta: Prisma.JsonNull,
                        resolvedAt: new Date(),
                    },
                    create: {
                        clusterKey,
                        status: dto.status,
                        businessIds,
                        reasons: reasons.length > 0 ? reasons : Prisma.JsonNull,
                        resolvedByAdminId: adminUserId,
                        resolutionNotes,
                        resolvedAt: new Date(),
                    },
                    select: {
                        id: true,
                        clusterKey: true,
                        status: true,
                        businessIds: true,
                        reasons: true,
                        resolutionNotes: true,
                        resolvedAt: true,
                    },
                });

                await tx.auditLog.create({
                    data: {
                        organizationId: null,
                        actorUserId: adminUserId,
                        action: 'business_duplicate_case.resolved',
                        targetType: 'business_duplicate_case',
                        targetId: updatedCase.id,
                        metadata: {
                            status: dto.status,
                            businessIds,
                            reasons,
                        } as Prisma.InputJsonValue,
                    },
                });

                return updatedCase;
            });

            return duplicateCase;
        }

        const mergeResult = await this.prisma.$transaction(async (tx) =>
            this.mergeDuplicateBusinesses(tx, {
                adminUserId,
                clusterKey,
                businesses,
                primaryBusinessId: dto.primaryBusinessId!,
                reasons,
                resolutionNotes,
            }));

        this.publishBusinessChangedEvent(
            mergeResult.primaryBusiness.id,
            mergeResult.primaryBusiness.slug,
            'updated',
        );
        for (const archivedBusiness of mergeResult.archivedBusinesses) {
            this.publishBusinessChangedEvent(
                archivedBusiness.id,
                archivedBusiness.slug,
                'deleted',
            );
        }

        this.domainEventsService.publishBusinessDuplicatesMerged({
            duplicateCaseId: mergeResult.case.id,
            primaryBusinessId: mergeResult.primaryBusiness.id,
            primaryBusinessSlug: mergeResult.primaryBusiness.slug,
            archivedBusinessIds: mergeResult.archivedBusinesses.map((business) => business.id),
            resolvedByAdminId: adminUserId,
        });

        return mergeResult.case;
    }

    async createAdminCatalogBusiness(dto: CreateAdminCatalogBusinessDto, adminUserId: string) {
        return this.createCatalogBusinessRecord(
            {
                ...dto,
                source: dto.source ?? 'ADMIN',
            },
            adminUserId,
            'admin-catalog',
        );
    }

    private async createCatalogBusinessRecord(
        input: CatalogBusinessInput,
        adminUserId: string,
        auditSource: string,
    ) {
        assertCoordinatePair(input.latitude, input.longitude);
        const baseSlug = slugify(input.name, { lower: true, strict: true });
        if (!baseSlug) {
            throw new BadRequestException('El nombre del negocio no es valido para generar un slug');
        }

        const slug = await this.generateUniqueSlug(baseSlug);
        const categoryIds = input.categoryIds ? [...new Set(input.categoryIds)] : undefined;
        const featureIds = input.featureIds ? [...new Set(input.featureIds)] : undefined;
        const hours = normalizeBusinessHours(input.hours, normalizeOptionalText);
        const contactChannels = await this.normalizeBusinessContactChannels(input.phone, input.whatsapp);
        const website = normalizeOptionalText(input.website) ?? null;
        const email = normalizeOptionalEmail(input.email) ?? null;
        const instagramUrl = normalizeOptionalText(input.instagramUrl) ?? null;
        const facebookUrl = normalizeOptionalText(input.facebookUrl) ?? null;
        const tiktokUrl = normalizeOptionalText(input.tiktokUrl) ?? null;
        const isPublished = input.publicStatus === 'PUBLISHED' || !input.publicStatus;
        const publishedAt = isPublished ? new Date() : null;
        const coordinates = await this.resolveCoordinatesForBusiness({
            address: input.address,
            provinceId: input.provinceId,
            cityId: input.cityId ?? undefined,
            latitude: input.latitude,
            longitude: input.longitude,
        });

        await this.assertNoStrongDuplicateMatch(
            {
                name: input.name,
                address: input.address,
                phone: contactChannels.phone ?? null,
                whatsapp: contactChannels.whatsapp ?? null,
                website,
                instagramUrl,
                provinceId: input.provinceId,
                cityId: input.cityId ?? undefined,
                sectorId: input.sectorId ?? undefined,
                latitude: coordinates.latitude ?? null,
                longitude: coordinates.longitude ?? null,
                categoryIds,
            },
            input.ignorePotentialDuplicates,
            {
                source: auditSource,
                actorUserId: adminUserId,
            },
        );

        try {
            const createdBusiness = await this.prisma.$transaction(async (tx) => {
                await this.assertCityBelongsToProvince(tx, input.provinceId, input.cityId ?? undefined);
                await this.assertSectorBelongsToCity(tx, input.cityId ?? undefined, input.sectorId ?? undefined);

                const business = await tx.business.create({
                    data: {
                        id: randomUUID(),
                        name: input.name,
                        slug,
                        description: input.description,
                        phone: contactChannels.phone ?? null,
                        whatsapp: contactChannels.whatsapp ?? null,
                        website,
                        email,
                        instagramUrl,
                        facebookUrl,
                        tiktokUrl,
                        priceRange: input.priceRange ?? null,
                        address: input.address,
                        latitude: coordinates.latitude ?? null,
                        longitude: coordinates.longitude ?? null,
                        ownerId: null,
                        organizationId: null,
                        provinceId: input.provinceId,
                        cityId: input.cityId ?? null,
                        sectorId: input.sectorId ?? null,
                        publicStatus: input.publicStatus ?? 'PUBLISHED',
                        claimStatus: 'UNCLAIMED',
                        source: input.source,
                        publishedAt,
                        firstPublishedAt: publishedAt,
                        claimedAt: null,
                        claimedByUserId: null,
                        catalogManagedByAdmin: input.catalogManagedByAdmin ?? true,
                        isClaimable: input.isClaimable ?? true,
                        isPublished,
                        isSearchable: isPublished,
                        isDiscoverable: isPublished,
                        createdByUserId: adminUserId,
                        updatedByUserId: adminUserId,
                    },
                    select: {
                        id: true,
                        slug: true,
                        organizationId: true,
                        ownerId: true,
                    },
                });

                if (categoryIds?.length) {
                    await tx.businessCategory.createMany({
                        data: categoryIds.map((categoryId) => ({
                            businessId: business.id,
                            categoryId,
                        })),
                    });
                }

                if (featureIds?.length) {
                    await tx.businessFeature.createMany({
                        data: featureIds.map((featureId) => ({
                            businessId: business.id,
                            featureId,
                        })),
                    });
                }

                if (hours?.length) {
                    await tx.businessHour.createMany({
                        data: hours.map((entry) => ({
                            businessId: business.id,
                            dayOfWeek: entry.dayOfWeek,
                            opensAt: entry.opensAt,
                            closesAt: entry.closesAt,
                            closed: entry.closed,
                        })),
                    });
                }

                await tx.auditLog.create({
                    data: {
                        organizationId: null,
                        actorUserId: adminUserId,
                        action: 'business.catalog.created',
                        targetType: 'business',
                        targetId: business.id,
                        metadata: {
                            source: auditSource,
                            publicStatus: input.publicStatus ?? 'PUBLISHED',
                            catalogSource: input.source,
                        } as Prisma.InputJsonValue,
                    },
                });

                return business;
            });

            await this.syncBusinessLocation(
                this.prisma,
                createdBusiness.id,
                coordinates.latitude,
                coordinates.longitude,
            );
            this.publishBusinessChangedEvent(createdBusiness.id, createdBusiness.slug, 'created');
            this.domainEventsService.publishCatalogBusinessCreated({
                businessId: createdBusiness.id,
                slug: createdBusiness.slug,
                source: input.source,
                actorUserId: adminUserId,
            });

            const hydratedBusiness = await this.findBusinessByIdWithReviews(createdBusiness.id);
            if (!hydratedBusiness) {
                throw new NotFoundException('Negocio no encontrado');
            }

            return decorateBusinessProfile(hydratedBusiness as Record<string, any>);
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    private async mergeDuplicateBusinesses(
        tx: Prisma.TransactionClient,
        params: {
            adminUserId: string;
            clusterKey: string;
            businesses: Array<{
                id: string;
                name: string;
                slug: string;
                description: string;
                phone: string | null;
                whatsapp: string | null;
                website: string | null;
                email: string | null;
                address: string;
                latitude: number | null;
                longitude: number | null;
                cityId: string | null;
                sectorId: string | null;
                verified: boolean;
                publicStatus: string;
                claimStatus: string;
                source: string;
                ownerId: string | null;
                organizationId: string | null;
                createdAt: Date;
            }>;
            primaryBusinessId: string;
            reasons: string[];
            resolutionNotes: string | null;
        },
    ) {
        const primaryBusiness = params.businesses.find((business) => business.id === params.primaryBusinessId);
        if (!primaryBusiness) {
            throw new NotFoundException('La ficha primaria no existe');
        }

        const secondaryBusinesses = params.businesses.filter((business) => business.id !== params.primaryBusinessId);
        const secondaryIds = secondaryBusinesses.map((business) => business.id);

        const invalidSecondary = secondaryBusinesses.find((business) =>
            business.claimStatus !== 'UNCLAIMED' || business.ownerId || business.organizationId);
        if (invalidSecondary) {
            throw new BadRequestException(
                'Solo se pueden fusionar fichas de catalogo no reclamadas. Marca conflicto para casos con ownership activo.',
            );
        }

        const [
            activeOwnerships,
            activeBookings,
            activeConversations,
            activeWhatsAppConversations,
            activePromotions,
            activeTransactions,
            activeVerificationDocs,
            activeAdCampaigns,
            activeSalesLeads,
            primaryPendingClaims,
            secondaryPendingClaims,
        ] = await Promise.all([
            tx.businessOwnership.count({
                where: {
                    businessId: { in: [primaryBusiness.id, ...secondaryIds] },
                    isActive: true,
                },
            }),
            tx.booking.count({
                where: {
                    businessId: { in: secondaryIds },
                    deletedAt: null,
                },
            }),
            tx.conversation.count({
                where: {
                    businessId: { in: secondaryIds },
                    deletedAt: null,
                },
            }),
            tx.whatsAppConversation.count({
                where: {
                    businessId: { in: secondaryIds },
                },
            }),
            tx.promotion.count({
                where: {
                    businessId: { in: secondaryIds },
                    deletedAt: null,
                },
            }),
            tx.transaction.count({
                where: {
                    businessId: { in: secondaryIds },
                },
            }),
            tx.businessVerificationDocument.count({
                where: {
                    businessId: { in: secondaryIds },
                },
            }),
            tx.adCampaign.count({
                where: {
                    businessId: { in: secondaryIds },
                },
            }),
            tx.salesLead.count({
                where: {
                    businessId: { in: secondaryIds },
                    deletedAt: null,
                },
            }),
            tx.businessClaimRequest.count({
                where: {
                    businessId: primaryBusiness.id,
                    status: {
                        in: [...ACTIVE_CLAIM_REQUEST_STATUSES],
                    },
                },
            }),
            tx.businessClaimRequest.count({
                where: {
                    businessId: { in: secondaryIds },
                    status: {
                        in: [...ACTIVE_CLAIM_REQUEST_STATUSES],
                    },
                },
            }),
        ]);

        if (activeOwnerships > 0) {
            throw new BadRequestException(
                'Este cluster tiene ownership activo. Marca conflicto y resuelve el control del negocio antes de fusionar.',
            );
        }

        if (
            activeBookings > 0
            || activeConversations > 0
            || activeWhatsAppConversations > 0
            || activePromotions > 0
            || activeTransactions > 0
            || activeVerificationDocs > 0
            || activeAdCampaigns > 0
            || activeSalesLeads > 0
        ) {
            throw new BadRequestException(
                'Este cluster tiene datos operativos o tenant activos. Usa "marcar conflicto" en lugar de fusionarlo.',
            );
        }

        if (primaryPendingClaims > 0 && secondaryPendingClaims > 0) {
            throw new BadRequestException(
                'No se puede fusionar mientras existan claims pendientes en ambas fichas. Resuelve primero el conflicto de ownership.',
            );
        }

        const transferred = {
            categories: 0,
            features: 0,
            hours: 0,
            images: 0,
            analyticsRows: 0,
            growthEvents: 0,
            checkIns: 0,
            claimRequests: 0,
            reviews: 0,
            favorites: 0,
            listItems: 0,
            notificationJobs: 0,
        };

        const secondaryCategories = await tx.businessCategory.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
            select: {
                categoryId: true,
            },
        });
        if (secondaryCategories.length > 0) {
            const result = await tx.businessCategory.createMany({
                data: secondaryCategories.map((entry) => ({
                    businessId: primaryBusiness.id,
                    categoryId: entry.categoryId,
                })),
                skipDuplicates: true,
            });
            transferred.categories = result.count;
            await tx.businessCategory.deleteMany({
                where: {
                    businessId: { in: secondaryIds },
                },
            });
        }

        const secondaryFeatures = await tx.businessFeature.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
            select: {
                featureId: true,
            },
        });
        if (secondaryFeatures.length > 0) {
            const result = await tx.businessFeature.createMany({
                data: secondaryFeatures.map((entry) => ({
                    businessId: primaryBusiness.id,
                    featureId: entry.featureId,
                })),
                skipDuplicates: true,
            });
            transferred.features = result.count;
            await tx.businessFeature.deleteMany({
                where: {
                    businessId: { in: secondaryIds },
                },
            });
        }

        const existingPrimaryDays = new Set(
            (await tx.businessHour.findMany({
                where: { businessId: primaryBusiness.id },
                select: { dayOfWeek: true },
            })).map((entry) => entry.dayOfWeek),
        );
        const secondaryHours = await tx.businessHour.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
            orderBy: [
                { dayOfWeek: 'asc' },
                { id: 'asc' },
            ],
        });
        const hoursToCreate = secondaryHours.filter((entry) => {
            if (existingPrimaryDays.has(entry.dayOfWeek)) {
                return false;
            }
            existingPrimaryDays.add(entry.dayOfWeek);
            return true;
        });
        if (hoursToCreate.length > 0) {
            const result = await tx.businessHour.createMany({
                data: hoursToCreate.map((entry) => ({
                    businessId: primaryBusiness.id,
                    dayOfWeek: entry.dayOfWeek,
                    opensAt: entry.opensAt,
                    closesAt: entry.closesAt,
                    closed: entry.closed,
                })),
            });
            transferred.hours = result.count;
        }
        if (secondaryHours.length > 0) {
            await tx.businessHour.deleteMany({
                where: {
                    businessId: { in: secondaryIds },
                },
            });
        }

        const primaryReviewUserIds = new Set(
            (await tx.review.findMany({
                where: { businessId: primaryBusiness.id },
                select: { userId: true },
            })).map((entry) => entry.userId),
        );
        const secondaryReviews = await tx.review.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
            select: {
                id: true,
                userId: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        for (const review of secondaryReviews) {
            if (primaryReviewUserIds.has(review.userId)) {
                await tx.review.delete({ where: { id: review.id } });
                continue;
            }
            await tx.review.update({
                where: { id: review.id },
                data: { businessId: primaryBusiness.id },
            });
            primaryReviewUserIds.add(review.userId);
            transferred.reviews += 1;
        }

        const primaryFavoriteUserIds = new Set(
            (await tx.userFavoriteBusiness.findMany({
                where: { businessId: primaryBusiness.id },
                select: { userId: true },
            })).map((entry) => entry.userId),
        );
        const secondaryFavorites = await tx.userFavoriteBusiness.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
            select: { userId: true, businessId: true },
        });
        for (const favorite of secondaryFavorites) {
            if (primaryFavoriteUserIds.has(favorite.userId)) {
                await tx.userFavoriteBusiness.delete({
                    where: {
                        userId_businessId: {
                            userId: favorite.userId,
                            businessId: favorite.businessId,
                        },
                    },
                });
                continue;
            }
            await tx.userFavoriteBusiness.update({
                where: {
                    userId_businessId: {
                        userId: favorite.userId,
                        businessId: favorite.businessId,
                    },
                },
                data: {
                    businessId: primaryBusiness.id,
                },
            });
            primaryFavoriteUserIds.add(favorite.userId);
            transferred.favorites += 1;
        }

        const primaryListIds = new Set(
            (await tx.userBusinessListItem.findMany({
                where: { businessId: primaryBusiness.id },
                select: { listId: true },
            })).map((entry) => entry.listId),
        );
        const secondaryListItems = await tx.userBusinessListItem.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
            select: { listId: true, businessId: true },
        });
        for (const listItem of secondaryListItems) {
            if (primaryListIds.has(listItem.listId)) {
                await tx.userBusinessListItem.delete({
                    where: {
                        listId_businessId: {
                            listId: listItem.listId,
                            businessId: listItem.businessId,
                        },
                    },
                });
                continue;
            }
            await tx.userBusinessListItem.update({
                where: {
                    listId_businessId: {
                        listId: listItem.listId,
                        businessId: listItem.businessId,
                    },
                },
                data: {
                    businessId: primaryBusiness.id,
                },
            });
            primaryListIds.add(listItem.listId);
            transferred.listItems += 1;
        }

        const secondaryAnalytics = await tx.businessAnalytics.findMany({
            where: {
                businessId: { in: secondaryIds },
            },
        });
        for (const analyticsRow of secondaryAnalytics) {
            await tx.businessAnalytics.upsert({
                where: {
                    businessId_date: {
                        businessId: primaryBusiness.id,
                        date: analyticsRow.date,
                    },
                },
                update: {
                    views: { increment: analyticsRow.views },
                    uniqueVisitors: { increment: analyticsRow.uniqueVisitors },
                    clicks: { increment: analyticsRow.clicks },
                    conversions: { increment: analyticsRow.conversions },
                    reservationRequests: { increment: analyticsRow.reservationRequests },
                    grossRevenue: { increment: analyticsRow.grossRevenue },
                },
                create: {
                    businessId: primaryBusiness.id,
                    date: analyticsRow.date,
                    views: analyticsRow.views,
                    uniqueVisitors: analyticsRow.uniqueVisitors,
                    clicks: analyticsRow.clicks,
                    conversions: analyticsRow.conversions,
                    reservationRequests: analyticsRow.reservationRequests,
                    grossRevenue: analyticsRow.grossRevenue,
                },
            });
            transferred.analyticsRows += 1;
        }
        if (secondaryAnalytics.length > 0) {
            await tx.businessAnalytics.deleteMany({
                where: {
                    businessId: { in: secondaryIds },
                },
            });
        }

        const secondaryImagesResult = await tx.businessImage.updateMany({
            where: {
                businessId: { in: secondaryIds },
            },
            data: {
                businessId: primaryBusiness.id,
            },
        });
        transferred.images = secondaryImagesResult.count;

        const secondaryGrowthEventsResult = await tx.growthEvent.updateMany({
            where: {
                businessId: { in: secondaryIds },
            },
            data: {
                businessId: primaryBusiness.id,
            },
        });
        transferred.growthEvents = secondaryGrowthEventsResult.count;

        const secondaryCheckInsResult = await tx.checkIn.updateMany({
            where: {
                businessId: { in: secondaryIds },
            },
            data: {
                businessId: primaryBusiness.id,
            },
        });
        transferred.checkIns = secondaryCheckInsResult.count;

        const secondaryClaimRequestsResult = await tx.businessClaimRequest.updateMany({
            where: {
                businessId: { in: secondaryIds },
            },
            data: {
                businessId: primaryBusiness.id,
            },
        });
        transferred.claimRequests = secondaryClaimRequestsResult.count;

        const secondaryNotificationJobsResult = await tx.notificationJob.updateMany({
            where: {
                businessId: { in: secondaryIds },
            },
            data: {
                businessId: primaryBusiness.id,
            },
        });
        transferred.notificationJobs = secondaryNotificationJobsResult.count;

        const primaryImages = await tx.businessImage.findMany({
            where: { businessId: primaryBusiness.id },
            select: { id: true, isCover: true, sortOrder: true },
            orderBy: [
                { isCover: 'desc' },
                { sortOrder: 'asc' },
                { id: 'asc' },
            ],
        });
        if (primaryImages.length > 0) {
            const coverId = primaryImages[0].id;
            await tx.businessImage.updateMany({
                where: {
                    businessId: primaryBusiness.id,
                    id: { not: coverId },
                },
                data: {
                    isCover: false,
                },
            });
            await tx.businessImage.update({
                where: { id: coverId },
                data: {
                    isCover: true,
                },
            });
        }

        const patchData: Prisma.BusinessUpdateInput = {};
        const longerSecondaryDescription = secondaryBusinesses
            .map((business) => business.description?.trim())
            .filter((value): value is string => Boolean(value))
            .sort((left, right) => right.length - left.length)[0];
        if ((!primaryBusiness.description || primaryBusiness.description.trim().length < 50) && longerSecondaryDescription) {
            patchData.description = longerSecondaryDescription;
        }
        if (!primaryBusiness.phone) {
            patchData.phone = secondaryBusinesses.find((business) => business.phone)?.phone ?? null;
        }
        if (!primaryBusiness.whatsapp) {
            patchData.whatsapp = secondaryBusinesses.find((business) => business.whatsapp)?.whatsapp ?? null;
        }
        if (!primaryBusiness.website) {
            patchData.website = secondaryBusinesses.find((business) => business.website)?.website ?? null;
        }
        if (!primaryBusiness.email) {
            patchData.email = secondaryBusinesses.find((business) => business.email)?.email ?? null;
        }
        if (
            (typeof primaryBusiness.latitude !== 'number' || typeof primaryBusiness.longitude !== 'number')
            && secondaryBusinesses.find((business) =>
                typeof business.latitude === 'number' && typeof business.longitude === 'number')
        ) {
            const geoSource = secondaryBusinesses.find((business) =>
                typeof business.latitude === 'number' && typeof business.longitude === 'number');
            patchData.latitude = geoSource?.latitude ?? null;
            patchData.longitude = geoSource?.longitude ?? null;
        }
        if (!primaryBusiness.cityId) {
            patchData.city = secondaryBusinesses.find((business) => business.cityId)
                ? { connect: { id: secondaryBusinesses.find((business) => business.cityId)!.cityId! } }
                : undefined;
        }
        if (!primaryBusiness.sectorId) {
            patchData.sector = secondaryBusinesses.find((business) => business.sectorId)
                ? { connect: { id: secondaryBusinesses.find((business) => business.sectorId)!.sectorId! } }
                : undefined;
        }
        if (primaryBusiness.publicStatus !== 'PUBLISHED' && secondaryBusinesses.some((business) => business.publicStatus === 'PUBLISHED')) {
            patchData.publicStatus = 'PUBLISHED';
            patchData.publishedAt = new Date();
        }
        if (Object.keys(patchData).length > 0) {
            await tx.business.update({
                where: { id: primaryBusiness.id },
                data: patchData,
            });
        }

        const archivedAt = new Date();
        await tx.business.updateMany({
            where: {
                id: { in: secondaryIds },
            },
            data: {
                deletedAt: archivedAt,
                publicStatus: 'ARCHIVED',
                claimStatus: 'UNCLAIMED',
                claimedAt: null,
                claimedByUserId: null,
                ownerId: null,
                organizationId: null,
                isClaimable: false,
            },
        });

        const duplicateCase = await tx.businessDuplicateCase.upsert({
            where: { clusterKey: params.clusterKey },
            update: {
                status: 'MERGED',
                businessIds: params.businesses.map((business) => business.id),
                reasons: params.reasons.length > 0 ? params.reasons : Prisma.JsonNull,
                primaryBusinessId: primaryBusiness.id,
                resolvedByAdminId: params.adminUserId,
                resolutionNotes: params.resolutionNotes,
                resolutionMeta: {
                    mergedIntoBusinessId: primaryBusiness.id,
                    archivedBusinessIds: secondaryIds,
                    transferred,
                } as Prisma.InputJsonValue,
                resolvedAt: archivedAt,
            },
            create: {
                clusterKey: params.clusterKey,
                status: 'MERGED',
                businessIds: params.businesses.map((business) => business.id),
                reasons: params.reasons.length > 0 ? params.reasons : Prisma.JsonNull,
                primaryBusinessId: primaryBusiness.id,
                resolvedByAdminId: params.adminUserId,
                resolutionNotes: params.resolutionNotes,
                resolutionMeta: {
                    mergedIntoBusinessId: primaryBusiness.id,
                    archivedBusinessIds: secondaryIds,
                    transferred,
                } as Prisma.InputJsonValue,
                resolvedAt: archivedAt,
            },
            select: {
                id: true,
                clusterKey: true,
                status: true,
                businessIds: true,
                reasons: true,
                primaryBusinessId: true,
                resolutionNotes: true,
                resolutionMeta: true,
                resolvedAt: true,
            },
        });

        await tx.auditLog.create({
            data: {
                organizationId: null,
                actorUserId: params.adminUserId,
                action: 'business_duplicate_case.resolved',
                targetType: 'business_duplicate_case',
                targetId: duplicateCase.id,
                metadata: {
                    status: 'MERGED',
                    clusterKey: params.clusterKey,
                    primaryBusinessId: primaryBusiness.id,
                    archivedBusinessIds: secondaryIds,
                    transferred,
                } as Prisma.InputJsonValue,
            },
        });

        return {
            case: duplicateCase,
            primaryBusiness: {
                id: primaryBusiness.id,
                slug: primaryBusiness.slug,
            },
            archivedBusinesses: secondaryBusinesses.map((business) => ({
                id: business.id,
                slug: business.slug,
            })),
        };
    }

    async create(
        dto: CreateBusinessDto,
        userId: string,
        _userRole: string,
        organizationId?: string,
        organizationRole?: OrganizationRole,
    ) {
        assertCoordinatePair(dto.latitude, dto.longitude);
        const baseSlug = slugify(dto.name, { lower: true, strict: true });
        if (!baseSlug) {
            throw new BadRequestException('El nombre del negocio no es valido para generar un slug');
        }

        const slug = await this.generateUniqueSlug(baseSlug);
        const categoryIds = dto.categoryIds ? [...new Set(dto.categoryIds)] : undefined;
        const featureIds = dto.featureIds ? [...new Set(dto.featureIds)] : undefined;
        const hours = normalizeBusinessHours(dto.hours, normalizeOptionalText);
        const contactChannels = await this.normalizeBusinessContactChannels(dto.phone, dto.whatsapp);
        const website = normalizeOptionalText(dto.website) ?? null;
        const email = normalizeOptionalEmail(dto.email) ?? null;
        const instagramUrl = normalizeOptionalText(dto.instagramUrl) ?? null;
        const facebookUrl = normalizeOptionalText(dto.facebookUrl) ?? null;
        const tiktokUrl = normalizeOptionalText(dto.tiktokUrl) ?? null;
        const businessId = randomUUID();
        const coordinates = await this.resolveCoordinatesForBusiness({
            address: dto.address,
            provinceId: dto.provinceId,
            cityId: dto.cityId,
            latitude: dto.latitude,
            longitude: dto.longitude,
        });

        await this.assertNoStrongDuplicateMatch(
            {
                name: dto.name,
                address: dto.address,
                phone: contactChannels.phone ?? null,
                whatsapp: contactChannels.whatsapp ?? null,
                website,
                instagramUrl,
                provinceId: dto.provinceId,
                cityId: dto.cityId,
                sectorId: dto.sectorId,
                latitude: coordinates.latitude ?? null,
                longitude: coordinates.longitude ?? null,
                categoryIds,
            },
            dto.ignorePotentialDuplicates,
            {
                source: 'owner-create',
                actorUserId: userId,
            },
        );

        try {
            const createdBusiness = await this.prisma.$transaction(async (tx) => {
                await this.assertCityBelongsToProvince(tx, dto.provinceId, dto.cityId);
                await this.assertSectorBelongsToCity(tx, dto.cityId, dto.sectorId);
                const effectiveOrganizationId = organizationId ?? await this.ensureOwnerOrganization(tx, userId);
                const publishedAt = new Date();
                const claimedAt = new Date();

                if (organizationId) {
                    if (!organizationRole) {
                        throw new ForbiddenException('No tienes permisos para crear negocios en esta organización');
                    }

                    if (organizationRole === 'STAFF') {
                        throw new ForbiddenException('El rol STAFF no puede crear negocios');
                    }
                }

                await this.assertOrganizationCanCreateBusiness(tx, effectiveOrganizationId);

                const business = await tx.business.create({
                    data: {
                        id: businessId,
                        name: dto.name,
                        slug,
                        description: dto.description,
                        phone: contactChannels.phone ?? null,
                        whatsapp: contactChannels.whatsapp ?? null,
                        website,
                        email,
                        instagramUrl,
                        facebookUrl,
                        tiktokUrl,
                        priceRange: dto.priceRange ?? null,
                        address: dto.address,
                        latitude: coordinates.latitude ?? null,
                        longitude: coordinates.longitude ?? null,
                        ownerId: userId,
                        organizationId: effectiveOrganizationId,
                        provinceId: dto.provinceId,
                        cityId: dto.cityId ?? null,
                        sectorId: dto.sectorId ?? null,
                        publicStatus: 'PUBLISHED',
                        claimStatus: 'CLAIMED',
                        source: 'OWNER',
                        publishedAt,
                        firstPublishedAt: publishedAt,
                        claimedAt,
                        claimedByUserId: userId,
                        catalogManagedByAdmin: false,
                        isClaimable: true,
                        isPublished: true,
                        isSearchable: true,
                        isDiscoverable: true,
                        createdByUserId: userId,
                        updatedByUserId: userId,
                    },
                    select: {
                        id: true,
                        slug: true,
                        organizationId: true,
                        ownerId: true,
                    },
                });

                await tx.businessOwnership.create({
                    data: {
                        businessId: business.id,
                        organizationId: effectiveOrganizationId,
                        grantedByUserId: userId,
                        role: 'PRIMARY_OWNER',
                        isActive: true,
                        grantedAt: claimedAt,
                    },
                    select: { id: true },
                });

                if (categoryIds?.length) {
                    await tx.businessCategory.createMany({
                        data: categoryIds.map((categoryId) => ({
                            businessId: business.id,
                            categoryId,
                        })),
                    });
                }

                if (featureIds?.length) {
                    await tx.businessFeature.createMany({
                        data: featureIds.map((featureId) => ({
                            businessId: business.id,
                            featureId,
                        })),
                    });
                }

                if (hours?.length) {
                    await tx.businessHour.createMany({
                        data: hours.map((entry) => ({
                            businessId: business.id,
                            dayOfWeek: entry.dayOfWeek,
                            opensAt: entry.opensAt,
                            closesAt: entry.closesAt,
                            closed: entry.closed,
                        })),
                    });
                }

                // Only promote regular users; never downgrade admin users.
                await tx.user.updateMany({
                    where: { id: userId, role: 'USER' },
                    data: { role: 'BUSINESS_OWNER' },
                });

                return business;
            });

            await this.syncBusinessLocation(this.prisma, createdBusiness.id, coordinates.latitude, coordinates.longitude);

            this.publishBusinessChangedEvent(createdBusiness.id, createdBusiness.slug, 'created');
            if (createdBusiness.organizationId && createdBusiness.ownerId) {
                this.domainEventsService.publishBusinessLinkedToOrganization({
                    businessId: createdBusiness.id,
                    businessSlug: createdBusiness.slug,
                    organizationId: createdBusiness.organizationId,
                    ownerUserId: createdBusiness.ownerId,
                    linkedByUserId: userId,
                });
            }

            const hydratedBusiness = await this.findBusinessByIdWithReviews(createdBusiness.id);
            if (!hydratedBusiness) {
                throw new NotFoundException('Negocio no encontrado');
            }

            return decorateBusinessProfile(hydratedBusiness as Record<string, any>);
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async update(
        id: string,
        dto: UpdateBusinessDto,
        _userId: string,
        _userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole,
    ) {
        assertCoordinatePair(dto.latitude, dto.longitude);
        const categoryIds = dto.categoryIds ? [...new Set(dto.categoryIds)] : undefined;
        const featureIds = dto.featureIds ? [...new Set(dto.featureIds)] : undefined;
        const hours = normalizeBusinessHours(dto.hours, normalizeOptionalText);
        const contactChannels = await this.normalizeBusinessContactChannels(dto.phone, dto.whatsapp);
        const normalizedWebsite = normalizeOptionalText(dto.website);
        const normalizedEmail = normalizeOptionalEmail(dto.email);
        const normalizedInstagramUrl = normalizeOptionalText(dto.instagramUrl);
        const normalizedFacebookUrl = normalizeOptionalText(dto.facebookUrl);
        const normalizedTiktokUrl = normalizeOptionalText(dto.tiktokUrl);
        const nextSectorIdForUpdate = dto.sectorId !== undefined
            ? dto.sectorId
            : dto.cityId !== undefined
                ? null
                : undefined;

        const existingBusiness = await this.prisma.business.findUnique({
            where: { id },
            select: {
                id: true,
                provinceId: true,
                cityId: true,
                sectorId: true,
                address: true,
                latitude: true,
                longitude: true,
            },
        });
        const targetAddress = dto.address ?? existingBusiness?.address ?? '';
        const targetProvinceId = dto.provinceId ?? existingBusiness?.provinceId;
        const targetCityId = dto.cityId ?? existingBusiness?.cityId ?? undefined;
        const shouldAttemptGeocoding = !!existingBusiness
            && dto.latitude === undefined
            && dto.longitude === undefined
            && (
                existingBusiness.latitude === null
                || existingBusiness.longitude === null
                || dto.address !== undefined
                || dto.provinceId !== undefined
                || dto.cityId !== undefined
            );

        const geocodedCoordinates = shouldAttemptGeocoding && targetProvinceId
            ? await this.resolveCoordinatesForBusiness({
                address: targetAddress,
                provinceId: targetProvinceId,
                cityId: targetCityId,
                latitude: undefined,
                longitude: undefined,
            })
            : { latitude: undefined, longitude: undefined };

        try {
            const updatedBusiness = await this.prisma.$transaction(async (tx) => {
                const business = await tx.business.findUnique({
                    where: { id },
                    select: {
                        id: true,
                        ownerId: true,
                        organizationId: true,
                        provinceId: true,
                        cityId: true,
                        sectorId: true,
                        latitude: true,
                        longitude: true,
                    },
                });

                if (!business) {
                    throw new NotFoundException('Negocio no encontrado');
                }

                if (business.organizationId !== organizationId) {
                    throw new NotFoundException('Negocio no encontrado');
                }

                if (organizationRole === 'STAFF') {
                    throw new ForbiddenException('No tienes permisos para editar este negocio');
                }

                const normalizedTargetProvinceId = dto.provinceId ?? business.provinceId;
                const normalizedTargetCityId = dto.cityId ?? business.cityId ?? undefined;
                const normalizedTargetSectorId = dto.sectorId !== undefined
                    ? dto.sectorId
                    : dto.cityId !== undefined
                        ? undefined
                        : business.sectorId ?? undefined;
                await this.assertCityBelongsToProvince(tx, normalizedTargetProvinceId, normalizedTargetCityId);
                await this.assertSectorBelongsToCity(tx, normalizedTargetCityId, normalizedTargetSectorId);

                if (categoryIds) {
                    await tx.businessCategory.deleteMany({ where: { businessId: id } });
                }

                if (featureIds) {
                    await tx.businessFeature.deleteMany({ where: { businessId: id } });
                }

                if (hours) {
                    await tx.businessHour.deleteMany({ where: { businessId: id } });
                }

                const updatedBusiness = await tx.business.update({
                    where: { id },
                    data: {
                        name: dto.name,
                        description: dto.description,
                        phone: contactChannels.phone,
                        whatsapp: contactChannels.whatsapp,
                        website: normalizedWebsite,
                        email: normalizedEmail,
                        instagramUrl: normalizedInstagramUrl,
                        facebookUrl: normalizedFacebookUrl,
                        tiktokUrl: normalizedTiktokUrl,
                        priceRange: dto.priceRange,
                        address: dto.address,
                        provinceId: dto.provinceId,
                        cityId: dto.cityId,
                        sectorId: nextSectorIdForUpdate,
                        latitude: dto.latitude ?? geocodedCoordinates.latitude,
                        longitude: dto.longitude ?? geocodedCoordinates.longitude,
                        categories: categoryIds
                            ? {
                                create: categoryIds.map((categoryId) => ({
                                    categoryId,
                                })),
                            }
                            : undefined,
                        features: featureIds
                            ? {
                                create: featureIds.map((featureId) => ({
                                    featureId,
                                })),
                            }
                            : undefined,
                        hours: hours
                            ? {
                                create: hours.map((entry) => ({
                                    dayOfWeek: entry.dayOfWeek,
                                    opensAt: entry.opensAt,
                                    closesAt: entry.closesAt,
                                    closed: entry.closed,
                                })),
                            }
                            : undefined,
                    },
                    select: {
                        id: true,
                        slug: true,
                        latitude: true,
                        longitude: true,
                    },
                });

                const nextLatitude = updatedBusiness.latitude ?? business.latitude ?? undefined;
                const nextLongitude = updatedBusiness.longitude ?? business.longitude ?? undefined;
                return {
                    ...updatedBusiness,
                    nextLatitude,
                    nextLongitude,
                };
            });

            await this.syncBusinessLocation(
                this.prisma,
                id,
                updatedBusiness.nextLatitude,
                updatedBusiness.nextLongitude,
            );

            this.publishBusinessChangedEvent(updatedBusiness.id, updatedBusiness.slug, 'updated');

            const hydratedBusiness = await this.findBusinessByIdWithReviews(updatedBusiness.id);
            if (!hydratedBusiness) {
                throw new NotFoundException('Negocio no encontrado');
            }

            return decorateBusinessProfile(hydratedBusiness as Record<string, any>);
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async delete(
        id: string,
        deleteReason: string,
        userId: string,
        userRole: string,
        organizationId?: string,
        organizationRole?: OrganizationRole,
    ) {
        const business = await this.prisma.business.findUnique({
            where: { id },
            select: {
                id: true,
                slug: true,
                organizationId: true,
                images: {
                    select: { url: true },
                },
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (userRole !== 'ADMIN') {
            if (!organizationId) {
                throw new ForbiddenException('Debes seleccionar una organización activa');
            }

            if (business.organizationId !== organizationId) {
                throw new NotFoundException('Negocio no encontrado');
            }

            if (!organizationRole || organizationRole === 'STAFF') {
                throw new ForbiddenException('No tienes permisos para eliminar este negocio');
            }
        }

        const imageUrls = business.images.map((image) => image.url);
        const now = new Date();
        const normalizedReason = typeof deleteReason === 'string' ? deleteReason.trim() : '';

        if (normalizedReason.length < 15) {
            throw new BadRequestException('El motivo de eliminacion debe tener al menos 15 caracteres');
        }

        if (normalizedReason.length > 500) {
            throw new BadRequestException('El motivo de eliminacion no puede superar 500 caracteres');
        }

        try {
            await this.prisma.$transaction(async (tx) => {
                await tx.business.update({
                    where: { id },
                    data: {
                        deletedAt: now,
                        verified: false,
                        verificationStatus: 'SUSPENDED',
                        publicStatus: 'ARCHIVED',
                    },
                    select: {
                        id: true,
                    },
                });
            });
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }

        await this.syncBusinessLocation(this.prisma, id, undefined, undefined);

        const cleanupTasks: Array<Promise<unknown>> = [
            this.prisma.businessImage.deleteMany({
                where: { businessId: id },
            }).catch((error) => {
                this.logger.warn(
                    `Could not delete business image rows for "${id}" (${error instanceof Error ? error.message : String(error)})`,
                );
            }),
            this.prisma.promotion.updateMany({
                where: {
                    businessId: id,
                    deletedAt: null,
                },
                data: {
                    deletedAt: now,
                    isActive: false,
                },
            }).catch((error) => {
                this.logger.warn(
                    `Could not soft-delete promotions for "${id}" (${error instanceof Error ? error.message : String(error)})`,
                );
            }),
            this.prisma.booking.updateMany({
                where: {
                    businessId: id,
                    deletedAt: null,
                },
                data: {
                    deletedAt: now,
                },
            }).catch((error) => {
                this.logger.warn(
                    `Could not soft-delete bookings for "${id}" (${error instanceof Error ? error.message : String(error)})`,
                );
            }),
            this.prisma.conversation.updateMany({
                where: {
                    businessId: id,
                    deletedAt: null,
                },
                data: {
                    deletedAt: now,
                },
            }).catch((error) => {
                this.logger.warn(
                    `Could not soft-delete conversations for "${id}" (${error instanceof Error ? error.message : String(error)})`,
                );
            }),
            this.prisma.auditLog.create({
                data: {
                    organizationId: business.organizationId,
                    actorUserId: userId,
                    action: 'business.deleted',
                    targetType: 'business',
                    targetId: id,
                    metadata: {
                        reason: normalizedReason,
                        actorRole: userRole,
                        deletedAt: now.toISOString(),
                    } as Prisma.InputJsonValue,
                },
            }).catch((error) => {
                this.logger.warn(
                    `Could not persist delete audit log for "${id}" (${error instanceof Error ? error.message : String(error)})`,
                );
            }),
        ];

        await Promise.all(cleanupTasks);

        try {
            this.publishBusinessChangedEvent(id, business.slug, 'deleted');
        } catch (error) {
            this.logger.warn(
                `Could not publish business deleted event for "${id}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }

        try {
            await this.deleteBusinessImageFiles(imageUrls);
        } catch (error) {
            this.logger.warn(
                `Could not remove business image files for "${id}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }

        return { message: 'Negocio eliminado exitosamente' };
    }

    async findNearby(query: NearbyQueryDto) {
        return this.searchService.findNearbyBusinesses({
            lat: query.lat,
            lng: query.lng,
            radiusKm: query.radius,
            limit: query.limit,
            categoryId: query.categoryId,
        });
    }

    async verify(id: string) {
        try {
            const business = await this.prisma.business.update({
                where: { id },
                data: {
                    verified: true,
                    verifiedAt: new Date(),
                    verificationStatus: 'VERIFIED',
                    verificationReviewedAt: new Date(),
                },
                select: {
                    id: true,
                    slug: true,
                },
            });

            await this.reputationService.recalculateBusinessReputation(id);
            this.publishBusinessChangedEvent(id, business.slug, 'verified');

            const hydratedBusiness = await this.findBusinessByIdWithReviews(id);
            if (!hydratedBusiness) {
                throw new NotFoundException('Negocio no encontrado');
            }

            return decorateBusinessProfile(hydratedBusiness as Record<string, any>);
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    private async normalizeBusinessContactChannels(
        phone?: string,
        whatsapp?: string,
    ): Promise<{ phone?: string | null; whatsapp?: string | null }> {
        const result: { phone?: string | null; whatsapp?: string | null } = {};

        if (phone !== undefined) {
            const trimmedPhone = phone.trim();
            if (trimmedPhone.length === 0) {
                result.phone = null;
            } else {
                const validation = await this.integrationsService.validateDominicanPhone(trimmedPhone);
                if (!validation.isValid || !validation.normalizedPhone) {
                    throw new BadRequestException('El teléfono del negocio no es válido para República Dominicana');
                }
                result.phone = validation.normalizedPhone;
            }
        }

        if (whatsapp !== undefined) {
            const trimmedWhatsApp = whatsapp.trim();
            if (trimmedWhatsApp.length === 0) {
                result.whatsapp = null;
            } else {
                const validation = await this.integrationsService.validateDominicanPhone(trimmedWhatsApp);
                if (!validation.isValid || !validation.normalizedPhone) {
                    throw new BadRequestException('El WhatsApp del negocio no es válido para República Dominicana');
                }
                result.whatsapp = validation.normalizedPhone;
            }
        }

        return result;
    }

    private async resolveCoordinatesForBusiness(input: {
        address: string;
        provinceId: string;
        cityId?: string;
        latitude?: number;
        longitude?: number;
    }): Promise<{ latitude?: number; longitude?: number }> {
        assertCoordinatePair(input.latitude, input.longitude);

        if (input.latitude !== undefined && input.longitude !== undefined) {
            return {
                latitude: input.latitude,
                longitude: input.longitude,
            };
        }

        const normalizedAddress = input.address.trim();
        if (!normalizedAddress) {
            return { latitude: undefined, longitude: undefined };
        }

        const locationNames = await this.resolveProvinceAndCityNames(input.provinceId, input.cityId);
        if (!locationNames.provinceName) {
            return { latitude: undefined, longitude: undefined };
        }

        const geocoded = await this.integrationsService.geocodeDominicanAddress({
            address: normalizedAddress,
            province: locationNames.provinceName,
            city: locationNames.cityName,
        });

        if (!geocoded) {
            return { latitude: undefined, longitude: undefined };
        }

        return {
            latitude: geocoded.latitude,
            longitude: geocoded.longitude,
        };
    }

    async getCatalogQuality(limit = 25) {
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const now = new Date();
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const businesses = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
            },
            select: catalogQualityBusinessSelect,
            orderBy: { createdAt: 'desc' },
            take: 500,
        });

        const decoratedBusinesses = decorateBusinessProfiles(businesses as Record<string, any>[]);
        const incompleteBusinesses = decoratedBusinesses
            .filter((business) => business.profileCompletenessScore < 80)
            .sort((left, right) => left.profileCompletenessScore - right.profileCompletenessScore)
            .slice(0, safeLimit);
        const allDuplicateCandidates = findDuplicateCandidates(decoratedBusinesses);
        const duplicateCandidates = allDuplicateCandidates.slice(0, safeLimit);
        const totalBusinesses = decoratedBusinesses.length;
        const publishedBusinesses = decoratedBusinesses.filter((business) => business.publicStatus === 'PUBLISHED').length;
        const incompleteCount = decoratedBusinesses.filter((business) => business.profileCompletenessScore < 80).length;
        const duplicateClusterCount = allDuplicateCandidates.length;
        const duplicateInvolvedBusinessCount = new Set(
            allDuplicateCandidates.flatMap((cluster) => cluster.businesses.map((business) => String(business.id))),
        ).size;
        const missingSector = decoratedBusinesses.filter((business) => !business.sector).length;
        const missingCoordinates = decoratedBusinesses.filter((business) =>
            typeof business.latitude !== 'number' || typeof business.longitude !== 'number').length;
        const unclaimedBusinesses = decoratedBusinesses.filter((business) => business.claimStatus === 'UNCLAIMED').length;
        const pendingClaims = decoratedBusinesses.filter((business) => business.claimStatus === 'PENDING_CLAIM').length;
        const claimedBusinesses = decoratedBusinesses.filter((business) => business.claimStatus === 'CLAIMED').length;
        const weeklyCatalogGrowth = decoratedBusinesses.filter((business) => business.createdAt >= last7Days).length;

        const [
            suggestionSummaryRows,
            duplicateCaseSummaryRows,
            duplicateCaseTimings,
            claimRequestSummaryRows,
            reviewedClaimRequests,
            claimCtaClicksLast30Days,
            claimedBusinessesWithOrganization,
            claimedOrganizationRows,
        ] = await Promise.all([
            this.prisma.businessSuggestion.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.businessDuplicateCase.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.businessDuplicateCase.findMany({
                where: {
                    resolvedAt: { not: null },
                },
                select: {
                    createdAt: true,
                    resolvedAt: true,
                },
            }),
            this.prisma.businessClaimRequest.groupBy({
                by: ['status'],
                _count: { _all: true },
            }),
            this.prisma.businessClaimRequest.findMany({
                where: {
                    status: {
                        in: ['APPROVED', 'REJECTED'],
                    },
                    reviewedAt: { not: null },
                },
                select: {
                    createdAt: true,
                    reviewedAt: true,
                },
            }),
            this.prisma.growthEvent.count({
                where: {
                    eventType: GrowthEventType.CLAIM_CTA_CLICK,
                    occurredAt: {
                        gte: last30Days,
                    },
                },
            }),
            this.prisma.business.count({
                where: {
                    deletedAt: null,
                    claimStatus: 'CLAIMED',
                    organizationId: { not: null },
                },
            }),
            this.prisma.business.findMany({
                where: {
                    deletedAt: null,
                    claimStatus: 'CLAIMED',
                    organizationId: { not: null },
                },
                select: {
                    organizationId: true,
                },
                distinct: ['organizationId'],
            }),
        ]);

        const suggestionSummary = suggestionSummaryRows.reduce<Record<string, number>>((accumulator, item) => {
            accumulator[item.status] = item._count._all;
            return accumulator;
        }, {});
        const duplicateCaseSummary = duplicateCaseSummaryRows.reduce<Record<string, number>>((accumulator, item) => {
            accumulator[item.status] = item._count._all;
            return accumulator;
        }, {});
        const claimRequestSummary = claimRequestSummaryRows.reduce<Record<string, number>>((accumulator, item) => {
            accumulator[item.status] = item._count._all;
            return accumulator;
        }, {});

        const suggestionApprovals = suggestionSummary.APPROVED ?? 0;
        const suggestionDecisions = suggestionApprovals + (suggestionSummary.REJECTED ?? 0);
        const suggestionApprovalRatePct = suggestionDecisions > 0
            ? Number(((suggestionApprovals / suggestionDecisions) * 100).toFixed(1))
            : 0;

        const resolvedDuplicateCases = duplicateCaseTimings.length;
        const mergedDuplicateCases = duplicateCaseSummary.MERGED ?? 0;
        const duplicateMergeRatePct = resolvedDuplicateCases > 0
            ? Number(((mergedDuplicateCases / resolvedDuplicateCases) * 100).toFixed(1))
            : 0;
        const duplicateResolutionAvgHours = duplicateCaseTimings.length > 0
            ? Number((
                duplicateCaseTimings.reduce((accumulator, item) => {
                    const resolvedAt = item.resolvedAt?.getTime() ?? item.createdAt.getTime();
                    return accumulator + ((resolvedAt - item.createdAt.getTime()) / (1000 * 60 * 60));
                }, 0) / duplicateCaseTimings.length
            ).toFixed(1))
            : 0;
        const duplicateDetectionRatePct = totalBusinesses > 0
            ? Number(((duplicateInvolvedBusinessCount / totalBusinesses) * 100).toFixed(1))
            : 0;

        const approvedClaims = claimRequestSummary.APPROVED ?? 0;
        const rejectedClaims = claimRequestSummary.REJECTED ?? 0;
        const reviewedClaims = approvedClaims + rejectedClaims;
        const claimApprovalRatePct = reviewedClaims > 0
            ? Number(((approvedClaims / reviewedClaims) * 100).toFixed(1))
            : 0;
        const claimReviewAvgHours = reviewedClaimRequests.length > 0
            ? Number((
                reviewedClaimRequests.reduce((accumulator, item) =>
                    accumulator + (((item.reviewedAt?.getTime() ?? item.createdAt.getTime()) - item.createdAt.getTime()) / (1000 * 60 * 60)), 0)
                / reviewedClaimRequests.length
            ).toFixed(1))
            : 0;
        const claimRequestsLast30Days = await this.prisma.businessClaimRequest.count({
            where: {
                createdAt: {
                    gte: last30Days,
                },
            },
        });
        const claimRequestCompletionRatePct = claimCtaClicksLast30Days > 0
            ? Number(((claimRequestsLast30Days / claimCtaClicksLast30Days) * 100).toFixed(1))
            : 0;

        const claimedOrganizationIds = claimedOrganizationRows
            .map((entry) => entry.organizationId)
            .filter((organizationId): organizationId is string => Boolean(organizationId));
        const claimedOrganizations = claimedOrganizationIds.length;
        const paidClaimOrganizationRows = claimedOrganizationIds.length > 0
            ? await this.prisma.organization.findMany({
                where: {
                    id: {
                        in: claimedOrganizationIds,
                    },
                    plan: {
                        not: 'FREE',
                    },
                },
                select: {
                    id: true,
                },
            })
            : [];
        const paidClaimOrganizationIds = paidClaimOrganizationRows.map((organization) => organization.id);
        const paidClaimOrganizations = paidClaimOrganizationIds.length;
        const claimedToOrganizationRatePct = claimedBusinesses > 0
            ? Number(((claimedBusinessesWithOrganization / claimedBusinesses) * 100).toFixed(1))
            : 0;
        const organizationToPaidRatePct = claimedOrganizations > 0
            ? Number(((paidClaimOrganizations / claimedOrganizations) * 100).toFixed(1))
            : 0;
        const [
            paidOrganizationsUsingAnalytics,
            paidOrganizationsUsingPromotions,
            paidOrganizationsUsingAds,
        ] = paidClaimOrganizationIds.length > 0
            ? await Promise.all([
                this.prisma.business.findMany({
                    where: {
                        organizationId: {
                            in: paidClaimOrganizationIds,
                        },
                        analytics: {
                            some: {
                                date: {
                                    gte: last30Days,
                                },
                                OR: [
                                    { views: { gt: 0 } },
                                    { clicks: { gt: 0 } },
                                    { conversions: { gt: 0 } },
                                    { reservationRequests: { gt: 0 } },
                                    { grossRevenue: { gt: 0 } },
                                ],
                            },
                        },
                    },
                    select: {
                        organizationId: true,
                    },
                    distinct: ['organizationId'],
                }).then((rows) => rows.length),
                this.prisma.promotion.findMany({
                    where: {
                        organizationId: {
                            in: paidClaimOrganizationIds,
                        },
                        deletedAt: null,
                        OR: [
                            { isActive: true },
                            {
                                createdAt: {
                                    gte: last30Days,
                                },
                            },
                            {
                                endsAt: {
                                    gte: last30Days,
                                },
                            },
                        ],
                    },
                    select: {
                        organizationId: true,
                    },
                    distinct: ['organizationId'],
                }).then((rows) => rows.length),
                this.prisma.adCampaign.findMany({
                    where: {
                        organizationId: {
                            in: paidClaimOrganizationIds,
                        },
                        OR: [
                            {
                                startsAt: {
                                    gte: last30Days,
                                },
                            },
                            {
                                endsAt: {
                                    gte: last30Days,
                                },
                            },
                            {
                                createdAt: {
                                    gte: last30Days,
                                },
                            },
                        ],
                    },
                    select: {
                        organizationId: true,
                    },
                    distinct: ['organizationId'],
                }).then((rows) => rows.length),
            ])
            : [0, 0, 0];
        const paidOrganizationsUsingAnyPremiumFeature = new Set<string>();
        if (paidClaimOrganizationIds.length > 0) {
            const [
                analyticsOrgRows,
                promotionOrgRows,
                adOrgRows,
            ] = await Promise.all([
                this.prisma.business.findMany({
                    where: {
                        organizationId: {
                            in: paidClaimOrganizationIds,
                        },
                        analytics: {
                            some: {
                                date: {
                                    gte: last30Days,
                                },
                                OR: [
                                    { views: { gt: 0 } },
                                    { clicks: { gt: 0 } },
                                    { conversions: { gt: 0 } },
                                    { reservationRequests: { gt: 0 } },
                                    { grossRevenue: { gt: 0 } },
                                ],
                            },
                        },
                    },
                    select: {
                        organizationId: true,
                    },
                    distinct: ['organizationId'],
                }),
                this.prisma.promotion.findMany({
                    where: {
                        organizationId: {
                            in: paidClaimOrganizationIds,
                        },
                        deletedAt: null,
                        OR: [
                            { isActive: true },
                            {
                                createdAt: {
                                    gte: last30Days,
                                },
                            },
                            {
                                endsAt: {
                                    gte: last30Days,
                                },
                            },
                        ],
                    },
                    select: {
                        organizationId: true,
                    },
                    distinct: ['organizationId'],
                }),
                this.prisma.adCampaign.findMany({
                    where: {
                        organizationId: {
                            in: paidClaimOrganizationIds,
                        },
                        OR: [
                            {
                                startsAt: {
                                    gte: last30Days,
                                },
                            },
                            {
                                endsAt: {
                                    gte: last30Days,
                                },
                            },
                            {
                                createdAt: {
                                    gte: last30Days,
                                },
                            },
                        ],
                    },
                    select: {
                        organizationId: true,
                    },
                    distinct: ['organizationId'],
                }),
            ]);

            analyticsOrgRows.forEach((row) => {
                if (row.organizationId) {
                    paidOrganizationsUsingAnyPremiumFeature.add(row.organizationId);
                }
            });
            promotionOrgRows.forEach((row) => {
                if (row.organizationId) {
                    paidOrganizationsUsingAnyPremiumFeature.add(row.organizationId);
                }
            });
            adOrgRows.forEach((row) => {
                if (row.organizationId) {
                    paidOrganizationsUsingAnyPremiumFeature.add(row.organizationId);
                }
            });
        }
        const premiumFeatureUsageRatePct = paidClaimOrganizations > 0
            ? Number(((paidOrganizationsUsingAnyPremiumFeature.size / paidClaimOrganizations) * 100).toFixed(1))
            : 0;

        return {
            summary: {
                totalBusinesses,
                publishedBusinesses,
                incompleteBusinesses: incompleteCount,
                duplicateCandidates: duplicateClusterCount,
                missingSector,
                missingCoordinates,
                unclaimedBusinesses,
                pendingClaims,
                claimedBusinesses,
                weeklyCatalogGrowth,
                suggestionApprovalRatePct,
                resolvedDuplicateCases,
                duplicateDetectionRatePct,
                duplicateResolutionAvgHours,
                claimCtaClicksLast30Days,
                claimRequestsLast30Days,
                claimRequestCompletionRatePct,
                claimApprovalRatePct,
                claimReviewAvgHours,
                claimedBusinessesWithOrganization,
                paidClaimOrganizations,
                claimedToOrganizationRatePct,
                organizationToPaidRatePct,
                premiumFeatureUsageRatePct,
            },
            totalBusinesses,
            publishedBusinesses,
            incompleteCount,
            duplicateClusterCount,
            duplicateDetectionRatePct,
            unclaimedBusinesses,
            pendingClaims,
            claimedBusinesses,
            weeklyCatalogGrowth,
            claimCtaClicksLast30Days,
            claimRequestsLast30Days,
            claimRequestCompletionRatePct,
            claimApprovalRatePct,
            claimReviewAvgHours,
            suggestionApprovalRatePct,
            resolvedDuplicateCases,
            duplicateResolutionAvgHours,
            claimedBusinessesWithOrganization,
            paidClaimOrganizations,
            premiumFeatureUsageRatePct,
            metrics: {
                catalog: {
                    totalBusinesses,
                    publishedBusinesses,
                    unclaimedBusinesses,
                    pendingClaims,
                    claimedBusinesses,
                    weeklyCatalogGrowth,
                    claimedPct: totalBusinesses > 0 ? Number(((claimedBusinesses / totalBusinesses) * 100).toFixed(1)) : 0,
                    unclaimedPct: totalBusinesses > 0 ? Number(((unclaimedBusinesses / totalBusinesses) * 100).toFixed(1)) : 0,
                },
                quality: {
                    incompleteCount,
                    missingSector,
                    missingCoordinates,
                    duplicateClusterCount,
                    duplicateInvolvedBusinessCount,
                    duplicateDetectionRatePct,
                    resolvedDuplicateCases,
                    mergedDuplicateCases,
                    conflictDuplicateCases: duplicateCaseSummary.CONFLICT ?? 0,
                    dismissedDuplicateCases: duplicateCaseSummary.DISMISSED ?? 0,
                    duplicateMergeRatePct,
                    duplicateResolutionAvgHours,
                },
                claim: {
                    ctaClicksLast30Days: claimCtaClicksLast30Days,
                    requestsLast30Days: claimRequestsLast30Days,
                    requestCompletionRatePct: claimRequestCompletionRatePct,
                    approvalRatePct: claimApprovalRatePct,
                    avgReviewHours: claimReviewAvgHours,
                },
                suggestion: {
                    pending: suggestionSummary.PENDING ?? 0,
                    approved: suggestionSummary.APPROVED ?? 0,
                    rejected: suggestionSummary.REJECTED ?? 0,
                    approvalRatePct: suggestionApprovalRatePct,
                },
                saas: {
                    claimedBusinessesWithOrganization,
                    claimedOrganizations,
                    paidClaimOrganizations,
                    claimedToOrganizationRatePct,
                    organizationToPaidRatePct,
                    paidOrganizationsUsingAnalytics,
                    paidOrganizationsUsingPromotions,
                    paidOrganizationsUsingAds,
                    paidOrganizationsUsingAnyPremiumFeature: paidOrganizationsUsingAnyPremiumFeature.size,
                    premiumFeatureUsageRatePct,
                },
            },
            incompleteBusinesses,
            duplicateCandidates,
        };
    }

    private async resolveProvinceAndCityNames(
        provinceId: string,
        cityId?: string,
    ): Promise<{ provinceName: string | null; cityName: string | null }> {
        const [province, city] = await Promise.all([
            this.prisma.province.findUnique({
                where: { id: provinceId },
                select: { name: true },
            }),
            cityId
                ? this.prisma.city.findUnique({
                    where: { id: cityId },
                    select: { name: true },
                })
                : Promise.resolve(null),
        ]);

        return {
            provinceName: province?.name ?? null,
            cityName: city?.name ?? null,
        };
    }

    private async generateUniqueSlug(baseSlug: string): Promise<string> {
        let slug = baseSlug;
        let counter = 1;

        while (
            await this.prisma.business.findUnique({
                where: { slug },
                select: { id: true },
            })
        ) {
            slug = `${baseSlug}-${counter}`;
            counter++;
        }

        return slug;
    }

    private publishBusinessChangedEvent(
        businessId: string,
        slug: string | null,
        operation: 'created' | 'updated' | 'verified' | 'deleted',
    ): void {
        this.domainEventsService.publishBusinessChanged({
            businessId,
            slug,
            operation,
        });
    }

    private async syncBusinessLocation(
        client: PrismaService | Prisma.TransactionClient,
        businessId: string,
        latitude?: number,
        longitude?: number,
    ): Promise<void> {
        try {
            const hasLatitude = Number.isFinite(latitude);
            const hasLongitude = Number.isFinite(longitude);

            if (!hasLatitude || !hasLongitude) {
                await client.$executeRaw`
                    UPDATE businesses
                    SET location = NULL
                    WHERE id = ${businessId}
                `;
                return;
            }

            await client.$executeRaw`
                UPDATE businesses
                SET location = ST_SetSRID(ST_MakePoint(${longitude as number}, ${latitude as number}), 4326)
                WHERE id = ${businessId}
            `;
        } catch (error) {
            this.logger.warn(
                `Could not sync PostGIS location for business "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
            );
        }
    }

    private findBusinessByIdWithReviews(id: string) {
        return this.findBusinessDetail({
            id,
            deletedAt: null,
        });
    }

    private findBusinessBySlugWithReviews(slug: string) {
        return this.findBusinessDetail({
            slug,
            deletedAt: null,
        });
    }

    private findPublicBusinessById(id: string) {
        return this.findBusinessDetail({
            AND: [
                { id },
                this.buildPublicCatalogWhere(),
            ],
        });
    }

    private findPublicBusinessBySlug(slug: string) {
        return this.findBusinessDetail({
            AND: [
                { slug },
                this.buildPublicCatalogWhere(),
            ],
        });
    }

    private async findBusinessDetail(where: Prisma.BusinessWhereInput) {
        const business = await this.prisma.business.findFirst({
            where,
            select: businessDetailBaseSelect,
        });

        if (!business) {
            return null;
        }

        const [features, reviews] = await Promise.all([
            this.safeLoadBusinessFeatures(business.id),
            this.safeLoadBusinessReviews(business.id),
        ]);

        return {
            ...business,
            features,
            reviews,
        };
    }

    private async safeLoadBusinessFeatures(businessId: string) {
        try {
            return await this.prisma.businessFeature.findMany({
                where: { businessId },
                select: {
                    feature: {
                        select: { id: true, name: true },
                    },
                },
            });
        } catch (error) {
            this.logger.warn(
                `Could not load business features for "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
            );
            return [];
        }
    }

    private async safeLoadBusinessReviews(businessId: string) {
        try {
            const reviews = await this.prisma.review.findMany({
                where: {
                    businessId,
                    moderationStatus: 'APPROVED',
                    isSpam: false,
                },
                select: {
                    id: true,
                    rating: true,
                    comment: true,
                    createdAt: true,
                    userId: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            });

            if (reviews.length === 0) {
                return [];
            }

            let usersById = new Map<string, { id: string; name: string }>();

            try {
                const users = await this.prisma.user.findMany({
                    where: {
                        id: { in: [...new Set(reviews.map((review) => review.userId))] },
                    },
                    select: {
                        id: true,
                        name: true,
                    },
                });

                usersById = new Map(users.map((user) => [user.id, user]));
            } catch (error) {
                this.logger.warn(
                    `Could not resolve review authors for "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
                );
            }

            return reviews.map((review) => ({
                ...review,
                user: usersById.get(review.userId) ?? {
                    id: review.userId,
                    name: 'Usuario',
                },
            }));
        } catch (error) {
            this.logger.warn(
                `Could not load business reviews for "${businessId}" (${error instanceof Error ? error.message : String(error)})`,
            );
            return [];
        }
    }

    private async ensureOwnerOrganization(
        tx: Prisma.TransactionClient,
        userId: string,
    ): Promise<string> {
        const ownerMembership = await tx.organizationMember.findFirst({
            where: {
                userId,
                role: 'OWNER',
            },
            select: {
                organizationId: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        if (ownerMembership) {
            await this.ensureOrganizationSubscription(tx, ownerMembership.organizationId);
            return ownerMembership.organizationId;
        }

        const ownerOrganization = await tx.organization.findFirst({
            where: { ownerUserId: userId },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
        });

        if (ownerOrganization) {
            await tx.organizationMember.upsert({
                where: {
                    organizationId_userId: {
                        organizationId: ownerOrganization.id,
                        userId,
                    },
                },
                update: {
                    role: 'OWNER',
                },
                create: {
                    organizationId: ownerOrganization.id,
                    userId,
                    role: 'OWNER',
                },
            });

            await this.ensureOrganizationSubscription(tx, ownerOrganization.id);

            return ownerOrganization.id;
        }

        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        const organizationName = user.name?.trim()
            ? `Organización de ${user.name.trim()}`
            : `Organización ${user.id.slice(0, 8)}`;
        const slugBase = slugify(user.name || 'organizacion', { lower: true, strict: true }) || 'organizacion';
        const slugPrefix = `${slugBase}-${user.id.slice(0, 8)}`;

        let slug = slugPrefix;
        let suffix = 1;
        while (await tx.organization.findUnique({ where: { slug }, select: { id: true } })) {
            slug = `${slugPrefix}-${suffix}`;
            suffix += 1;
        }

        const organization = await tx.organization.create({
            data: {
                name: organizationName,
                slug,
                ownerUserId: userId,
            },
            select: {
                id: true,
            },
        });

        await tx.organizationMember.upsert({
            where: {
                organizationId_userId: {
                    organizationId: organization.id,
                    userId,
                },
            },
            update: {
                role: 'OWNER',
            },
            create: {
                organizationId: organization.id,
                userId,
                role: 'OWNER',
            },
        });

        await this.ensureOrganizationSubscription(tx, organization.id);

        return organization.id;
    }

    private async ensureOrganizationSubscription(
        tx: Prisma.TransactionClient,
        organizationId: string,
    ): Promise<void> {
        const existing = await tx.subscription.findUnique({
            where: { organizationId },
            select: { id: true },
        });

        if (existing) {
            return;
        }

        const freePlan = await tx.plan.findUnique({
            where: { code: 'FREE' },
            select: { id: true },
        });
        if (!freePlan) {
            throw new BadRequestException(
                'No existe el plan FREE en la base de datos. Ejecuta el seed de planes.',
            );
        }

        await tx.subscription.create({
            data: {
                organizationId,
                planId: freePlan.id,
                status: 'ACTIVE',
                currentPeriodStart: new Date(),
            },
        });
    }

    private async assertOrganizationCanCreateBusiness(
        tx: Prisma.TransactionClient,
        organizationId: string,
    ): Promise<void> {
        const organization = await tx.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                plan: true,
                subscriptionStatus: true,
            },
        });

        if (!organization) {
            throw new NotFoundException('Organización no encontrada');
        }

        if (organization.subscriptionStatus === 'CANCELED') {
            throw new ForbiddenException('La suscripción de la organización está cancelada');
        }

        const limits = getOrganizationPlanLimits(organization.plan);
        if (limits.maxBusinesses === null) {
            return;
        }

        const businessCount = await tx.business.count({
            where: {
                organizationId,
                deletedAt: null,
            },
        });

        if (businessCount >= limits.maxBusinesses) {
            throw new BadRequestException(
                'La organización alcanzó el límite de negocios de su plan. Actualiza la suscripción para continuar.',
            );
        }
    }

    private async buildWhere(
        query: BusinessQueryDto,
        includeUnverified: boolean,
    ): Promise<Prisma.BusinessWhereInput> {
        const where: Prisma.BusinessWhereInput = {
            deletedAt: null,
        };

        if (!includeUnverified) {
            where.verified = true;
        } else if (typeof query.verified === 'boolean') {
            where.verified = query.verified;
        }

        if (query.publicStatus) {
            where.publicStatus = query.publicStatus;
        }

        if (query.claimStatus) {
            where.claimStatus = query.claimStatus;
        }

        if (query.source) {
            where.source = query.source;
        }

        const normalizedSearch = query.search?.trim();
        if (normalizedSearch) {
            where.OR = [
                { name: { contains: normalizedSearch, mode: 'insensitive' } },
                { description: { contains: normalizedSearch, mode: 'insensitive' } },
            ];
        }

        const categoryIds = await this.resolveCategoryFilterIds(query.categoryId, query.categorySlug);
        if (categoryIds.length > 0) {
            where.categories = {
                some: {
                    categoryId: {
                        in: categoryIds,
                    },
                },
            };
        } else if (query.categoryId || query.categorySlug) {
            where.id = '__no_category_match__';
            return where;
        }

        if (query.provinceId) {
            where.provinceId = query.provinceId;
        } else if (query.provinceSlug) {
            where.province = {
                slug: query.provinceSlug,
            };
        }

        if (query.cityId) {
            where.cityId = query.cityId;
        }

        if (query.sectorId) {
            where.sectorId = query.sectorId;
        }

        const normalizedFeature = query.feature?.trim();
        if (normalizedFeature) {
            const featureIds = await this.resolveFeatureIds(normalizedFeature);
            if (featureIds.length === 0) {
                where.id = '__no_feature_match__';
                return where;
            }

            where.features = {
                some: {
                    featureId: {
                        in: featureIds,
                    },
                },
            };
        }

        return where;
    }

    private buildPublicCatalogWhere(): Prisma.BusinessWhereInput {
        return {
            deletedAt: null,
            publicStatus: 'PUBLISHED',
            isPublished: true,
            isSearchable: true,
            isDiscoverable: true,
            OR: [
                { verified: true },
                {
                    claimStatus: {
                        in: ['UNCLAIMED', 'PENDING_CLAIM'],
                    },
                },
            ],
        };
    }

    private async searchClaimCandidates(
        input: BusinessDuplicateSignalInput & {
            search: string;
            limit?: number;
        },
    ) {
        const trimmedSearch = input.search.trim();
        if (trimmedSearch.length < 2) {
            return [];
        }

        const safeLimit = Math.min(Math.max(input.limit ?? 6, 1), 12);
        const orClauses = this.buildDuplicateCandidateSearchClauses(input);
        if (orClauses.length === 0) {
            return [];
        }

        const rows = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
                publicStatus: 'PUBLISHED',
                isPublished: true,
                isSearchable: true,
                isDiscoverable: true,
                ...(input.provinceId ? { provinceId: input.provinceId } : {}),
                ...(input.cityId ? { cityId: input.cityId } : {}),
                OR: orClauses,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                address: true,
                phone: true,
                whatsapp: true,
                website: true,
                instagramUrl: true,
                latitude: true,
                longitude: true,
                provinceId: true,
                cityId: true,
                sectorId: true,
                verified: true,
                claimStatus: true,
                publicStatus: true,
                source: true,
                province: {
                    select: { id: true, name: true, slug: true },
                },
                city: {
                    select: { id: true, name: true, slug: true },
                },
                sector: {
                    select: { id: true, name: true, slug: true },
                },
                categories: {
                    select: {
                        category: {
                            select: { id: true, name: true, slug: true, icon: true, parentId: true },
                        },
                    },
                },
                images: {
                    select: { id: true, url: true, isCover: true, caption: true, type: true },
                    orderBy: [
                        { isCover: Prisma.SortOrder.desc },
                        { sortOrder: Prisma.SortOrder.asc },
                        { id: Prisma.SortOrder.asc },
                    ],
                    take: 1,
                },
            },
            orderBy: [
                { verified: 'desc' },
                { createdAt: 'desc' },
            ],
            take: Math.min(safeLimit * 5, 50),
        });

        return rows
            .map((row) => {
                const scoredCandidate = this.scoreDuplicateCandidate(row, input);
                return {
                    ...row,
                    matchType: scoredCandidate.matchType,
                    matchScore: scoredCandidate.score,
                    matchReasons: scoredCandidate.reasons,
                    alreadyClaimed: row.claimStatus === 'CLAIMED',
                };
            })
            .filter((row) => row.matchScore >= 35)
            .sort((left, right) => {
                if (right.matchScore !== left.matchScore) {
                    return right.matchScore - left.matchScore;
                }
                if (left.alreadyClaimed !== right.alreadyClaimed) {
                    return left.alreadyClaimed ? -1 : 1;
                }
                return left.name.localeCompare(right.name, 'es');
            })
            .slice(0, safeLimit);
    }

    private async assertNoStrongDuplicateMatch(
        input: BusinessDuplicateSignalInput & {
            name: string;
            provinceId: string;
        },
        ignorePotentialDuplicates?: boolean,
        eventContext?: {
            source: string;
            actorUserId?: string | null;
        },
    ) {
        if (ignorePotentialDuplicates) {
            return;
        }

        const strongCandidates = await this.findStrongDuplicateCandidates(input);
        if (strongCandidates.length === 0) {
            return;
        }

        if (eventContext) {
            const reasons = new Set<string>();
            strongCandidates.forEach((candidate) => {
                candidate.matchReasons.forEach((reason) => reasons.add(reason));
            });

            this.domainEventsService.publishPotentialDuplicateDetected({
                source: eventContext.source,
                actorUserId: eventContext.actorUserId ?? null,
                candidateBusinessIds: strongCandidates.map((candidate) => candidate.id),
                candidateSlugs: strongCandidates.map((candidate) => candidate.slug),
                reasons: [...reasons],
            });
        }

        throw new ConflictException(
            'Encontramos negocios que parecen duplicados. Revisa las coincidencias y reclama el negocio existente o continua con la opcion explicita de crear de todos modos.',
        );
    }

    private async findStrongDuplicateCandidates(input: BusinessDuplicateSignalInput & {
        name: string;
        provinceId: string;
    }) {
        const orClauses = this.buildDuplicateCandidateSearchClauses({
            ...input,
            search: input.name,
        });
        if (orClauses.length === 0) {
            return [];
        }

        const candidates = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
                provinceId: input.provinceId,
                ...(input.cityId ? { cityId: input.cityId } : {}),
                OR: orClauses,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                address: true,
                phone: true,
                whatsapp: true,
                website: true,
                instagramUrl: true,
                latitude: true,
                longitude: true,
                provinceId: true,
                cityId: true,
                sectorId: true,
                claimStatus: true,
                publicStatus: true,
                source: true,
                categories: {
                    select: {
                        category: {
                            select: { id: true, name: true, slug: true, icon: true, parentId: true },
                        },
                    },
                },
            },
            take: 20,
        });

        return candidates
            .map((candidate) => {
                const match = this.scoreDuplicateCandidate(candidate, input);
                return {
                    ...candidate,
                    matchScore: match.score,
                    matchType: match.matchType,
                    matchReasons: match.reasons,
                };
            })
            .filter((candidate) => candidate.matchScore >= 60)
            .sort((left, right) => right.matchScore - left.matchScore)
            .slice(0, 12);
    }

    private buildDuplicateCandidateSearchClauses(input: BusinessDuplicateSignalInput): Prisma.BusinessWhereInput[] {
        const orClauses: Prisma.BusinessWhereInput[] = [];
        const textSignals = [...new Set(
            [input.search, input.name, input.address]
                .map((value) => normalizeOptionalText(value) ?? null)
                .filter((value): value is string => Boolean(value && value.length >= 2)),
        )];
        const digitSignals = [...new Set(
            [input.phone, input.whatsapp, input.search]
                .map((value) => this.normalizePhoneDigits(value))
                .filter((value): value is string => Boolean(value)),
        )];
        const websiteSignals = [...new Set(
            [input.website, input.search]
                .map((value) => this.normalizeWebsiteValue(value))
                .filter((value): value is string => Boolean(value)),
        )];
        const instagramSignals = [...new Set(
            [input.instagramUrl, input.search]
                .map((value) => this.normalizeInstagramValue(value))
                .filter((value): value is string => Boolean(value)),
        )];

        for (const textSignal of textSignals) {
            orClauses.push({
                name: {
                    contains: textSignal,
                    mode: 'insensitive',
                },
            });
            orClauses.push({
                address: {
                    contains: textSignal,
                    mode: 'insensitive',
                },
            });

            const slugSignal = slugify(textSignal, { lower: true, strict: true });
            if (slugSignal) {
                orClauses.push({
                    slug: {
                        contains: slugSignal,
                    },
                });
            }
        }

        for (const digitSignal of digitSignals) {
            orClauses.push({ phone: digitSignal });
            orClauses.push({ whatsapp: digitSignal });
        }

        for (const websiteSignal of websiteSignals) {
            orClauses.push({
                website: {
                    contains: websiteSignal,
                    mode: 'insensitive',
                },
            });
        }

        for (const instagramSignal of instagramSignals) {
            orClauses.push({
                instagramUrl: {
                    contains: instagramSignal,
                    mode: 'insensitive',
                },
            });
        }

        return orClauses;
    }

    private scoreDuplicateCandidate(
        candidate: {
            id: string;
            name: string;
            slug: string;
            address: string;
            phone: string | null;
            whatsapp: string | null;
            website: string | null;
            instagramUrl?: string | null;
            latitude?: number | null;
            longitude?: number | null;
            provinceId?: string | null;
            cityId?: string | null;
            sectorId?: string | null;
            categories?: Array<{
                category: {
                    id: string;
                };
            }>;
        },
        input: BusinessDuplicateSignalInput,
    ): {
        score: number;
        matchType: 'exacta' | 'probable' | 'debil' | null;
        reasons: string[];
    } {
        const reasons = new Set<string>();
        let score = 0;

        const normalizedNameInput = this.normalizeComparisonValue(input.name ?? input.search);
        const normalizedAddressInput = this.normalizeComparisonValue(input.address);
        const normalizedSlugInput = this.normalizeSlugValue(input.name ?? input.search);
        const normalizedCandidateName = this.normalizeComparisonValue(candidate.name);
        const normalizedCandidateAddress = this.normalizeComparisonValue(candidate.address);
        const normalizedCandidateSlug = this.normalizeSlugValue(candidate.slug);
        const phoneSignals = [...new Set(
            [input.phone, input.whatsapp, input.search]
                .map((value) => this.normalizePhoneDigits(value))
                .filter((value): value is string => Boolean(value)),
        )];
        const websiteSignals = [...new Set(
            [input.website, input.search]
                .map((value) => this.normalizeWebsiteValue(value))
                .filter((value): value is string => Boolean(value)),
        )];
        const instagramSignals = [...new Set(
            [input.instagramUrl, input.search]
                .map((value) => this.normalizeInstagramValue(value))
                .filter((value): value is string => Boolean(value)),
        )];
        const candidatePhone = this.normalizePhoneDigits(candidate.phone);
        const candidateWhatsapp = this.normalizePhoneDigits(candidate.whatsapp);
        const candidateWebsite = this.normalizeWebsiteValue(candidate.website);
        const candidateInstagram = this.normalizeInstagramValue(candidate.instagramUrl);
        const sameProvince = Boolean(input.provinceId && candidate.provinceId && input.provinceId === candidate.provinceId);
        const sameCity = Boolean(input.cityId && candidate.cityId && input.cityId === candidate.cityId);
        const sameSector = Boolean(input.sectorId && candidate.sectorId && input.sectorId === candidate.sectorId);
        const categoryOverlapCount = this.countOverlappingCategoryIds(input.categoryIds, candidate.categories);
        const coordinateDistanceKm = this.calculateCoordinateDistanceKm(
            input.latitude,
            input.longitude,
            candidate.latitude ?? null,
            candidate.longitude ?? null,
        );
        const nameOverlap = this.calculateTokenOverlap(normalizedNameInput, normalizedCandidateName);
        const addressOverlap = this.calculateTokenOverlap(normalizedAddressInput, normalizedCandidateAddress);

        if (normalizedNameInput && normalizedCandidateName === normalizedNameInput) {
            score += 64;
            reasons.add('nombre_exacto');
        } else if (
            normalizedNameInput
            && (
                normalizedCandidateName.includes(normalizedNameInput)
                || normalizedNameInput.includes(normalizedCandidateName)
                || nameOverlap >= 0.8
            )
        ) {
            score += 42;
            reasons.add('nombre_similar');
        }

        if (normalizedSlugInput && normalizedCandidateSlug === normalizedSlugInput) {
            score += 52;
            reasons.add('slug');
        }

        if (phoneSignals.some((value) => value === candidatePhone)) {
            score += 92;
            reasons.add('telefono');
        }

        if (phoneSignals.some((value) => value === candidateWhatsapp)) {
            score += 90;
            reasons.add('whatsapp');
        }

        if (websiteSignals.some((value) => value === candidateWebsite)) {
            score += 84;
            reasons.add('website');
        }

        if (instagramSignals.some((value) => value === candidateInstagram)) {
            score += 78;
            reasons.add('instagram');
        }

        if (normalizedAddressInput && normalizedCandidateAddress === normalizedAddressInput) {
            score += 46;
            reasons.add('direccion_exacta');
        } else if (
            normalizedAddressInput
            && (
                normalizedCandidateAddress.includes(normalizedAddressInput)
                || normalizedAddressInput.includes(normalizedCandidateAddress)
                || addressOverlap >= 0.75
            )
        ) {
            score += 24;
            reasons.add('direccion_similar');
        }

        if (sameProvince) {
            score += 3;
            reasons.add('provincia');
        }

        if (sameCity) {
            score += 5;
            reasons.add('ciudad');
        }

        if (sameSector) {
            score += 4;
            reasons.add('sector');
        }

        if (categoryOverlapCount > 0) {
            score += 6;
            reasons.add('categoria');
        }

        if (coordinateDistanceKm !== null && coordinateDistanceKm <= 0.15) {
            score += 14;
            reasons.add('coordenadas_cercanas');
        } else if (coordinateDistanceKm !== null && coordinateDistanceKm <= 0.5) {
            score += 8;
            reasons.add('coordenadas_cercanas');
        }

        const strongNameMatch = reasons.has('nombre_exacto') || reasons.has('nombre_similar');
        const strongAddressMatch = reasons.has('direccion_exacta') || reasons.has('direccion_similar');
        if (strongNameMatch && categoryOverlapCount > 0 && (sameCity || sameProvince)) {
            score += 14;
            reasons.add('nombre_categoria_ubicacion');
        }

        if (strongNameMatch && strongAddressMatch) {
            score += 10;
            reasons.add('nombre_y_direccion');
        }

        const normalizedScore = Math.min(score, 99);
        return {
            score: normalizedScore,
            matchType: this.resolveDuplicateMatchType(normalizedScore),
            reasons: [...reasons],
        };
    }

    private normalizeComparisonValue(value?: string | null): string {
        return (value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    private normalizeSlugValue(value?: string | null): string | null {
        const normalized = normalizeOptionalText(value);
        if (!normalized) {
            return null;
        }

        const slug = slugify(normalized, { lower: true, strict: true });
        return slug || null;
    }

    private normalizePhoneDigits(value?: string | null): string | null {
        const digits = String(value ?? '').replace(/\D/g, '');
        return digits.length >= 7 ? digits : null;
    }

    private normalizeWebsiteValue(value?: string | null): string | null {
        const normalized = normalizeOptionalText(value);
        if (!normalized) {
            return null;
        }

        return normalized
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/\/+$/, '')
            .toLowerCase();
    }

    private normalizeInstagramValue(value?: string | null): string | null {
        const normalized = normalizeOptionalText(value);
        if (!normalized) {
            return null;
        }

        return normalized
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .replace(/^instagram\.com\//i, '')
            .replace(/^@/, '')
            .replace(/\/+$/, '')
            .toLowerCase();
    }

    private resolveDuplicateMatchType(score: number): 'exacta' | 'probable' | 'debil' | null {
        if (score >= 85) {
            return 'exacta';
        }

        if (score >= 60) {
            return 'probable';
        }

        if (score >= 35) {
            return 'debil';
        }

        return null;
    }

    private calculateTokenOverlap(left: string, right: string): number {
        if (!left || !right) {
            return 0;
        }

        const leftTokens = new Set(left.split(' ').filter((token) => token.length >= 3));
        const rightTokens = new Set(right.split(' ').filter((token) => token.length >= 3));
        if (leftTokens.size === 0 || rightTokens.size === 0) {
            return 0;
        }

        let shared = 0;
        leftTokens.forEach((token) => {
            if (rightTokens.has(token)) {
                shared += 1;
            }
        });

        return shared / Math.max(leftTokens.size, rightTokens.size);
    }

    private countOverlappingCategoryIds(
        inputCategoryIds: string[] | undefined,
        candidateCategories: Array<{ category: { id: string } }> | undefined,
    ): number {
        if (!inputCategoryIds?.length || !candidateCategories?.length) {
            return 0;
        }

        const candidateIds = new Set(candidateCategories.map((entry) => entry.category.id));
        return [...new Set(inputCategoryIds)].filter((categoryId) => candidateIds.has(categoryId)).length;
    }

    private calculateCoordinateDistanceKm(
        leftLatitude?: number | null,
        leftLongitude?: number | null,
        rightLatitude?: number | null,
        rightLongitude?: number | null,
    ): number | null {
        if (
            typeof leftLatitude !== 'number'
            || typeof leftLongitude !== 'number'
            || typeof rightLatitude !== 'number'
            || typeof rightLongitude !== 'number'
        ) {
            return null;
        }

        const earthRadiusKm = 6371;
        const deltaLat = this.toRadians(rightLatitude - leftLatitude);
        const deltaLng = this.toRadians(rightLongitude - leftLongitude);
        const a = Math.sin(deltaLat / 2) ** 2
            + Math.cos(this.toRadians(leftLatitude))
            * Math.cos(this.toRadians(rightLatitude))
            * Math.sin(deltaLng / 2) ** 2;

        return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private toRadians(value: number): number {
        return value * (Math.PI / 180);
    }

    private async resolveFeatureIds(featureQuery: string): Promise<string[]> {
        const rows = await this.prisma.feature.findMany({
            where: {
                name: {
                    contains: featureQuery,
                    mode: 'insensitive',
                },
            },
            select: { id: true },
            take: 25,
        });
        return rows.map((row) => row.id);
    }

    private async resolveCategoryFilterIds(categoryId?: string, categorySlug?: string): Promise<string[]> {
        if (!categoryId && !categorySlug) {
            return [];
        }

        const category = await this.prisma.category.findFirst({
            where: categoryId ? { id: categoryId } : { slug: categorySlug },
            select: { id: true },
        });

        if (!category) {
            return [];
        }

        const children = await this.prisma.category.findMany({
            where: { parentId: category.id },
            select: { id: true },
        });

        return [category.id, ...children.map((entry) => entry.id)];
    }

    private async assertCityBelongsToProvince(
        tx: Prisma.TransactionClient,
        provinceId: string,
        cityId?: string,
    ): Promise<void> {
        if (!cityId) {
            return;
        }

        const city = await tx.city.findUnique({
            where: { id: cityId },
            select: { provinceId: true },
        });

        if (!city || city.provinceId !== provinceId) {
            throw new BadRequestException('La ciudad seleccionada no pertenece a la provincia indicada');
        }
    }

    private async assertSectorBelongsToCity(
        tx: Prisma.TransactionClient,
        cityId?: string,
        sectorId?: string,
    ): Promise<void> {
        if (!sectorId) {
            return;
        }

        if (!cityId) {
            throw new BadRequestException('Debes seleccionar una ciudad antes de asignar un sector');
        }

        const sector = await tx.sector.findUnique({
            where: { id: sectorId },
            select: { cityId: true },
        });

        if (!sector || sector.cityId !== cityId) {
            throw new BadRequestException('El sector seleccionado no pertenece a la ciudad indicada');
        }
    }

    private async deleteBusinessImageFiles(imageUrls: string[]): Promise<void> {
        await Promise.all(
            imageUrls.map(async (imageUrl) => {
                const absolutePath = this.resolveUploadPath(imageUrl);
                if (!absolutePath) {
                    return;
                }
                try {
                    await fs.unlink(absolutePath);
                    await this.deleteOptimizedImageVariants(absolutePath);
                } catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    if (code !== 'ENOENT') {
                        throw error;
                    }
                }
            }),
        );
    }

    private async deleteOptimizedImageVariants(originalPath: string): Promise<void> {
        const basePath = originalPath.replace(/\.[^.]+$/, '');
        const optimizedPaths = [`${basePath}.webp`, `${basePath}.avif`];

        for (const optimizedPath of optimizedPaths) {
            try {
                await fs.unlink(optimizedPath);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code !== 'ENOENT') {
                    throw error;
                }
            }
        }
    }

    private resolveUploadPath(assetUrl: string): string | null {
        const normalizedAssetUrl = assetUrl.trim();
        if (!normalizedAssetUrl.startsWith('/uploads/')) {
            return null;
        }

        const relativePath = normalizedAssetUrl.replace(/^\/+/, '');
        const absolutePath = path.resolve(process.cwd(), relativePath);
        const relativeToUploadsRoot = path.relative(this.uploadsRoot, absolutePath);

        if (relativeToUploadsRoot.startsWith('..') || path.isAbsolute(relativeToUploadsRoot)) {
            return null;
        }

        return absolutePath;
    }

    private handlePrismaError(error: unknown): void {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
            return;
        }

        if (error.code === 'P2002') {
            throw new ConflictException('Ya existe un recurso con esos datos');
        }

        if (error.code === 'P2003') {
            throw new BadRequestException('No se pudo procesar la solicitud por referencias inválidas');
        }

        if (error.code === 'P2025') {
            throw new NotFoundException('Negocio no encontrado');
        }
    }

}
