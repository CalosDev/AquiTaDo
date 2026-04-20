import type { FormEvent } from 'react';
import {
    ClaimStatusBanner,
    DocumentUploadCard,
    KPIHeader,
    NextStepCard,
    PendingReviewPanel,
    PageShell,
    TimelineBlock,
    VerificationChecklist,
} from '../../components/ui';
import { formatDateTimeDo } from '../../lib/market';

type VerificationToneStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'APPROVED';

type DashboardBusinessSummary = {
    name: string;
} | null;

type VerificationDocument = {
    id: string;
    documentType: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    submittedAt: string;
    rejectionReason?: string | null;
};

type BusinessVerificationStatus = {
    verificationStatus: VerificationToneStatus;
    verified: boolean;
    verificationSubmittedAt?: string | null;
    verificationReviewedAt?: string | null;
    verificationNotes?: string | null;
} | null;

const DOCUMENT_TYPE_OPTIONS = [
    { value: 'ID_CARD', label: 'Cedula' },
    { value: 'TAX_CERTIFICATE', label: 'RNC' },
    { value: 'BUSINESS_LICENSE', label: 'Licencia comercial' },
    { value: 'ADDRESS_PROOF', label: 'Comprobante de direccion' },
    { value: 'SELFIE', label: 'Selfie' },
    { value: 'OTHER', label: 'Otro' },
] as const;

interface VerificationWorkspaceProps {
    selectedBusiness: DashboardBusinessSummary;
    selectedBusinessId: string;
    showVerificationSkeleton: boolean;
    verificationStatus: BusinessVerificationStatus;
    documents: VerificationDocument[];
    documentType: string;
    hasSelectedFile: boolean;
    verificationNotes: string;
    saving: boolean;
    onDocumentTypeChange: (value: string) => void;
    onFileChange: (file: File | null) => void;
    onVerificationNotesChange: (value: string) => void;
    onUploadDocument: (event: FormEvent<HTMLFormElement>) => void;
    onSubmitBusinessVerification: () => void;
    getStatusClass: (status: VerificationToneStatus | 'PENDING' | 'REJECTED') => string;
    getStatusLabel: (status: VerificationToneStatus | 'PENDING' | 'REJECTED') => string;
}

function getStatusNarrative(status: VerificationToneStatus): string {
    switch (status) {
        case 'VERIFIED':
            return 'El negocio ya fue aprobado. Solo debes mantener los documentos actualizados.';
        case 'PENDING':
            return 'La solicitud ya fue enviada. Ahora toca esperar respuesta o corregir observaciones.';
        case 'REJECTED':
            return 'Hay observaciones pendientes. Revisa el motivo, corrige evidencia y vuelve a enviar.';
        case 'SUSPENDED':
            return 'La revision esta pausada y necesita atencion manual antes de continuar.';
        default:
            return 'Todavia no hay suficiente informacion cargada para pedir la revision.';
    }
}

function getDocumentTypeLabel(documentType: string): string {
    return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.label || documentType;
}

