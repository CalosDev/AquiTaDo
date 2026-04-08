import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppOutboundService } from './whatsapp-outbound.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
    imports: [ObservabilityModule],
    controllers: [WhatsAppController],
    providers: [
        WhatsAppOutboundService,
        WhatsAppService,
    ],
    exports: [
        WhatsAppOutboundService,
        WhatsAppService,
    ],
})
export class WhatsAppModule { }
