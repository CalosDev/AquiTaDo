import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AnalyticsController } from './analytics.controller';
import { EventTrackingController } from './event-tracking.controller';
import { AnalyticsService } from './analytics.service';

@Module({
    imports: [PrismaModule],
    controllers: [AnalyticsController, EventTrackingController],
    providers: [AnalyticsService],
    exports: [AnalyticsService],
})
export class AnalyticsModule { }
