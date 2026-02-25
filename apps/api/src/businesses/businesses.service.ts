import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusinessDto, UpdateBusinessDto, BusinessQueryDto, NearbyQueryDto } from './dto/business.dto';
import slugify from 'slugify';

@Injectable()
export class BusinessesService {
    constructor(private prisma: PrismaService) { }

    private readonly includeRelations = {
        owner: {
            select: { id: true, name: true },
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

    async findMine(userId: string) {
        return this.prisma.business.findMany({
            where: { ownerId: userId },
            include: this.includeRelations,
            orderBy: { createdAt: 'desc' },
        });
    }

    async findById(id: string, userId?: string, userRole?: string) {
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

        if (!business.verified && !this.canAccessUnverified(business.ownerId, userId, userRole)) {
            throw new NotFoundException('Negocio no encontrado');
        }

        return business;
    }

    async findBySlug(slug: string, userId?: string, userRole?: string) {
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

        if (!business.verified && !this.canAccessUnverified(business.ownerId, userId, userRole)) {
            throw new NotFoundException('Negocio no encontrado');
        }

        return business;
    }

    async create(dto: CreateBusinessDto, userId: string) {
        const baseSlug = slugify(dto.name, { lower: true, strict: true });
        const slug = await this.generateUniqueSlug(baseSlug);

        return this.prisma.$transaction(async (tx) => {
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
                    categories: dto.categoryIds
                        ? {
                            create: dto.categoryIds.map((categoryId) => ({
                                categoryId,
                            })),
                        }
                        : undefined,
                    features: dto.featureIds
                        ? {
                            create: dto.featureIds.map((featureId) => ({
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
    }

    async update(id: string, dto: UpdateBusinessDto, userId: string, userRole: string) {
        return this.prisma.$transaction(async (tx) => {
            const business = await tx.business.findUnique({ where: { id } });

            if (!business) {
                throw new NotFoundException('Negocio no encontrado');
            }

            if (business.ownerId !== userId && userRole !== 'ADMIN') {
                throw new ForbiddenException('No tienes permisos para editar este negocio');
            }

            if (dto.categoryIds) {
                await tx.businessCategory.deleteMany({ where: { businessId: id } });
            }

            if (dto.featureIds) {
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
                    categories: dto.categoryIds
                        ? {
                            create: dto.categoryIds.map((categoryId) => ({
                                categoryId,
                            })),
                        }
                        : undefined,
                    features: dto.featureIds
                        ? {
                            create: dto.featureIds.map((featureId) => ({
                                featureId,
                            })),
                        }
                        : undefined,
                },
                include: this.includeRelations,
            });
        });
    }

    async delete(id: string, userId: string, userRole: string) {
        const business = await this.prisma.business.findUnique({ where: { id } });

        if (!business) {
            throw new NotFoundException('Negocio no encontrado');
        }

        if (business.ownerId !== userId && userRole !== 'ADMIN') {
            throw new ForbiddenException('No tienes permisos para eliminar este negocio');
        }

        await this.prisma.business.delete({ where: { id } });
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
        return this.prisma.business.update({
            where: { id },
            data: { verified: true },
            include: this.includeRelations,
        });
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

    private canAccessUnverified(ownerId: string, userId?: string, userRole?: string): boolean {
        if (!userId) {
            return false;
        }

        return ownerId === userId || userRole === 'ADMIN';
    }
}
