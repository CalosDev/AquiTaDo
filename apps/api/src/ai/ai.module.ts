import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProviderService } from './ai-provider.service';
import { AiEmbeddingsService } from './ai-embeddings.service';
import { AiIndexingListener } from './ai-indexing.listener';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
    imports: [ObservabilityModule],
    controllers: [AiController],
    providers: [
        AiService,
        AiProviderService,
        AiEmbeddingsService,
        AiIndexingListener,
    ],
    exports: [
        AiService,
        AiProviderService,
        AiEmbeddingsService,
    ],
})
export class AiModule { }
