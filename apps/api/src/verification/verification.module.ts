import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReputationModule } from '../reputation/reputation.module';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
    imports: [PrismaModule, ReputationModule],
    controllers: [VerificationController],
    providers: [VerificationService],
    exports: [VerificationService],
})
export class VerificationModule { }
