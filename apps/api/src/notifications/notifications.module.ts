import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { NotificationsQueueService } from './notifications.queue.service';

@Module({
    imports: [WhatsAppModule],
    providers: [NotificationsQueueService],
    exports: [NotificationsQueueService],
})
export class NotificationsModule { }

