import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    async findAll() {
        return this.prisma.category.findMany({
            orderBy: { name: 'asc' },
            include: {
                _count: {
                    select: { businesses: true },
                },
            },
        });
    }

    async findById(id: string) {
        return this.prisma.category.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { businesses: true },
                },
            },
        });
    }

    async create(data: { name: string; slug: string; icon?: string }) {
        return this.prisma.category.create({ data });
    }

    async update(id: string, data: { name?: string; slug?: string; icon?: string }) {
        return this.prisma.category.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        await this.prisma.category.delete({ where: { id } });
        return { message: 'Categoría eliminada exitosamente' };
    }
}
