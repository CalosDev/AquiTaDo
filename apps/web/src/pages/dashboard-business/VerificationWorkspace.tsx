import type { FormEvent } from 'react';
import { EmptyState, SectionCard } from '../../components/ui';
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
            return 'La revisión está pausada y necesita atención manual antes de continuar.';
        default:
            return 'Todavía no hay suficiente información cargada para pedir la revisión.';
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
                ? `${documentSummary.total} documento(s) cargado(s) en esta revisión.`
                : 'Sube por lo menos un documento legible antes de pedir revision.',
            done: documentSummary.total > 0,
        },
        {
            label: 'Revision formal enviada',
            detail: verificationStatus?.verificationSubmittedAt
                ? `Enviada el ${formatDateTimeDo(verificationStatus.verificationSubmittedAt)}.`
                : 'Todavía no se ha enviado la solicitud al equipo de revisión.',
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
            <article className="section-shell p-6 lg:col-span-2 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-100" />
                        <div className="h-7 w-64 animate-pulse rounded-full bg-slate-100" />
                    </div>
                    <div className="h-8 w-28 animate-pulse rounded-full bg-slate-100" />
                </div>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)]">
                    <div className="card-section density-compact space-y-3">
                        <div className="h-5 w-40 animate-pulse rounded-full bg-slate-100" />
                        <div className="grid gap-3 sm:grid-cols-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-50" />
                            ))}
                        </div>
                        <div className="h-16 animate-pulse rounded-2xl bg-slate-50" />
                    </div>
                    <div className="space-y-4">
                        <div className="card-filter density-compact space-y-3">
                            <div className="h-5 w-36 animate-pulse rounded-full bg-slate-100" />
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="h-14 animate-pulse rounded-2xl bg-white" />
                            ))}
                        </div>
                        <div className="card-form density-compact space-y-3">
                            <div className="h-5 w-40 animate-pulse rounded-full bg-slate-100" />
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="h-11 animate-pulse rounded-2xl bg-slate-50" />
                                <div className="h-11 animate-pulse rounded-2xl bg-slate-50" />
                            </div>
                            <div className="h-10 w-36 animate-pulse rounded-2xl bg-slate-100" />
                        </div>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article className="section-shell p-6 lg:col-span-2 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Verificación</p>
                    <h2 className="font-display text-xl font-bold text-slate-900">Documentos del negocio</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        Revisa el estado, carga documentos claros y envía la solicitud cuando todo esté listo.
                    </p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${getStatusClass(currentStatus)}`}>
                    {getStatusLabel(currentStatus)}
                </span>
            </div>

            {selectedBusiness ? (
                <p className="text-sm text-slate-600">
                    Negocio seleccionado: <strong>{selectedBusiness.name}</strong>
                </p>
            ) : (
                <p className="text-sm text-slate-500">Selecciona un negocio para gestionar sus documentos.</p>
            )}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.06fr)_minmax(320px,0.94fr)]">
                <SectionCard
                    title="Estado de la revisión"
                    description={getStatusNarrative(currentStatus)}
                    density="compact"
                    actions={(
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusClass(currentStatus)}`}>
                            {getStatusLabel(currentStatus)}
                        </span>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Documentos</p>
                            <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{documentSummary.total}</p>
                            <p className="mt-1 text-xs text-slate-500">
                                {documentSummary.approved} aprobados · {documentSummary.pending} pendientes
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Solicitud</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                                {verificationStatus?.verificationSubmittedAt ? 'Enviado' : 'Sin enviar'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {verificationStatus?.verificationSubmittedAt
                                    ? formatDateTimeDo(verificationStatus.verificationSubmittedAt)
                                    : 'Todavia no se ha solicitado revision'}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Última respuesta</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                                {verificationStatus?.verificationReviewedAt ? 'Revisado' : 'Sin decision'}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {verificationStatus?.verificationReviewedAt
                                    ? formatDateTimeDo(verificationStatus.verificationReviewedAt)
                                    : 'Aun no hay respuesta del equipo'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resumen actual</p>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                                {verificationStatus?.verified
                                    ? 'El negocio ya cuenta con sello de confianza. Solo conserva evidencia actualizada.'
                                    : documentSummary.rejected > 0
                                        ? 'Hay documentos rechazados. Corrige el motivo antes de volver a subir más archivos.'
                                        : documentSummary.total > 0
                                            ? 'Ya hay documentos cargados. Cuando sientas que está completo, envía la solicitud.'
                                            : 'Empieza por los documentos principales del negocio y de la persona responsable.'}
                            </p>
                        </div>

                        {verificationStatus?.verificationNotes ? (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">Comentario del equipo</p>
                                <p className="mt-2 text-sm leading-6 text-amber-900">{verificationStatus.verificationNotes}</p>
                            </div>
                        ) : null}
                    </div>
                </SectionCard>

                <div className="space-y-4">
                    <div className="card-filter density-compact space-y-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Checklist rápido</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                Completa primero lo básico y después envía la solicitud.
                            </p>
                        </div>
                        {checklistItems.map((item) => (
                            <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                <span
                                    className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                        item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                    }`}
                                >
                                    {item.done ? 'OK' : '!'}
                                </span>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <form onSubmit={onUploadDocument} className="card-form density-compact space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Subir documento</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">
                                Usa archivos claros y legibles para que el equipo pueda revisarlos sin retrasos.
                            </p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
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
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="submit" className="btn-primary text-sm" disabled={!selectedBusinessId || !hasSelectedFile || saving}>
                                {saving ? 'Subiendo...' : 'Subir documento'}
                            </button>
                            <p className="text-xs text-slate-500">
                                PDF o imagen clara. El documento queda ligado al negocio activo.
                            </p>
                        </div>
                    </form>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="card-form density-compact space-y-4">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Solicitar revision</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            Haz la solicitud cuando ya tengas cargados los documentos principales.
                        </p>
                    </div>

                    <label className="card-form__group">
                        <span className="card-form__label">Notas para el equipo</span>
                        <textarea
                            className="input-field text-sm"
                            rows={4}
                            placeholder="Explica cualquier detalle útil para ayudar a revisar estos documentos."
                            value={verificationNotes}
                            onChange={(event) => onVerificationNotesChange(event.target.value)}
                            disabled={!selectedBusinessId || saving}
                        />
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Antes de enviar</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                            {documentSummary.total === 0
                                ? 'Todavía no hay documentos cargados. El siguiente paso correcto es subirlos.'
                                : verificationStatus?.verificationSubmittedAt
                                    ? 'Ya existe una solicitud enviada. Vuelve a mandar algo solo si corregiste información.'
                                    : 'Ya tienes una base suficiente. Si todo está claro, puedes pedir la revisión.'}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={onSubmitBusinessVerification}
                            disabled={!selectedBusinessId || saving || documentSummary.total === 0}
                        >
                            {saving ? 'Enviando...' : 'Solicitar verificacion'}
                        </button>
                        <p className="text-xs text-slate-500">
                            {documentSummary.total > 0
                                ? 'El equipo revisará juntos los documentos y estas notas.'
                                : 'Primero se necesita al menos un documento para poder solicitar revision.'}
                        </p>
                    </div>
                </div>

                <SectionCard
                    title="Historial de documentos"
                    description="Revisa lo que ya subiste, su estado y cualquier motivo de rechazo."
                    density="compact"
                >
                    {documents.length === 0 ? (
                        <EmptyState
                            title="Todavia no hay documentos"
                            body="Cuando cargues archivos, aparecerán aquí con su estado."
                        />
                    ) : (
                        <div className="card-list">
                            <div className="card-list__header">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Documentos cargados</p>
                                <p className="text-xs text-slate-500">{documents.length} documento(s)</p>
                            </div>
                            {documents.map((document) => (
                                <div key={document.id} className="card-list__item items-start justify-between">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-900">{getDocumentTypeLabel(document.documentType)}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Subido: {formatDateTimeDo(document.submittedAt)}
                                        </p>
                                        {document.rejectionReason ? (
                                            <p className="mt-2 text-xs leading-5 text-red-700">Motivo: {document.rejectionReason}</p>
                                        ) : null}
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${getStatusClass(document.status)}`}>
                                        {getStatusLabel(document.status)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionCard>
            </div>
        </article>
    );
}
