import { Inject, Injectable } from '@nestjs/common';
import { BaseRepository } from '../core/persistence/base.repository';
import { Business } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessRepository extends BaseRepository<Business> {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) {
        super(prisma.business);
    }
}

