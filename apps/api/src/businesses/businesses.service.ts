import {
    Inject,
    Injectable,
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

@Injectable()
export class BusinessesService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    private readonly includeRelations = {
        owner: {
            select: { id: true, name: true },
        },
        organization: {
            select: { id: true, name: true, slug: true },
        },
        province: true,
        city: true,
        categories: {
            include: { category: true },
        },
        images: true,
        features: {
            include: { feature: true },
        },
        _count: {
            select: { reviews: true },
        },
    };

    async findAll(query: BusinessQueryDto) {
        const page = query.page || 1;
        const limit = query.limit || 12;
        const skip = (page - 1) * limit;
        const where = this.buildWhere(query, false);

        const [data, total] = await Promise.all([
            this.prisma.business.findMany({
                where,
                include: this.includeRelations,
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

    async findAllAdmin(query: BusinessQueryDto) {
        const page = query.page || 1;
        const limit = query.limit || 12;
        const skip = (page - 1) * limit;
        const where = this.buildWhere(query, true);

        const [data, total] = await Promise.all([
            this.prisma.business.findMany({
                where,
                include: this.includeRelations,
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
            include: this.includeRelations,
            orderBy: { createdAt: 'desc' },
        });
    }

    async findById(
        id: string,
        userId?: string,
        userRole?: string,
        currentOrganizationId?: string,
    ) {
        const business = await this.prisma.business.findUnique({
            where: { id },
            include: {
                ...this.includeRelations,
                reviews: {
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

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
        const business = await this.prisma.business.findUnique({
            where: { slug },
            include: {
                ...this.includeRelations,
                reviews: {
                    include: {
                        user: { select: { id: true, name: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                },
            },
        });

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
            return await this.prisma.$transaction(async (tx) => {
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
                    include: this.includeRelations,
                });

                // Only promote regular users; never downgrade admin users.
                await tx.user.updateMany({
                    where: { id: userId, role: 'USER' },
                    data: { role: 'BUSINESS_OWNER' },
                });

                return business;
            });
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
            return await this.prisma.$transaction(async (tx) => {
                const business = await tx.business.findUnique({
                    where: { id },
                    select: {
                        id: true,
                        ownerId: true,
                        organizationId: true,
                        provinceId: true,
                        cityId: true,
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

                return tx.business.update({
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
                    include: this.includeRelations,
                });
            });
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
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
        return { message: 'Negocio eliminado exitosamente' };
    }

    async findNearby(query: NearbyQueryDto) {
        const radius = query.radius || 5;
        const earthRadiusKm = 6371;

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
        AND b.latitude IS NOT NULL
        AND b.longitude IS NOT NULL
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
    }

    async verify(id: string) {
        try {
            return await this.prisma.business.update({
                where: { id },
                data: { verified: true },
                include: this.includeRelations,
            });
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

        return organization.id;
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
                try {
                    await fs.unlink(absolutePath);
                } catch (error) {
                    const code = (error as NodeJS.ErrnoException).code;
                    if (code !== 'ENOENT') {
                        throw error;
                    }
                }
            }),
        );
    }

    private resolveUploadPath(assetUrl: string): string {
        const relativePath = assetUrl.replace(/^\/+/, '');
        return path.join(process.cwd(), relativePath);
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
