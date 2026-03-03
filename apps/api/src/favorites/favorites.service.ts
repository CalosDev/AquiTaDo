import {
    BadRequestException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
    AddBusinessToListDto,
    CreateBusinessListDto,
    ListBusinessListsQueryDto,
    ListFavoriteBusinessesQueryDto,
    ToggleFavoriteBusinessDto,
} from './dto/favorites.dto';

@Injectable()
export class FavoritesService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async listFavoriteBusinesses(
        userId: string,
        query: ListFavoriteBusinessesQueryDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where = {
            userId,
            businessId: query.businessId,
            business: {
                deletedAt: null,
                verified: true,
            },
        };

        const [data, total] = await Promise.all([
            this.prisma.userFavoriteBusiness.findMany({
                where,
                include: {
                    business: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            address: true,
                            province: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                            images: {
                                take: 1,
                                select: {
                                    id: true,
                                    url: true,
                                },
                            },
                            _count: {
                                select: {
                                    reviews: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.userFavoriteBusiness.count({ where }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async toggleFavoriteBusiness(
        userId: string,
        dto: ToggleFavoriteBusinessDto,
    ) {
        const business = await this.prisma.business.findFirst({
            where: {
                id: dto.businessId,
                deletedAt: null,
                verified: true,
            },
            select: {
                id: true,
                slug: true,
                name: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no disponible para favoritos');
        }

        const existing = await this.prisma.userFavoriteBusiness.findUnique({
            where: {
                userId_businessId: {
                    userId,
                    businessId: dto.businessId,
                },
            },
            select: {
                userId: true,
                businessId: true,
            },
        });

        if (existing) {
            await this.prisma.userFavoriteBusiness.delete({
                where: {
                    userId_businessId: {
                        userId,
                        businessId: dto.businessId,
                    },
                },
            });

            return {
                favorite: false,
                business,
            };
        }

        const favorite = await this.prisma.userFavoriteBusiness.create({
            data: {
                userId,
                businessId: dto.businessId,
            },
            include: {
                business: {
                    select: {
                        id: true,
                        slug: true,
                        name: true,
                    },
                },
            },
        });

        return {
            favorite: true,
            favoriteEntry: favorite,
        };
    }

    async listMyBusinessLists(
        userId: string,
        query: ListBusinessListsQueryDto,
    ) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const skip = (page - 1) * limit;

        const where = {
            userId,
            deletedAt: null,
        };

        const [data, total] = await Promise.all([
            this.prisma.userBusinessList.findMany({
                where,
                include: {
                    items: {
                        include: {
                            business: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                    verified: true,
                                    deletedAt: true,
                                    images: {
                                        take: 1,
                                        select: {
                                            id: true,
                                            url: true,
                                        },
                                    },
                                },
                            },
                        },
                        orderBy: { addedAt: 'desc' },
                        take: 20,
                    },
                    _count: {
                        select: {
                            items: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.userBusinessList.count({ where }),
        ]);

        return {
            data: data.map((list) => ({
                ...list,
                items: list.items.filter((item) => item.business.verified && item.business.deletedAt === null),
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async createBusinessList(
        userId: string,
        dto: CreateBusinessListDto,
    ) {
        const normalizedName = dto.name.trim();
        if (!normalizedName) {
            throw new BadRequestException('El nombre de la lista es obligatorio');
        }

        const baseSlug = this.slugify(normalizedName);
        const slug = await this.nextAvailableListSlug(userId, baseSlug);

        return this.prisma.userBusinessList.create({
            data: {
                userId,
                name: normalizedName,
                slug,
                description: dto.description?.trim() || null,
                isPublic: dto.isPublic ?? false,
            },
            include: {
                _count: {
                    select: {
                        items: true,
                    },
                },
            },
        });
    }

    async deleteBusinessList(
        userId: string,
        listId: string,
    ) {
        await this.ensureListOwner(userId, listId);

        await this.prisma.userBusinessList.update({
            where: { id: listId },
            data: { deletedAt: new Date() },
        });

        return {
            ok: true,
            listId,
        };
    }

    async addBusinessToList(
        userId: string,
        listId: string,
        dto: AddBusinessToListDto,
    ) {
        await this.ensureListOwner(userId, listId);

        const business = await this.prisma.business.findFirst({
            where: {
                id: dto.businessId,
                verified: true,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
            },
        });

        if (!business) {
            throw new NotFoundException('Negocio no disponible para guardar en la lista');
        }

        const entry = await this.prisma.userBusinessListItem.upsert({
            where: {
                listId_businessId: {
                    listId,
                    businessId: dto.businessId,
                },
            },
            create: {
                listId,
                businessId: dto.businessId,
            },
            update: {
                addedAt: new Date(),
            },
            include: {
                business: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
                list: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                    },
                },
            },
        });

        return entry;
    }

    async removeBusinessFromList(
        userId: string,
        listId: string,
        businessId: string,
    ) {
        await this.ensureListOwner(userId, listId);

        await this.prisma.userBusinessListItem.deleteMany({
            where: {
                listId,
                businessId,
            },
        });

        return {
            ok: true,
            listId,
            businessId,
        };
    }

    private async ensureListOwner(userId: string, listId: string) {
        const list = await this.prisma.userBusinessList.findFirst({
            where: {
                id: listId,
                userId,
                deletedAt: null,
            },
            select: {
                id: true,
            },
        });

        if (!list) {
            throw new NotFoundException('Lista no encontrada');
        }
    }

    private async nextAvailableListSlug(userId: string, baseSlug: string): Promise<string> {
        let candidateSlug = baseSlug;
        let suffix = 2;

        while (true) {
            const exists = await this.prisma.userBusinessList.findFirst({
                where: {
                    userId,
                    slug: candidateSlug,
                },
                select: {
                    id: true,
                },
            });

            if (!exists) {
                return candidateSlug;
            }

            candidateSlug = `${baseSlug}-${suffix}`;
            suffix += 1;
        }
    }

    private slugify(value: string): string {
        const normalized = value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

        return normalized || 'lista';
    }
}
