import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    async findAll() {
        const categories = await this.prisma.category.findMany({
            orderBy: [
                { parentId: 'asc' },
                { name: 'asc' },
            ],
            include: {
                parent: {
                    select: { id: true, name: true, slug: true },
                },
                children: {
                    select: { id: true, name: true, slug: true, icon: true },
                    orderBy: { name: 'asc' },
                },
            },
        });

        const publicBusinessCountByCategoryId = await this.resolvePublicBusinessCountByCategoryId(
            categories.map((category) => category.id),
        );

        const childrenByParentId = new Map<string, string[]>();
        for (const category of categories) {
            if (!category.parentId) {
                continue;
            }
            const existing = childrenByParentId.get(category.parentId) ?? [];
            existing.push(category.id);
            childrenByParentId.set(category.parentId, existing);
        }

        return categories.map((category) => {
            const directCount = publicBusinessCountByCategoryId.get(category.id) ?? 0;
            const descendantCount = (childrenByParentId.get(category.id) ?? [])
                .reduce((accumulator, childId) => accumulator + (publicBusinessCountByCategoryId.get(childId) ?? 0), 0);

            return {
                ...category,
                _count: {
                    businesses: directCount + descendantCount,
                },
            };
        });
    }

    async findById(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
            include: {
                parent: {
                    select: { id: true, name: true, slug: true },
                },
                children: {
                    select: { id: true, name: true, slug: true, icon: true },
                    orderBy: { name: 'asc' },
                },
            },
        });

        if (!category) {
            throw new NotFoundException('Categoría no encontrada');
        }

        const publicBusinessCountByCategoryId = await this.resolvePublicBusinessCountByCategoryId([id]);

        return {
            ...category,
            _count: {
                businesses: publicBusinessCountByCategoryId.get(id) ?? 0,
            },
        };
    }

    async create(data: CreateCategoryDto) {
        try {
            await this.assertValidParentReference(data.parentId);
            return await this.prisma.category.create({ data });
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async update(id: string, data: UpdateCategoryDto) {
        try {
            await this.assertValidParentReference(data.parentId, id);
            return await this.prisma.category.update({
                where: { id },
                data,
            });
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async delete(id: string) {
        try {
            const childrenCount = await this.prisma.category.count({
                where: { parentId: id },
            });
            if (childrenCount > 0) {
                throw new BadRequestException('No se puede eliminar una categoria padre con subcategorias activas');
            }
            await this.prisma.category.delete({ where: { id } });
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
        return { message: 'Categoría eliminada exitosamente' };
    }

    private handlePrismaError(error: unknown): void {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
            return;
        }

        if (error.code === 'P2002') {
            throw new ConflictException('Ya existe una categoría con ese nombre o slug');
        }

        if (error.code === 'P2025') {
            throw new NotFoundException('Categoría no encontrada');
        }

        if (error.code === 'P2003') {
            throw new BadRequestException('No se pudo procesar la categoría por referencias inválidas');
        }
    }

    private async resolvePublicBusinessCountByCategoryId(categoryIds: string[]): Promise<Map<string, number>> {
        if (categoryIds.length === 0) {
            return new Map();
        }

        const grouped = await this.prisma.businessCategory.groupBy({
            by: ['categoryId'],
            where: {
                categoryId: { in: categoryIds },
                business: {
                    deletedAt: null,
                    verified: true,
                },
            },
            _count: {
                _all: true,
            },
        });

        return new Map(
            grouped.map((row) => [row.categoryId, row._count._all]),
        );
    }

    private async assertValidParentReference(parentId?: string, categoryId?: string): Promise<void> {
        if (!parentId) {
            return;
        }

        if (categoryId && parentId === categoryId) {
            throw new BadRequestException('Una categoria no puede ser hija de si misma');
        }

        const parent = await this.prisma.category.findUnique({
            where: { id: parentId },
            select: { id: true, parentId: true },
        });

        if (!parent) {
            throw new BadRequestException('La categoria padre no existe');
        }

        if (parent.parentId) {
            throw new BadRequestException('Solo se permite una taxonomia de dos niveles');
        }
    }
}
