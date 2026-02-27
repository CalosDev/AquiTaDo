import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [PromotionsController],
    providers: [PromotionsService],
    exports: [PromotionsService],
})
export class PromotionsModule { }
