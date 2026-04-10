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

@Injectable()
export class BusinessesService {
    private readonly logger = new Logger(BusinessesService.name);
    private static readonly DETAIL_ID_CACHE_PREFIX = 'public:businesses:detail:id';
    private static readonly DETAIL_SLUG_CACHE_PREFIX = 'public:businesses:detail:slug';
    private static readonly CATALOG_SYSTEM_USER_EMAIL = 'catalog@internal.aquita.do';
    private static readonly CATALOG_SYSTEM_ORG_SLUG = 'aquita-catalog-system';

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
                ownerPhone: business.owner.phone,
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
                organizationId,
                deletedAt: null,
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
        const matches = await this.searchClaimCandidates(query.q, {
            provinceId: query.provinceId,
            cityId: query.cityId,
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
                createdAt: true,
                updatedAt: true,
                reviewedAt: true,
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

                const existingPendingRequest = await tx.businessClaimRequest.findFirst({
                    where: {
                        businessId,
                        status: 'PENDING',
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
                    },
                    select: { id: true },
                });

                return createdRequest;
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

                if (claimRequest.status !== 'PENDING') {
                    throw new BadRequestException('Esta solicitud ya fue revisada');
                }

                if (dto.status === 'APPROVED') {
                    const effectiveOrganizationId = claimRequest.requesterOrganizationId
                        ?? await this.ensureOwnerOrganization(tx, claimRequest.requesterUserId);

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
                        },
                        select: {
                            id: true,
                        },
                    });

                    await tx.businessClaimRequest.update({
                        where: { id: claimRequestId },
                        data: {
                            status: 'APPROVED',
                            notes: reviewNotes ?? claimRequest.notes,
                            reviewedByAdminId: adminUserId,
                            reviewedAt,
                        },
                        select: { id: true },
                    });

                    await tx.businessClaimRequest.updateMany({
                        where: {
                            businessId: claimRequest.businessId,
                            status: 'PENDING',
                            id: {
                                not: claimRequestId,
                            },
                        },
                        data: {
                            status: 'CANCELED',
                            reviewedByAdminId: adminUserId,
                            reviewedAt,
                        },
                    });

