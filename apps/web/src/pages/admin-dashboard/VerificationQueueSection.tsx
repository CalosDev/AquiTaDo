import { AppCard, EmptyState, EntityListItem } from '../../components/ui';
import type { ModerationQueueItem } from './types';

type VerificationQueueSectionProps = {
    items: ModerationQueueItem[];
    processingId: string | null;
    onResolvePreventiveModeration: (
        businessId: string,
        decision: 'APPROVE_FOR_KYC' | 'KEEP_BLOCKED',
    ) => Promise<void>;
    onReviewDocument: (
        documentId: string,
        status: 'APPROVED' | 'REJECTED',
    ) => Promise<void>;
};

export function VerificationQueueSection({
    items,
    processingId,
    onResolvePreventiveModeration,
    onReviewDocument,
}: VerificationQueueSectionProps) {
    return (
        <AppCard
            title="Cola unificada de moderacion"
            description="Casos preventivos, documentos y revision de negocios en una sola vista."
            actions={(
                <span className="text-xs rounded-full px-2 py-0.5 bg-primary-50 text-primary-700">
                    {items.length} items
                </span>
            )}
        >

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {items.length > 0 ? items.map((item) => (
                    <EntityListItem
                        key={item.id}
                        title={`${item.business.name} · ${item.organization.name}`}
                        subtitle={`${item.queueType} · ${new Date(item.createdAt).toLocaleString('es-DO')}`}
                        badge={(
                            <div className="flex items-center gap-2">
                                <span className={`text-xs rounded-full px-2 py-0.5 ${
                                    item.priority === 'HIGH'
                                        ? 'bg-red-100 text-red-700'
                                        : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {item.priority}
                                </span>
                                <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 text-gray-700">
                                    {item.status}
                                </span>
                            </div>
                        )}
                        body={(
                            <>

                        {item.queueType === 'BUSINESS_PREMODERATION' && item.payload?.preventiveReasons?.length ? (
                            <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium">Revision preventiva requerida</p>
                                    {item.payload.preventiveSeverity ? (
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                            item.payload.preventiveSeverity === 'HIGH'
                                                ? 'bg-red-100 text-red-700'
                                                : item.payload.preventiveSeverity === 'MEDIUM'
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {item.payload.preventiveSeverity}
                                        </span>
                                    ) : null}
                                    {item.payload.preventiveScore !== undefined ? (
                                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                                            Score {item.payload.preventiveScore}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-1">{item.payload.preventiveReasons.join(' | ')}</p>
                                {item.payload.preventiveRiskClusters?.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {item.payload.preventiveRiskClusters.map((cluster) => (
                                            <span key={cluster} className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                                                {cluster}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                                {item.payload.preventiveSuggestedActions?.length ? (
                                    <div className="mt-2 rounded-lg bg-white/80 px-3 py-2 text-[11px] text-amber-950">
                                        <p className="font-medium">Sugerencias para corregir</p>
                                        <ul className="mt-1 space-y-1">
                                            {item.payload.preventiveSuggestedActions.map((action) => (
                                                <li key={action}>{action}</li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        className="btn-primary text-xs"
                                        disabled={processingId === item.entityId}
                                        onClick={() => void onResolvePreventiveModeration(item.entityId, 'APPROVE_FOR_KYC')}
                                    >
                                        Enviar a KYC
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        disabled={processingId === item.entityId}
                                        onClick={() => void onResolvePreventiveModeration(item.entityId, 'KEEP_BLOCKED')}
                                    >
                                        Mantener bloqueo
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {item.queueType === 'BUSINESS_VERIFICATION' && item.payload?.verificationNotes ? (
                            <p className="mt-2 text-xs text-gray-600">{item.payload.verificationNotes}</p>
                        ) : null}

                        {item.queueType === 'REVIEW_MODERATION' && item.payload?.moderationReason ? (
                            <p className="mt-2 text-xs text-gray-600">{item.payload.moderationReason}</p>
                        ) : null}

                        {item.queueType === 'DOCUMENT_REVIEW' ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                                <button
                                    type="button"
                                    className="btn-primary text-xs"
                                    disabled={processingId === item.entityId}
                                    onClick={() => void onReviewDocument(item.entityId, 'APPROVED')}
                                >
                                    Aprobar documento
                                </button>
                                <button
                                    type="button"
                                    className="btn-secondary text-xs"
                                    disabled={processingId === item.entityId}
                                    onClick={() => void onReviewDocument(item.entityId, 'REJECTED')}
                                >
                                    Rechazar documento
                                </button>
                            </div>
                        ) : null}
                            </>
                        )}
                    />
                )) : (
                    <EmptyState
                        title="Sin items en la cola"
                        body="Cuando aparezcan nuevos casos de revision, los veras aqui priorizados."
                    />
                )}
            </div>
        </AppCard>
    );
}
