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
import { OrganizationRole, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto, UpdateBusinessDto, BusinessQueryDto, NearbyQueryDto } from './dto/business.dto';
import slugify from 'slugify';
import { getOrganizationPlanLimits } from '../organizations/organization-plan-limits';
import { ReputationService } from '../reputation/reputation.service';
import { RedisService } from '../cache/redis.service';
import { hashedCacheKey } from '../cache/cache-key';
import { DomainEventsService } from '../core/events/domain-events.service';

@Injectable()
export class BusinessesService {
    private readonly logger = new Logger(BusinessesService.name);
    private static readonly PUBLIC_LIST_CACHE_PREFIX = 'public:businesses:list';
    private static readonly NEARBY_CACHE_PREFIX = 'public:businesses:nearby';
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
    ) { }
    private readonly uploadsRoot = path.resolve(process.cwd(), 'uploads');

    private readonly fullInclude = {
        owner: {
            select: { id: true, name: true },
        },
        organization: {
            select: { id: true, name: true, slug: true },
        },
        province: {
            select: { id: true, name: true, slug: true },
        },
        city: {
            select: { id: true, name: true },
        },
        categories: {
            include: {
                category: {
                    select: { id: true, name: true, slug: true, icon: true },
                },
            },
        },
        images: {
            orderBy: { id: Prisma.SortOrder.asc },
        },
        features: {
            include: {
                feature: {
                    select: { id: true, name: true },
                },
            },
        },
        _count: {
            select: { reviews: true },
        },
    };

    private readonly publicListSelect = {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        verified: true,
        verificationStatus: true,
        province: {
            select: { id: true, name: true, slug: true },
        },
        city: {
            select: { id: true, name: true },
        },
        categories: {
            select: {
                category: {
                    select: { id: true, name: true, slug: true, icon: true },
                },
            },
        },
        images: {
            select: { id: true, url: true },
            orderBy: { id: Prisma.SortOrder.asc },
            take: 1,
        },
        _count: {
            select: { reviews: true },
        },
    };

    private readonly adminListSelect = {
        id: true,
        name: true,
        slug: true,
        verified: true,
        verificationStatus: true,
        createdAt: true,
        owner: {
            select: { id: true, name: true },
        },
        organization: {
            select: { id: true, name: true, slug: true },
        },
        province: {
            select: { id: true, name: true, slug: true },
        },
        categories: {
            select: {
                category: {
                    select: { id: true, name: true, slug: true, icon: true },
                },
            },
        },
        images: {
            select: { id: true, url: true },
            orderBy: { id: Prisma.SortOrder.asc },
            take: 1,
        },
        _count: {
            select: { reviews: true },
        },
    };

    private readonly mineListSelect = {
        id: true,
        name: true,
        slug: true,
        verified: true,
        verificationStatus: true,
        _count: {
            select: { reviews: true },
        },
    };

    async findAll(query: BusinessQueryDto) {
        const cacheKey = hashedCacheKey(BusinessesService.PUBLIC_LIST_CACHE_PREFIX, query);
        return this.redisService.rememberJsonStaleWhileRevalidate(cacheKey, 45, 300, async () => {
            const { page, limit, skip } = this.resolvePagination(query.page, query.limit, 12, 24);
            const where = this.buildWhere(query, false);

            const [data, total] = await Promise.all([
                this.prisma.business.findMany({
                    where,
                    select: this.publicListSelect,
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                }),
                this.prisma.business.count({ where }),
            ]);

            return {
                data,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        });
    }

    async findAllAdmin(query: BusinessQueryDto) {
        const { page, limit, skip } = this.resolvePagination(query.page, query.limit, 12, 100);
        const where = this.buildWhere(query, true);

        const [data, total] = await Promise.all([
            this.prisma.business.findMany({
                where,
                select: this.adminListSelect,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.business.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findMine(_userId: string, _userRole: string, organizationId: string) {
        return this.prisma.business.findMany({
            where: { organizationId },
            select: this.mineListSelect,
            orderBy: { createdAt: 'desc' },
        });
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
                return publicBusiness;
            });
        }

        const business = await this.findBusinessByIdWithReviews(id);

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (
            !business.verified &&
            !this.canAccessUnverified(
                business.ownerId,
                business.organizationId,
                userId,
                userRole,
                currentOrganizationId,
            )
        ) {
            throw new NotFoundException('Negocio no encontrado');
        }

        return business;
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
                return publicBusiness;
            });
        }

        const business = await this.findBusinessBySlugWithReviews(slug);

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (
            !business.verified &&
            !this.canAccessUnverified(
                business.ownerId,
                business.organizationId,
                userId,
                userRole,
                currentOrganizationId,
            )
        ) {
            throw new NotFoundException('Negocio no encontrado');
        }

        return business;
    }

    async create(
        dto: CreateBusinessDto,
        userId: string,
        userRole: string,
        organizationId?: string,
        organizationRole?: OrganizationRole,
    ) {
        const baseSlug = slugify(dto.name, { lower: true, strict: true });
        if (!baseSlug) {
            throw new BadRequestException('El nombre del negocio no es válido para generar un slug');
        }

        const slug = await this.generateUniqueSlug(baseSlug);
        const categoryIds = dto.categoryIds ? [...new Set(dto.categoryIds)] : undefined;
        const featureIds = dto.featureIds ? [...new Set(dto.featureIds)] : undefined;

        try {
            const createdBusiness = await this.prisma.$transaction(async (tx) => {
                await this.assertCityBelongsToProvince(tx, dto.provinceId, dto.cityId);
                const effectiveOrganizationId = organizationId ?? await this.ensureOwnerOrganization(tx, userId);

                if (organizationId && userRole !== 'ADMIN') {
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
                        phone: dto.phone,
                        whatsapp: dto.whatsapp,
                        address: dto.address,
                        provinceId: dto.provinceId,
                        cityId: dto.cityId,
                        latitude: dto.latitude,
                        longitude: dto.longitude,
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
                    },
                    include: this.fullInclude,
                });
                await this.syncBusinessLocation(tx, business.id, dto.latitude, dto.longitude);

                // Only promote regular users; never downgrade admin users.
                await tx.user.updateMany({
                    where: { id: userId, role: 'USER' },
                    data: { role: 'BUSINESS_OWNER' },
                });

                return business;
            });

            this.publishBusinessChangedEvent(createdBusiness.id, createdBusiness.slug, 'created');

            return createdBusiness;
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async update(
        id: string,
        dto: UpdateBusinessDto,
        _userId: string,
        userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole,
    ) {
        const categoryIds = dto.categoryIds ? [...new Set(dto.categoryIds)] : undefined;
        const featureIds = dto.featureIds ? [...new Set(dto.featureIds)] : undefined;

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
                        latitude: true,
                        longitude: true,
                    },
                });

                if (!business) {
                    throw new NotFoundException('Negocio no encontrado');
                }

                if (userRole !== 'ADMIN') {
                    if (business.organizationId !== organizationId) {
                        throw new NotFoundException('Negocio no encontrado');
                    }

                    if (organizationRole === 'STAFF') {
                        throw new ForbiddenException('No tienes permisos para editar este negocio');
                    }
                }

                const targetProvinceId = dto.provinceId ?? business.provinceId;
                const targetCityId = dto.cityId ?? business.cityId ?? undefined;
                await this.assertCityBelongsToProvince(tx, targetProvinceId, targetCityId);

                if (categoryIds) {
                    await tx.businessCategory.deleteMany({ where: { businessId: id } });
                }

                if (featureIds) {
                    await tx.businessFeature.deleteMany({ where: { businessId: id } });
                }

                const updatedBusiness = await tx.business.update({
                    where: { id },
                    data: {
                        name: dto.name,
                        description: dto.description,
                        phone: dto.phone,
                        whatsapp: dto.whatsapp,
                        address: dto.address,
                        provinceId: dto.provinceId,
                        cityId: dto.cityId,
                        latitude: dto.latitude,
                        longitude: dto.longitude,
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
                    },
                    include: this.fullInclude,
                });

                const nextLatitude = dto.latitude ?? updatedBusiness.latitude ?? business.latitude ?? undefined;
                const nextLongitude = dto.longitude ?? updatedBusiness.longitude ?? business.longitude ?? undefined;
                await this.syncBusinessLocation(tx, id, nextLatitude, nextLongitude);

                return updatedBusiness;
            });

            this.publishBusinessChangedEvent(updatedBusiness.id, updatedBusiness.slug, 'updated');

            return updatedBusiness;
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async delete(
        id: string,
        _userId: string,
        userRole: string,
        organizationId: string,
        organizationRole: OrganizationRole,
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
            if (business.organizationId !== organizationId) {
                throw new NotFoundException('Negocio no encontrado');
            }

            if (organizationRole === 'STAFF') {
                throw new ForbiddenException('No tienes permisos para eliminar este negocio');
            }
        }

        await this.deleteBusinessImageFiles(business.images.map((image) => image.url));

        try {
            await this.prisma.business.delete({ where: { id } });
            this.publishBusinessChangedEvent(id, business.slug, 'deleted');
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
        return { message: 'Negocio eliminado exitosamente' };
    }

    async findNearby(query: NearbyQueryDto) {
        const cacheKey = hashedCacheKey(BusinessesService.NEARBY_CACHE_PREFIX, query);
        return this.redisService.rememberJson(cacheKey, 60, async () => {
            const radius = query.radius || 5;
            const earthRadiusKm = 6371;
            const latDelta = radius / 111;
            const cosLat = Math.cos((query.lat * Math.PI) / 180);
            const safeCosLat = Math.abs(cosLat) < 0.01 ? 0.01 : cosLat;
            const lngDelta = radius / (111 * safeCosLat);
            const minLat = query.lat - latDelta;
            const maxLat = query.lat + latDelta;
            const minLng = query.lng - lngDelta;
            const maxLng = query.lng + lngDelta;

            // Haversine formula using raw SQL for optimal PostgreSQL performance
            const businesses = await this.prisma.$queryRaw`
      SELECT 
        b.*,
        (
          ${earthRadiusKm} * acos(
            cos(radians(${query.lat})) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians(${query.lng})) +
            sin(radians(${query.lat})) * sin(radians(b.latitude))
          )
        ) AS distance
      FROM businesses b
      WHERE b.verified = true
        AND b."deletedAt" IS NULL
        AND b.latitude IS NOT NULL
        AND b.longitude IS NOT NULL
        AND b.latitude BETWEEN ${minLat} AND ${maxLat}
        AND b.longitude BETWEEN ${minLng} AND ${maxLng}
        AND (
          ${earthRadiusKm} * acos(
            cos(radians(${query.lat})) * cos(radians(b.latitude)) *
            cos(radians(b.longitude) - radians(${query.lng})) +
            sin(radians(${query.lat})) * sin(radians(b.latitude))
          )
        ) <= ${radius}
      ORDER BY distance ASC
      LIMIT 50
    `;

            return businesses;
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
                include: this.fullInclude,
            });

            await this.reputationService.recalculateBusinessReputation(id);
            this.publishBusinessChangedEvent(id, business.slug, 'verified');

            return business;
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
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
        return this.prisma.business.findUnique({
            where: { id },
            include: {
                ...this.fullInclude,
                reviews: {
                    where: {
                        moderationStatus: 'APPROVED',
                        isSpam: false,
                    },
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
    }

    private findBusinessBySlugWithReviews(slug: string) {
        return this.prisma.business.findUnique({
            where: { slug },
            include: {
                ...this.fullInclude,
                reviews: {
                    where: {
                        moderationStatus: 'APPROVED',
                        isSpam: false,
                    },
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
    }

    private findPublicBusinessById(id: string) {
        return this.prisma.business.findFirst({
            where: {
                id,
                verified: true,
            },
            include: {
                ...this.fullInclude,
                reviews: {
                    where: {
                        moderationStatus: 'APPROVED',
                        isSpam: false,
                    },
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
    }

    private findPublicBusinessBySlug(slug: string) {
        return this.prisma.business.findFirst({
            where: {
                slug,
                verified: true,
            },
            include: {
                ...this.fullInclude,
                reviews: {
                    where: {
                        moderationStatus: 'APPROVED',
                        isSpam: false,
                    },
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });
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
            where: { organizationId },
        });

        if (businessCount >= limits.maxBusinesses) {
            throw new BadRequestException(
                'La organización alcanzó el límite de negocios de su plan. Actualiza la suscripción para continuar.',
            );
        }
    }

    private buildWhere(query: BusinessQueryDto, includeUnverified: boolean): Record<string, unknown> {
        const where: Record<string, unknown> = {};

        if (!includeUnverified) {
            where.verified = true;
        } else if (typeof query.verified === 'boolean') {
            where.verified = query.verified;
        }

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
            ];
        }

        if (query.categoryId) {
            where.categories = {
                some: { categoryId: query.categoryId },
            };
        }

        if (query.provinceId) {
            where.provinceId = query.provinceId;
        }

        if (query.cityId) {
            where.cityId = query.cityId;
        }

        return where;
    }

    private resolvePagination(
        rawPage: number | undefined,
        rawLimit: number | undefined,
        defaultLimit: number,
        maxLimit: number,
    ): { page: number; limit: number; skip: number } {
        const page = rawPage && Number.isFinite(rawPage) && rawPage > 0
            ? Math.floor(rawPage)
            : 1;
        const requestedLimit = rawLimit && Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.floor(rawLimit)
            : defaultLimit;
        const limit = Math.min(requestedLimit, maxLimit);
        const skip = (page - 1) * limit;

        return { page, limit, skip };
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

    private canAccessUnverified(
        ownerId: string,
        businessOrganizationId: string,
        userId?: string,
        userRole?: string,
        currentOrganizationId?: string,
    ): boolean {
        if (!userId) {
            return false;
        }

        if (ownerId === userId || userRole === 'ADMIN') {
            return true;
        }

        return currentOrganizationId === businessOrganizationId;
    }
}
