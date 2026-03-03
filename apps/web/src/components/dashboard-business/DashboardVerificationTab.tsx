import type { Dispatch, FormEvent, SetStateAction } from 'react';

interface BusinessOption {
    id: string;
    name: string;
}

interface VerificationDocument {
    id: string;
    documentType: 'ID_CARD' | 'TAX_CERTIFICATE' | 'BUSINESS_LICENSE' | 'ADDRESS_PROOF' | 'SELFIE' | 'OTHER';
    fileUrl: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    rejectionReason?: string | null;
    submittedAt: string;
    business: {
        id: string;
        name: string;
        verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
        verified: boolean;
    };
}

interface BusinessVerificationStatusPayload {
    id: string;
    name: string;
    verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
    verified: boolean;
    verifiedAt?: string | null;
    verificationSubmittedAt?: string | null;
    verificationReviewedAt?: string | null;
    verificationNotes?: string | null;
    riskScore: number;
    verificationDocuments: VerificationDocument[];
}

interface VerificationForm {
    documentType: VerificationDocument['documentType'];
    fileUrl: string;
    notes: string;
}

interface DashboardVerificationTabProps {
    selectedVerificationBusinessId: string;
    setSelectedVerificationBusinessId: Dispatch<SetStateAction<string>>;
    businesses: BusinessOption[];
    verificationForm: VerificationForm;
    setVerificationForm: Dispatch<SetStateAction<VerificationForm>>;
    handleSubmitVerificationDocument: (event: FormEvent) => Promise<void>;
    uploadingVerificationDocument: boolean;
    submittingBusinessVerification: boolean;
    handleSubmitBusinessVerification: () => Promise<void>;
    verificationLoading: boolean;
    verificationStatus: BusinessVerificationStatusPayload | null;
    verificationDocuments: VerificationDocument[];
    formatDateTime: (value?: string | null) => string;
}

export function DashboardVerificationTab({
    selectedVerificationBusinessId,
    setSelectedVerificationBusinessId,
    businesses,
    verificationForm,
    setVerificationForm,
    handleSubmitVerificationDocument,
    uploadingVerificationDocument,
    submittingBusinessVerification,
    handleSubmitBusinessVerification,
    verificationLoading,
    verificationStatus,
    verificationDocuments,
    formatDateTime,
}: DashboardVerificationTabProps) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-5 xl:col-span-1">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">KYC negocio</h3>
                <div className="space-y-3">
                    <select
                        className="input-field text-sm"
                        value={selectedVerificationBusinessId}
                        onChange={(event) => setSelectedVerificationBusinessId(event.target.value)}
                    >
                        <option value="">Selecciona negocio</option>
                        {businesses.map((business) => (
                            <option key={business.id} value={business.id}>{business.name}</option>
                        ))}
                    </select>

                    <select
                        className="input-field text-sm"
                        value={verificationForm.documentType}
                        onChange={(event) =>
                            setVerificationForm((previous) => ({
                                ...previous,
                                documentType: event.target.value as VerificationDocument['documentType'],
                            }))
                        }
                    >
                        <option value="ID_CARD">CÃ©dula/ID</option>
                        <option value="TAX_CERTIFICATE">RNC/Certificado fiscal</option>
                        <option value="BUSINESS_LICENSE">Licencia comercial</option>
                        <option value="ADDRESS_PROOF">Comprobante direcciÃ³n</option>
                        <option value="SELFIE">Selfie validaciÃ³n</option>
                        <option value="OTHER">Otro</option>
                    </select>

                    <form onSubmit={(event) => void handleSubmitVerificationDocument(event)} className="space-y-2">
                        <input
                            className="input-field text-sm"
                            placeholder="URL del documento"
                            value={verificationForm.fileUrl}
                            onChange={(event) =>
                                setVerificationForm((previous) => ({
                                    ...previous,
                                    fileUrl: event.target.value,
                                }))
                            }
                        />
                        <button type="submit" className="btn-secondary text-sm" disabled={uploadingVerificationDocument}>
                            {uploadingVerificationDocument ? 'Subiendo...' : 'Subir documento'}
                        </button>
                    </form>

                    <textarea
                        className="input-field text-sm"
                        rows={3}
                        placeholder="Notas de revisiÃ³n (opcional)"
                        value={verificationForm.notes}
                        onChange={(event) =>
                            setVerificationForm((previous) => ({
                                ...previous,
                                notes: event.target.value,
                            }))
                        }
                    />
                    <button
                        type="button"
                        className="btn-primary text-sm"
                        disabled={submittingBusinessVerification || !selectedVerificationBusinessId}
                        onClick={() => void handleSubmitBusinessVerification()}
                    >
                        {submittingBusinessVerification ? 'Enviando...' : 'Enviar a revisiÃ³n'}
                    </button>
                </div>
            </div>

            <div className="card p-5 xl:col-span-2">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Estado y documentos</h3>
                {verificationLoading ? (
                    <p className="text-sm text-gray-500">Cargando informaciÃ³n de verificaciÃ³n...</p>
                ) : (
                    <div className="space-y-4">
                        {verificationStatus ? (
                            <div className="rounded-xl border border-gray-100 p-3 text-sm space-y-1">
                                <p>
                                    Estado: <strong>{verificationStatus.verificationStatus}</strong>
                                </p>
                                <p>
                                    Verificado: <strong>{verificationStatus.verified ? 'SÃ­' : 'No'}</strong>
                                </p>
                                <p>
                                    Riesgo: <strong>{verificationStatus.riskScore}/100</strong>
                                </p>
                                {verificationStatus.verificationNotes && (
                                    <p className="text-gray-600">{verificationStatus.verificationNotes}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">Selecciona un negocio para ver su estado.</p>
                        )}

                        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                            {verificationDocuments.length > 0 ? (
                                verificationDocuments.map((document) => (
                                    <div key={document.id} className="rounded-xl border border-gray-100 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-medium text-gray-900">
                                                {document.documentType}
                                            </p>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                                {document.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            {document.business.name} Â· {formatDateTime(document.submittedAt)}
                                        </p>
                                        <a
                                            href={document.fileUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-primary-700 underline"
                                        >
                                            Ver documento
                                        </a>
                                        {document.rejectionReason && (
                                            <p className="text-xs text-red-600 mt-1">{document.rejectionReason}</p>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">No hay documentos cargados.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
