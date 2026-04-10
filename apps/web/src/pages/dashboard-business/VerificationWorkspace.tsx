import type { FormEvent } from 'react';
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
    return (
        <article className="section-shell p-6 lg:col-span-2 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Compliance</p>
                    <h2 className="font-display text-xl font-bold text-slate-900">Verificacion documental</h2>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusClass(verificationStatus?.verificationStatus || 'UNVERIFIED')}`}>
                    {getStatusLabel(verificationStatus?.verificationStatus || 'UNVERIFIED')}
                </span>
            </div>

            {selectedBusiness ? (
                <p className="text-sm text-slate-600">
                    Negocio seleccionado: <strong>{selectedBusiness.name}</strong>
                </p>
            ) : (
                <p className="text-sm text-slate-500">Selecciona un negocio para gestionar su verificacion.</p>
            )}

            <div className="min-h-[6.5rem] space-y-2">
                {showVerificationSkeleton ? (
                    <>
                        <div className="h-4 w-48 animate-pulse rounded-lg bg-slate-100" />
                        <div className="h-4 w-56 animate-pulse rounded-lg bg-slate-100" />
                        <div className="h-11 w-full animate-pulse rounded-xl bg-amber-50" />
                    </>
                ) : (
                    <>
                        {verificationStatus?.verificationSubmittedAt && (
                            <p className="text-xs text-slate-500">
                                Enviado: {formatDateTimeDo(verificationStatus.verificationSubmittedAt)}.
                            </p>
                        )}
                        {verificationStatus?.verificationReviewedAt && (
                            <p className="text-xs text-slate-500">
                                Revisado: {formatDateTimeDo(verificationStatus.verificationReviewedAt)}.
                            </p>
                        )}
                        {verificationStatus?.verificationNotes && (
                            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                Nota: {verificationStatus.verificationNotes}
                            </p>
                        )}
                    </>
                )}
            </div>

            {showVerificationSkeleton ? (
                <>
                    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 min-h-[10.75rem]">
                        <div className="h-5 w-36 animate-pulse rounded-lg bg-slate-100" />
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="h-11 animate-pulse rounded-xl bg-white" />
                            <div className="h-11 animate-pulse rounded-xl bg-white" />
                        </div>
                        <div className="h-10 w-36 animate-pulse rounded-xl bg-primary-100/60" />
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-3 min-h-[9.75rem]">
                        <div className="h-5 w-48 animate-pulse rounded-lg bg-slate-100" />
                        <div className="h-24 animate-pulse rounded-xl bg-white" />
                        <div className="h-10 w-44 animate-pulse rounded-xl bg-slate-200/80" />
                    </div>

                    <div className="rounded-xl border border-gray-100 p-4 min-h-[8.5rem]">
                        <div className="h-5 w-40 animate-pulse rounded-lg bg-slate-100" />
                        <div className="mt-4 space-y-2">
                            <div className="h-16 animate-pulse rounded-xl bg-slate-50" />
                            <div className="h-16 animate-pulse rounded-xl bg-slate-50" />
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <form onSubmit={onUploadDocument} className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 min-h-[10.75rem]">
                        <h3 className="font-semibold text-slate-900">Subir documento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                            <input
                                type="file"
                                className="input-field"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(event) => onFileChange(event.target.files?.[0] || null)}
                                disabled={!selectedBusinessId || saving}
                            />
                        </div>
                        <button type="submit" className="btn-primary text-sm" disabled={!selectedBusinessId || !hasSelectedFile || saving}>
                            {saving ? 'Subiendo...' : 'Subir documento'}
                        </button>
                    </form>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-3 min-h-[9.75rem]">
                        <h3 className="font-semibold text-slate-900">Enviar solicitud de revision</h3>
                        <textarea
                            className="input-field text-sm"
                            rows={3}
                            placeholder="Notas para el equipo de verificacion (opcional)"
                            value={verificationNotes}
                            onChange={(event) => onVerificationNotesChange(event.target.value)}
                            disabled={!selectedBusinessId || saving}
                        />
                        <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={onSubmitBusinessVerification}
                            disabled={!selectedBusinessId || saving}
                        >
                            {saving ? 'Enviando...' : 'Solicitar verificacion'}
                        </button>
                    </div>

                    <div className="rounded-xl border border-gray-100 p-4 min-h-[8.5rem]">
                        <h3 className="font-semibold text-gray-900 mb-3">Historial de documentos</h3>
                        {documents.length === 0 ? (
                            <p className="text-sm text-gray-500">Todavia no has subido documentos.</p>
                        ) : (
                            <div className="space-y-2">
                                {documents.map((document) => (
                                    <div key={document.id} className="rounded-lg border border-gray-100 px-3 py-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-gray-900">{document.documentType}</p>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusClass(document.status)}`}>
                                                {getStatusLabel(document.status)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Subido: {formatDateTimeDo(document.submittedAt)}
                                        </p>
                                        {document.rejectionReason && (
                                            <p className="text-xs text-red-700 mt-1">Motivo: {document.rejectionReason}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </article>
    );
}
