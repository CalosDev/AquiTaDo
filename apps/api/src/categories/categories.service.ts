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
        const category = await this.prisma.category.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { businesses: true },
                },
            },
        });

        if (!category) {
            throw new NotFoundException('Categoría no encontrada');
        }

        return category;
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
}