                    return {
                        id: claimRequest.id,
                        status: 'APPROVED' as const,
                        businessId: claimRequest.businessId,
                        businessSlug: claimRequest.business.slug,
                    };
                }

                await tx.businessClaimRequest.update({
                    where: { id: claimRequestId },
                    data: {
                        status: 'REJECTED',
                        notes: reviewNotes ?? claimRequest.notes,
                        reviewedByAdminId: adminUserId,
                        reviewedAt,
                    },
                    select: { id: true },
                });

                await tx.business.update({
                    where: { id: claimRequest.businessId },
                    data: {
                        claimStatus: 'UNCLAIMED',
                    },
                    select: { id: true },
                });

                return {
                    id: claimRequest.id,
                    status: 'REJECTED' as const,
                    businessId: claimRequest.businessId,
                    businessSlug: claimRequest.business.slug,
                };
            });

            this.publishBusinessChangedEvent(
                reviewedClaim.businessId,
                reviewedClaim.businessSlug,
                'updated',
            );

            return reviewedClaim;
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async createAdminCatalogBusiness(dto: CreateAdminCatalogBusinessDto, adminUserId: string) {
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
        const publishedAt = dto.publicStatus === 'PUBLISHED' || !dto.publicStatus ? new Date() : null;
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
                phone: contactChannels.phone ?? null,
                whatsapp: contactChannels.whatsapp ?? null,
                website,
                provinceId: dto.provinceId,
                cityId: dto.cityId,
            },
            dto.ignorePotentialDuplicates,
        );

        try {
            const createdBusiness = await this.prisma.$transaction(async (tx) => {
                await this.assertCityBelongsToProvince(tx, dto.provinceId, dto.cityId);
                await this.assertSectorBelongsToCity(tx, dto.cityId, dto.sectorId);
                const placeholderContext = await this.ensureCatalogPlaceholderContext(tx);

                const business = await tx.business.create({
                    data: {
                        id: randomUUID(),
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
                        ownerId: placeholderContext.ownerId,
                        organizationId: placeholderContext.organizationId,
                        provinceId: dto.provinceId,
                        cityId: dto.cityId ?? null,
                        sectorId: dto.sectorId ?? null,
                        publicStatus: dto.publicStatus ?? 'PUBLISHED',
                        claimStatus: 'UNCLAIMED',
                        source: 'ADMIN',
                        publishedAt,
                        claimedAt: null,
                        claimedByUserId: null,
                        catalogManagedByAdmin: dto.catalogManagedByAdmin ?? true,
                        isClaimable: dto.isClaimable ?? true,
                    },
                    select: {
                        id: true,
                        slug: true,
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
                            source: 'admin-catalog',
                            publicStatus: dto.publicStatus ?? 'PUBLISHED',
                        } as Prisma.InputJsonValue,
                    },
                });

                return business;
            });

            await this.syncBusinessLocation(this.prisma, createdBusiness.id, coordinates.latitude, coordinates.longitude);
            this.publishBusinessChangedEvent(createdBusiness.id, createdBusiness.slug, 'created');

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
                phone: contactChannels.phone ?? null,
                whatsapp: contactChannels.whatsapp ?? null,
                website,
                provinceId: dto.provinceId,
                cityId: dto.cityId,
            },
            dto.ignorePotentialDuplicates,
        );

        try {
            const createdBusiness = await this.prisma.$transaction(async (tx) => {
                await this.assertCityBelongsToProvince(tx, dto.provinceId, dto.cityId);
                await this.assertSectorBelongsToCity(tx, dto.cityId, dto.sectorId);
                const effectiveOrganizationId = organizationId ?? await this.ensureOwnerOrganization(tx, userId);

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
                        publishedAt: new Date(),
                        claimedAt: new Date(),
                        claimedByUserId: userId,
                        catalogManagedByAdmin: false,
                        isClaimable: true,
                    },
                    select: {
                        id: true,
                        slug: true,
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

                // Only promote regular users; never downgrade admin users.
                await tx.user.updateMany({
                    where: { id: userId, role: 'USER' },
                    data: { role: 'BUSINESS_OWNER' },
                });

                return business;
            });

            await this.syncBusinessLocation(this.prisma, createdBusiness.id, coordinates.latitude, coordinates.longitude);

            this.publishBusinessChangedEvent(createdBusiness.id, createdBusiness.slug, 'created');

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
        const duplicateCandidates = findDuplicateCandidates(decoratedBusinesses).slice(0, safeLimit);

        return {
            summary: {
                totalBusinesses: decoratedBusinesses.length,
                incompleteBusinesses: decoratedBusinesses.filter((business) => business.profileCompletenessScore < 80).length,
                duplicateCandidates: duplicateCandidates.length,
                missingSector: decoratedBusinesses.filter((business) => !business.sector).length,
                missingCoordinates: decoratedBusinesses.filter((business) =>
                    typeof business.latitude !== 'number' || typeof business.longitude !== 'number').length,
                unclaimedBusinesses: decoratedBusinesses.filter((business) => business.claimStatus === 'UNCLAIMED').length,
                pendingClaims: decoratedBusinesses.filter((business) => business.claimStatus === 'PENDING_CLAIM').length,
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

    private async ensureCatalogPlaceholderContext(
        tx: Prisma.TransactionClient,
    ): Promise<{ ownerId: string; organizationId: string }> {
        let systemUser = await tx.user.findUnique({
            where: { email: BusinessesService.CATALOG_SYSTEM_USER_EMAIL },
            select: { id: true },
        });

        if (!systemUser) {
            systemUser = await tx.user.create({
                data: {
                    name: 'AquiTa Catalog System',
                    email: BusinessesService.CATALOG_SYSTEM_USER_EMAIL,
                    password: `catalog-${randomUUID()}`,
                    role: 'ADMIN',
                },
                select: { id: true },
            });
        }

        let systemOrganization = await tx.organization.findUnique({
            where: { slug: BusinessesService.CATALOG_SYSTEM_ORG_SLUG },
            select: { id: true },
        });

        if (!systemOrganization) {
            systemOrganization = await tx.organization.create({
                data: {
                    name: 'AquiTa Catalog System',
                    slug: BusinessesService.CATALOG_SYSTEM_ORG_SLUG,
                    ownerUserId: systemUser.id,
                },
                select: { id: true },
            });
        }

        await tx.organizationMember.upsert({
            where: {
                organizationId_userId: {
                    organizationId: systemOrganization.id,
                    userId: systemUser.id,
                },
            },
            update: {
                role: 'OWNER',
            },
            create: {
                organizationId: systemOrganization.id,
                userId: systemUser.id,
                role: 'OWNER',
            },
        });

        await this.ensureOrganizationSubscription(tx, systemOrganization.id);

        return {
            ownerId: systemUser.id,
            organizationId: systemOrganization.id,
        };
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
        search: string,
        options: {
            provinceId?: string;
            cityId?: string;
            limit?: number;
        } = {},
    ) {
        const trimmedSearch = search.trim();
        if (trimmedSearch.length < 2) {
            return [];
        }

        const safeLimit = Math.min(Math.max(options.limit ?? 6, 1), 12);
        const slugQuery = slugify(trimmedSearch, { lower: true, strict: true });
        const normalizedDigits = trimmedSearch.replace(/\D/g, '');
        const normalizedWebsite = this.normalizeWebsiteValue(trimmedSearch);
        const orClauses: Prisma.BusinessWhereInput[] = [
            {
                name: {
                    contains: trimmedSearch,
                    mode: 'insensitive',
                },
            },
            {
                address: {
                    contains: trimmedSearch,
                    mode: 'insensitive',
                },
            },
        ];

        if (slugQuery) {
            orClauses.push({
                slug: {
                    contains: slugQuery,
                },
            });
        }

        if (normalizedDigits.length >= 7) {
            orClauses.push({ phone: normalizedDigits });
            orClauses.push({ whatsapp: normalizedDigits });
        }

        if (normalizedWebsite) {
            orClauses.push({
                website: {
                    contains: normalizedWebsite,
                    mode: 'insensitive',
                },
            });
        }

        const rows = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
                provinceId: options.provinceId,
                cityId: options.cityId,
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
            take: Math.min(safeLimit * 4, 40),
        });

        return rows
            .map((row) => {
                const scoredCandidate = this.scoreClaimSearchCandidate(row, trimmedSearch, normalizedDigits, normalizedWebsite);
                return {
                    ...row,
                    matchType: scoredCandidate.matchType,
                    matchScore: scoredCandidate.score,
                    matchReasons: scoredCandidate.reasons,
                    alreadyClaimed: row.claimStatus === 'CLAIMED',
                };
            })
            .filter((row) => row.matchScore > 0)
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

    private scoreClaimSearchCandidate(
        candidate: {
            name: string;
            address: string;
            phone: string | null;
            whatsapp: string | null;
            website: string | null;
        },
        search: string,
        normalizedDigits: string,
        normalizedWebsite: string | null,
    ): {
        score: number;
        matchType: 'exacta' | 'probable' | 'debil' | null;
        reasons: string[];
    } {
        const normalizedSearch = this.normalizeComparisonValue(search);
        const normalizedCandidateName = this.normalizeComparisonValue(candidate.name);
        const normalizedCandidateAddress = this.normalizeComparisonValue(candidate.address);
        const candidateWebsite = this.normalizeWebsiteValue(candidate.website);
        const reasons = new Set<string>();
        let score = 0;

        if (normalizedSearch && normalizedCandidateName === normalizedSearch) {
            score = Math.max(score, 96);
            reasons.add('nombre_exacto');
        } else if (
            normalizedSearch
            && (
                normalizedCandidateName.includes(normalizedSearch)
                || normalizedSearch.includes(normalizedCandidateName)
            )
        ) {
            score = Math.max(score, 76);
            reasons.add('nombre_similar');
        }

        if (normalizedDigits.length >= 7 && candidate.phone === normalizedDigits) {
            score = Math.max(score, 95);
            reasons.add('telefono');
        }

        if (normalizedDigits.length >= 7 && candidate.whatsapp === normalizedDigits) {
            score = Math.max(score, 92);
            reasons.add('whatsapp');
        }

        if (normalizedWebsite && candidateWebsite === normalizedWebsite) {
            score = Math.max(score, 90);
            reasons.add('website');
        }

        if (normalizedSearch && normalizedCandidateAddress.includes(normalizedSearch)) {
            score = Math.max(score, 62);
            reasons.add('direccion');
        }

        const matchType = score >= 90
            ? 'exacta'
            : score >= 70
                ? 'probable'
                : score > 0
                    ? 'debil'
                    : null;

        return {
            score,
            matchType,
            reasons: [...reasons],
        };
    }

    private async assertNoStrongDuplicateMatch(
        input: {
            name: string;
            phone: string | null;
            whatsapp: string | null;
            website: string | null;
            provinceId: string;
            cityId?: string;
        },
        ignorePotentialDuplicates?: boolean,
    ) {
        if (ignorePotentialDuplicates) {
            return;
        }

        const strongCandidates = await this.findStrongDuplicateCandidates(input);
        if (strongCandidates.length === 0) {
            return;
        }

        throw new ConflictException(
            'Encontramos negocios que parecen duplicados. Revisa las coincidencias y reclama el negocio existente o continua con la opcion explicita de crear de todos modos.',
        );
    }

    private async findStrongDuplicateCandidates(input: {
        name: string;
        phone: string | null;
        whatsapp: string | null;
        website: string | null;
        provinceId: string;
        cityId?: string;
    }) {
        const normalizedName = this.normalizeComparisonValue(input.name);
        const normalizedWebsite = this.normalizeWebsiteValue(input.website);
        const phoneCandidates = [input.phone, input.whatsapp].filter((value): value is string => Boolean(value));
        const orClauses: Prisma.BusinessWhereInput[] = [];

        if (input.name.trim()) {
            orClauses.push({
                name: {
                    contains: input.name.trim(),
                    mode: 'insensitive',
                },
            });
        }

        for (const phoneValue of phoneCandidates) {
            orClauses.push({ phone: phoneValue });
            orClauses.push({ whatsapp: phoneValue });
        }

        if (normalizedWebsite) {
            orClauses.push({
                website: {
                    contains: normalizedWebsite,
                    mode: 'insensitive',
                },
            });
        }

        if (orClauses.length === 0) {
            return [];
        }

        const candidates = await this.prisma.business.findMany({
            where: {
                deletedAt: null,
                provinceId: input.provinceId,
                cityId: input.cityId,
                OR: orClauses,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                phone: true,
                whatsapp: true,
                website: true,
                claimStatus: true,
            },
            take: 12,
        });

        return candidates.filter((candidate) => {
            const sameName = normalizedName.length > 0
                && this.normalizeComparisonValue(candidate.name) === normalizedName;
            const samePhone = phoneCandidates.some((phoneValue) =>
                candidate.phone === phoneValue || candidate.whatsapp === phoneValue);
            const sameWebsite = Boolean(normalizedWebsite)
                && this.normalizeWebsiteValue(candidate.website) === normalizedWebsite;

            return sameName || samePhone || sameWebsite;
        });
    }

    private normalizeComparisonValue(value?: string | null): string {
        return (value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
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
