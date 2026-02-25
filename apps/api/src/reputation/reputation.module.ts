import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';

@Module({
    imports: [PrismaModule],
    controllers: [ReputationController],
    providers: [ReputationService],
    exports: [ReputationService],
})
export class ReputationModule { }
