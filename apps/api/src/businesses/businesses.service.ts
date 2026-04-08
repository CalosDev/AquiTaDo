import {
    Inject,
    Injectable,
    Logger,
    BadRequestException,
    ConflictException,
    NotFoundException,
    ForbiddenException,
} from '@nestjs/common';
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
    fullBusinessInclude,
    mineListBusinessSelect,
} from './businesses.selects';

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
                verified: true,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
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
        const coordinates = await this.resolveCoordinatesForBusiness({
            address: dto.address,
            provinceId: dto.provinceId,
            cityId: dto.cityId,
            latitude: dto.latitude,
            longitude: dto.longitude,
        });

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
                        name: dto.name,
                        slug,
                        description: dto.description,
                        phone: contactChannels.phone,
                        whatsapp: contactChannels.whatsapp,
                        website,
                        email,
                        instagramUrl,
                        facebookUrl,
                        tiktokUrl,
                        priceRange: dto.priceRange,
                        address: dto.address,
                        provinceId: dto.provinceId,
                        cityId: dto.cityId,
                        sectorId: dto.sectorId,
                        latitude: coordinates.latitude,
                        longitude: coordinates.longitude,
                        ownerId: userId,
                        organizationId: effectiveOrganizationId,
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
                    include: fullBusinessInclude,
                });
                await this.syncBusinessLocation(tx, business.id, coordinates.latitude, coordinates.longitude);

                // Only promote regular users; never downgrade admin users.
                await tx.user.updateMany({
                    where: { id: userId, role: 'USER' },
                    data: { role: 'BUSINESS_OWNER' },
                });

                return business;
            });

            this.publishBusinessChangedEvent(createdBusiness.id, createdBusiness.slug, 'created');

            return decorateBusinessProfile(createdBusiness as Record<string, any>);
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
                    include: fullBusinessInclude,
                });

                const nextLatitude = updatedBusiness.latitude ?? business.latitude ?? undefined;
                const nextLongitude = updatedBusiness.longitude ?? business.longitude ?? undefined;
                await this.syncBusinessLocation(tx, id, nextLatitude, nextLongitude);

                return updatedBusiness;
            });

            this.publishBusinessChangedEvent(updatedBusiness.id, updatedBusiness.slug, 'updated');

            return decorateBusinessProfile(updatedBusiness as Record<string, any>);
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
            include: {
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
                include: fullBusinessInclude,
            });

            await this.reputationService.recalculateBusinessReputation(id);
            this.publishBusinessChangedEvent(id, business.slug, 'verified');

            return decorateBusinessProfile(business as Record<string, any>);
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

        while (await this.prisma.business.findUnique({ where: { slug } })) {
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
            id,
            verified: true,
            deletedAt: null,
        });
    }

    private findPublicBusinessBySlug(slug: string) {
        return this.findBusinessDetail({
            slug,
            verified: true,
            deletedAt: null,
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
