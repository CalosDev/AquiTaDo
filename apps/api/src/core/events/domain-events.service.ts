import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

export type DomainEventHandler<TPayload> = (payload: TPayload) => Promise<void> | void;

export type BusinessChangedEvent = {
    businessId: string;
    slug: string | null;
    operation: 'created' | 'updated' | 'verified' | 'deleted';
};

export type CatalogBusinessCreatedEvent = {
    businessId: string;
    slug: string | null;
    source: 'ADMIN' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
    actorUserId: string;
};

export type PotentialDuplicateDetectedEvent = {
    source: string;
    actorUserId?: string | null;
    candidateBusinessIds: string[];
    candidateSlugs: string[];
    reasons: string[];
};

export type ClaimRequestCreatedEvent = {
    claimRequestId: string;
    businessId: string;
    businessSlug: string | null;
    requesterUserId: string;
    requesterOrganizationId?: string | null;
};

export type ClaimRequestReviewedEvent = {
    claimRequestId: string;
    businessId: string;
    businessSlug: string | null;
    status: 'APPROVED' | 'REJECTED';
    requesterUserId: string;
    requesterOrganizationId?: string | null;
    reviewedByAdminId: string;
};

export type BusinessLinkedToOrganizationEvent = {
    businessId: string;
    businessSlug: string | null;
    organizationId: string;
    ownerUserId: string;
    linkedByUserId: string;
};

export type BusinessDuplicatesMergedEvent = {
    duplicateCaseId: string;
    primaryBusinessId: string;
    primaryBusinessSlug: string | null;
    archivedBusinessIds: string[];
    resolvedByAdminId: string;
};

@Injectable()
export class DomainEventsService {
    private readonly logger = new Logger(DomainEventsService.name);
    private readonly emitter = new EventEmitter();

    private emit<TPayload>(eventName: string, payload: TPayload): void {
        setImmediate(() => {
            this.emitter.emit(eventName, payload);
        });
    }

    private on<TPayload>(eventName: string, handler: DomainEventHandler<TPayload>): void {
        this.emitter.on(eventName, (payload: TPayload) => {
            Promise.resolve(handler(payload)).catch((error) => {
                this.logger.warn(
                    `${eventName} handler failed (${error instanceof Error ? error.message : String(error)})`,
                );
            });
        });
    }

    onBusinessChanged(handler: DomainEventHandler<BusinessChangedEvent>): void {
        this.on('business.changed', handler);
    }

    onCatalogBusinessCreated(handler: DomainEventHandler<CatalogBusinessCreatedEvent>): void {
        this.on('business.catalog.created', handler);
    }

    onPotentialDuplicateDetected(handler: DomainEventHandler<PotentialDuplicateDetectedEvent>): void {
        this.on('business.duplicate.detected', handler);
    }

    onClaimRequestCreated(handler: DomainEventHandler<ClaimRequestCreatedEvent>): void {
        this.on('business.claim_request.created', handler);
    }

    onClaimRequestReviewed(handler: DomainEventHandler<ClaimRequestReviewedEvent>): void {
        this.on('business.claim_request.reviewed', handler);
    }

    onBusinessLinkedToOrganization(handler: DomainEventHandler<BusinessLinkedToOrganizationEvent>): void {
        this.on('business.organization.linked', handler);
    }

    onBusinessDuplicatesMerged(handler: DomainEventHandler<BusinessDuplicatesMergedEvent>): void {
        this.on('business.duplicate.merged', handler);
    }

    publishBusinessChanged(payload: BusinessChangedEvent): void {
        this.emit('business.changed', payload);
    }

    publishCatalogBusinessCreated(payload: CatalogBusinessCreatedEvent): void {
        this.emit('business.catalog.created', payload);
    }

    publishPotentialDuplicateDetected(payload: PotentialDuplicateDetectedEvent): void {
        this.emit('business.duplicate.detected', payload);
    }

    publishClaimRequestCreated(payload: ClaimRequestCreatedEvent): void {
        this.emit('business.claim_request.created', payload);
    }

    publishClaimRequestReviewed(payload: ClaimRequestReviewedEvent): void {
        this.emit('business.claim_request.reviewed', payload);
    }

    publishBusinessLinkedToOrganization(payload: BusinessLinkedToOrganizationEvent): void {
        this.emit('business.organization.linked', payload);
    }

    publishBusinessDuplicatesMerged(payload: BusinessDuplicatesMergedEvent): void {
        this.emit('business.duplicate.merged', payload);
    }
}
