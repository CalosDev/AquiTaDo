import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReputationModule } from '../reputation/reputation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
    imports: [PrismaModule, ReputationModule, NotificationsModule],
    controllers: [BookingsController],
    providers: [BookingsService],
    exports: [BookingsService],
})
export class BookingsModule { }
