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
            orderBy: { name: 'asc' },
        });

        const publicBusinessCountByCategoryId = await this.resolvePublicBusinessCountByCategoryId(
            categories.map((category) => category.id),
        );

        return categories.map((category) => ({
            ...category,
            _count: {
                businesses: publicBusinessCountByCategoryId.get(category.id) ?? 0,
            },
        }));
    }

    async findById(id: string) {
        const category = await this.prisma.category.findUnique({
            where: { id },
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
            return await this.prisma.category.create({ data });
        } catch (error) {
            this.handlePrismaError(error);
            throw error;
        }
    }

    async update(id: string, data: UpdateCategoryDto) {
        try {
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
}