export function VerificationWorkspace({
    selectedBusiness,
    selectedBusinessId,
    showVerificationSkeleton,
    verificationStatus,
    documents,
    documentType,
    hasSelectedFile,
    verificationNotes,
    saving,
    onDocumentTypeChange,
    onFileChange,
    onVerificationNotesChange,
    onUploadDocument,
    onSubmitBusinessVerification,
    getStatusClass,
    getStatusLabel,
}: VerificationWorkspaceProps) {
    const currentStatus = verificationStatus?.verificationStatus || 'UNVERIFIED';
    const documentSummary = documents.reduce(
        (summary, document) => {
            summary.total += 1;
            if (document.status === 'APPROVED') {
                summary.approved += 1;
            } else if (document.status === 'REJECTED') {
                summary.rejected += 1;
            } else {
                summary.pending += 1;
            }
            return summary;
        },
        { total: 0, approved: 0, pending: 0, rejected: 0 },
    );

    const checklistItems = [
        {
            label: 'Negocio activo',
            detail: selectedBusiness ? selectedBusiness.name : 'Selecciona un negocio antes de mover evidencia.',
            done: Boolean(selectedBusinessId),
        },
        {
            label: 'Evidencia cargada',
            detail: documentSummary.total > 0
                ? `${documentSummary.total} documento(s) cargado(s) en esta revision.`
                : 'Sube por lo menos un documento legible antes de pedir revision.',
            done: documentSummary.total > 0,
        },
        {
            label: 'Revision formal enviada',
            detail: verificationStatus?.verificationSubmittedAt
                ? `Enviada el ${formatDateTimeDo(verificationStatus.verificationSubmittedAt)}.`
                : 'Todavia no se ha enviado la solicitud al equipo de revision.',
            done: Boolean(verificationStatus?.verificationSubmittedAt),
        },
        {
            label: 'Resultado final',
            detail: verificationStatus?.verified
                ? 'El negocio ya aparece como verificado.'
                : 'Aun no hay una aprobacion final para este negocio.',
            done: Boolean(verificationStatus?.verified),
        },
    ];

    if (showVerificationSkeleton) {
        return (
            <PageShell className="space-y-5 p-6" width="full">
                <div className="space-y-2">
                    <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-8 w-72 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <div className="h-3 w-20 animate-pulse rounded-full bg-slate-100" />
                            <div className="mt-3 h-7 w-24 animate-pulse rounded-full bg-slate-100" />
                            <div className="mt-2 h-3 w-32 animate-pulse rounded-full bg-slate-100" />
                        </div>
                    ))}
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)]">
                    <div className="h-72 animate-pulse rounded-[28px] bg-slate-100" />
                    <div className="space-y-4">
                        <div className="h-64 animate-pulse rounded-[28px] bg-slate-100" />
                        <div className="h-56 animate-pulse rounded-[28px] bg-slate-100" />
                    </div>
                </div>
            </PageShell>
        );
    }

    const nextStepMessage = verificationStatus?.verified
        ? 'Tu siguiente paso es mantener la evidencia al dia cuando cambien documentos o titularidad.'
        : documentSummary.rejected > 0
            ? 'Corrige los documentos observados y vuelve a subir una version clara antes de reenviar.'
            : documentSummary.total > 0
                ? 'Ya tienes base para solicitar revision. Revisa las notas y envia cuando todo este claro.'
                : 'Empieza subiendo los documentos principales del negocio y de la persona responsable.';

    return (
        <PageShell className="space-y-6 p-6" width="full">
            <KPIHeader
                eyebrow="Verificacion"
                title="Documentos del negocio"
                description="Revisa el estado, carga evidencia clara y envia la solicitud cuando todo este listo."
                actions={(
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusClass(currentStatus)}`}>
                        {getStatusLabel(currentStatus)}
                    </span>
                )}
                metrics={[
                    {
                        label: 'Documentos',
                        value: documentSummary.total,
                        delta: `${documentSummary.approved} aprobados | ${documentSummary.pending} pendientes`,
                    },
                    {
                        label: 'Solicitud',
                        value: verificationStatus?.verificationSubmittedAt ? 'Enviada' : 'Sin enviar',
                        delta: verificationStatus?.verificationSubmittedAt
                            ? formatDateTimeDo(verificationStatus.verificationSubmittedAt)
                            : 'Todavia no se ha solicitado revision',
                    },
                    {
                        label: 'Ultima respuesta',
                        value: verificationStatus?.verificationReviewedAt ? 'Revisada' : 'Sin decision',
                        delta: verificationStatus?.verificationReviewedAt
                            ? formatDateTimeDo(verificationStatus.verificationReviewedAt)
                            : 'Aun no hay respuesta del equipo',
                    },
                ]}
            />

            {selectedBusiness ? (
                <p className="text-sm text-slate-600">
                    Negocio seleccionado: <strong>{selectedBusiness.name}</strong>
                </p>
            ) : (
                <p className="text-sm text-slate-500">Selecciona un negocio para gestionar sus documentos.</p>
            )}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)]">
                <ClaimStatusBanner
                    title="Estado de la revision"
                    description={getStatusNarrative(currentStatus)}
                    statusLabel={getStatusLabel(currentStatus)}
                    statusClassName={getStatusClass(currentStatus)}
                    summary={(
                        verificationStatus?.verified
                            ? 'El negocio ya cuenta con sello de confianza. Solo conserva evidencia actualizada.'
                            : documentSummary.rejected > 0
                                ? 'Hay documentos rechazados. Corrige el motivo antes de volver a subir mas archivos.'
                                : documentSummary.total > 0
                                    ? 'Ya hay documentos cargados. Cuando sientas que esta completo, envia la solicitud.'
                                    : 'Empieza por los documentos principales del negocio y de la persona responsable.'
                    )}
                    note={verificationStatus?.verificationNotes || undefined}
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Aprobados</p>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{documentSummary.approved}</p>
                            <p className="mt-1 text-xs text-slate-500">Documentos listos para la revision final</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Pendientes</p>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{documentSummary.pending}</p>
                            <p className="mt-1 text-xs text-slate-500">Aun deben recibir decision del equipo</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Observados</p>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{documentSummary.rejected}</p>
                            <p className="mt-1 text-xs text-slate-500">Necesitan ajuste antes de reenviar</p>
                        </div>
                    </div>
                </ClaimStatusBanner>

                <div className="space-y-4">
                    <VerificationChecklist items={checklistItems} />

                    <DocumentUploadCard
                        footer={(
                            <div className="flex flex-wrap items-center gap-3">
                                <button type="submit" form="verification-document-form" className="btn-primary text-sm" disabled={!selectedBusinessId || !hasSelectedFile || saving}>
                                    {saving ? 'Subiendo...' : 'Subir documento'}
                                </button>
                                <p className="text-xs text-slate-500">
                                    PDF o imagen clara. El documento queda ligado al negocio activo.
                                </p>
                            </div>
                        )}
                    >
                        <form id="verification-document-form" onSubmit={onUploadDocument} className="grid gap-3 md:grid-cols-2">
                            <label className="card-form__group">
                                <span className="card-form__label">Tipo de documento</span>
                                <select
                                    className="input-field"
                                    value={documentType}
                                    onChange={(event) => onDocumentTypeChange(event.target.value)}
                                    disabled={!selectedBusinessId || saving}
                                >
                                    {DOCUMENT_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="card-form__group">
                                <span className="card-form__label">Archivo</span>
                                <input
                                    type="file"
                                    className="input-field"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                                    onChange={(event) => onFileChange(event.target.files?.[0] || null)}
                                    disabled={!selectedBusinessId || saving}
                                />
                            </label>
                        </form>
                    </DocumentUploadCard>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="space-y-4">
                    <PendingReviewPanel
                        summaryBody={(
                            documentSummary.total === 0
                                ? 'Todavia no hay documentos cargados. El siguiente paso correcto es subirlos.'
                                : verificationStatus?.verificationSubmittedAt
                                    ? 'Ya existe una solicitud enviada. Vuelve a mandar algo solo si corregiste informacion.'
                                    : 'Ya tienes una base suficiente. Si todo esta claro, puedes pedir la revision.'
                        )}
                        action={(
                            <div className="space-y-4">
                                <label className="card-form__group">
                                    <span className="card-form__label">Notas para el equipo</span>
                                    <textarea
                                        className="input-field text-sm"
                                        rows={4}
                                        placeholder="Explica cualquier detalle util para ayudar a revisar estos documentos."
                                        value={verificationNotes}
                                        onChange={(event) => onVerificationNotesChange(event.target.value)}
                                        disabled={!selectedBusinessId || saving}
                                    />
                                </label>
                                <button
                                    type="button"
                                    className="btn-secondary text-sm"
                                    onClick={onSubmitBusinessVerification}
                                    disabled={!selectedBusinessId || saving || documentSummary.total === 0}
                                >
                                    {saving ? 'Enviando...' : 'Solicitar verificacion'}
                                </button>
                            </div>
                        )}
                        supportingCopy={documentSummary.total > 0
                            ? 'El equipo revisara juntos los documentos y estas notas.'
                            : 'Primero se necesita al menos un documento para poder solicitar revision.'}
                    />

                    <NextStepCard
                        title="Siguiente paso recomendado"
                        body={nextStepMessage}
                    />
                </div>

                <TimelineBlock
                    title="Historial de documentos"
                    description="Revisa lo que ya subiste, su estado y cualquier motivo de rechazo."
                    items={documents.map((document) => ({
                        id: document.id,
                        title: getDocumentTypeLabel(document.documentType),
                        meta: `Subido: ${formatDateTimeDo(document.submittedAt)}`,
                        body: document.rejectionReason ? `Motivo: ${document.rejectionReason}` : undefined,
                        badge: (
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${getStatusClass(document.status)}`}>
                                {getStatusLabel(document.status)}
                            </span>
                        ),
                    }))}
                    emptyTitle="Todavia no hay documentos"
                    emptyBody="Cuando cargues archivos, apareceran aqui con su estado."
                />
            </div>
        </PageShell>
    );
}
