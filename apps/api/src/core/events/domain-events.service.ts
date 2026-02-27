import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type DomainEventHandler<TPayload> = (payload: TPayload) => Promise<void> | void;

export type BusinessChangedEvent = {
    businessId: string;
    slug: string | null;
    operation: 'created' | 'updated' | 'verified' | 'deleted';
};

@Injectable()
export class DomainEventsService {
    private readonly logger = new Logger(DomainEventsService.name);
    private readonly emitter = new EventEmitter();

    onBusinessChanged(handler: DomainEventHandler<BusinessChangedEvent>): void {
        this.emitter.on('business.changed', (payload: BusinessChangedEvent) => {
            Promise.resolve(handler(payload)).catch((error) => {
                this.logger.warn(
                    `business.changed handler failed (${error instanceof Error ? error.message : String(error)})`,
                );
            });
        });
    }

    publishBusinessChanged(payload: BusinessChangedEvent): void {
        setImmediate(() => {
            this.emitter.emit('business.changed', payload);
        });
    }
}

