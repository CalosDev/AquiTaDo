import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AiEmbeddingsService } from './ai-embeddings.service';
import { DomainEventsService } from '../core/events/domain-events.service';

/**
 * Keeps semantic projections synchronized after business lifecycle events.
 */
@Injectable()
export class AiIndexingListener implements OnModuleInit {
    constructor(
        @Inject(DomainEventsService)
        private readonly domainEventsService: DomainEventsService,
        @Inject(AiEmbeddingsService)
        private readonly aiEmbeddingsService: AiEmbeddingsService,
    ) { }

    onModuleInit() {
        this.domainEventsService.onBusinessChanged(async (event) => {
            if (event.operation === 'deleted') {
                await this.aiEmbeddingsService.removeBusinessEmbedding(event.businessId);
                return;
            }

            await this.aiEmbeddingsService.upsertBusinessEmbedding(event.businessId);
        });
    }
}

