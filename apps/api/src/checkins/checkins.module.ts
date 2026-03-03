import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckInsController } from './checkins.controller';
import { CheckInsService } from './checkins.service';

@Module({
    imports: [PrismaModule],
    controllers: [CheckInsController],
    providers: [CheckInsService],
    exports: [CheckInsService],
})
export class CheckInsModule { }
