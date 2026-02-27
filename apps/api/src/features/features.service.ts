import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeaturesService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    async findAll() {
        return this.prisma.feature.findMany({
            orderBy: { name: 'asc' },
        });
    }
}
