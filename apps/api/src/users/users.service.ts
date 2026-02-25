import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
    constructor(
        @Inject(PrismaService)
        private prisma: PrismaService,
    ) { }

    async findById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new NotFoundException('Usuario no encontrado');
        }

        return user;
    }

    async findAll() {
        return this.prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
