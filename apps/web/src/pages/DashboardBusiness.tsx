import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, businessApi, verificationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useOrganization } from '../context/useOrganization';
import { formatCurrencyDo, formatDateTimeDo } from '../lib/market';

type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

interface BusinessItem {
    id: string;
    name: string;
    verified?: boolean;
}

interface DashboardMetrics {
    totals?: {
        views?: number;
        clicks?: number;
        conversions?: number;
        grossRevenue?: number;
        conversionRate?: number;
    };
}

interface VerificationDocument {
    id: string;
    documentType: 'ID_CARD' | 'TAX_CERTIFICATE' | 'BUSINESS_LICENSE' | 'ADDRESS_PROOF' | 'SELFIE' | 'OTHER';
    fileUrl: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    submittedAt: string;
    rejectionReason?: string | null;
    business?: {
        id: string;
        name: string;
    };
}

interface BusinessVerificationStatus {
    id: string;
    verificationStatus: VerificationStatus;
    verified: boolean;
    verificationSubmittedAt?: string | null;
    verificationReviewedAt?: string | null;
    verificationNotes?: string | null;
}

function asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) {
        return value as T[];
    }
    if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
        return (value as { data: T[] }).data;
    }
    return [];
}

function getStatusLabel(status: VerificationStatus | 'APPROVED' | 'REJECTED' | 'PENDING'): string {
    switch (status) {
        case 'VERIFIED':
        case 'APPROVED':
            return 'Aprobado';
        case 'PENDING':
            return 'Pendiente';
        case 'REJECTED':
            return 'Rechazado';
        case 'SUSPENDED':
            return 'Suspendido';
        default:
            return 'Sin enviar';
    }
}

function getStatusClass(status: VerificationStatus | 'APPROVED' | 'REJECTED' | 'PENDING'): string {
    switch (status) {
        case 'VERIFIED':
        case 'APPROVED':
            return 'bg-green-100 text-green-700';
        case 'PENDING':
            return 'bg-amber-100 text-amber-700';
        case 'REJECTED':
            return 'bg-red-100 text-red-700';
        case 'SUSPENDED':
            return 'bg-gray-200 text-gray-700';
        default:
            return 'bg-gray-100 text-gray-700';
    }
}

export function DashboardBusiness() {
    const { activeOrganizationId, loading: organizationLoading, organizations } = useOrganization();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
    const [selectedBusinessId, setSelectedBusinessId] = useState('');
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

    const [verificationStatus, setVerificationStatus] = useState<BusinessVerificationStatus | null>(null);
    const [documents, setDocuments] = useState<VerificationDocument[]>([]);
    const [documentType, setDocumentType] = useState<VerificationDocument['documentType']>('ID_CARD');
    const [verificationNotes, setVerificationNotes] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const selectedBusiness = useMemo(
        () => businesses.find((business) => business.id === selectedBusinessId) || null,
        [businesses, selectedBusinessId],
    );
    const hasOrganizations = organizations.length > 0;
    const needsFirstBusinessSetup = !organizationLoading && !activeOrganizationId && !hasOrganizations;

    const totals = metrics?.totals ?? {};

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const [businessesRes, metricsRes] = await Promise.all([
                businessApi.getMine(),
                analyticsApi.getMyDashboard({ days: 30 }),
            ]);

            const nextBusinesses = asArray<BusinessItem>(businessesRes.data);
            setBusinesses(nextBusinesses);
            setMetrics((metricsRes.data || null) as DashboardMetrics | null);

            setSelectedBusinessId((current) => {
                if (current && nextBusinesses.some((business) => business.id === current)) {
                    return current;
                }
                return nextBusinesses[0]?.id || '';
            });
        } catch (error) {
            const message = getApiErrorMessage(error, 'No se pudo cargar el panel del negocio');
            if (message.toLowerCase().includes('organizacion activa') || message.toLowerCase().includes('organización activa')) {
                setBusinesses([]);
                setMetrics(null);
                setSelectedBusinessId('');
                setVerificationStatus(null);
                setDocuments([]);
                setErrorMessage('');
            } else {
                setErrorMessage(message);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const loadVerificationData = useCallback(async (businessId: string) => {
        if (!businessId) {
            setVerificationStatus(null);
            setDocuments([]);
            return;
        }

        try {
            const [statusRes, documentsRes] = await Promise.all([
                verificationApi.getBusinessStatus(businessId),
                verificationApi.getMyDocuments({ businessId, limit: 50 }),
            ]);

            const statusPayload = (statusRes.data || null) as BusinessVerificationStatus | null;
            const allDocuments = asArray<VerificationDocument>(documentsRes.data);
            setVerificationStatus(statusPayload);
            setDocuments(
                allDocuments.filter((document) => {
                    if (!document.business?.id) {
                        return true;
                    }
                    return document.business.id === businessId;
                }),
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la verificacion documental'));
        }
    }, []);

    useEffect(() => {
        if (organizationLoading) {
            return;
        }

        if (!activeOrganizationId) {
            setLoading(false);
            setBusinesses([]);
            setMetrics(null);
            setSelectedBusinessId('');
            setVerificationStatus(null);
            setDocuments([]);
            return;
        }

        void loadDashboard();
    }, [activeOrganizationId, loadDashboard, organizationLoading]);

    useEffect(() => {
        if (!activeOrganizationId || !selectedBusinessId) {
            return;
        }
        void loadVerificationData(selectedBusinessId);
    }, [activeOrganizationId, loadVerificationData, selectedBusinessId]);

    const handleUploadDocument = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedBusinessId) {
            setErrorMessage('Selecciona un negocio antes de subir documentos');
            return;
        }
        if (!selectedFile) {
            setErrorMessage('Selecciona un archivo');
            return;
        }

        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const uploadRes = await verificationApi.uploadDocumentFile(selectedBusinessId, selectedFile);
            const uploadPayload = (uploadRes.data || {}) as { fileUrl?: string; url?: string };
            const fileUrl = uploadPayload.fileUrl || uploadPayload.url;
            if (!fileUrl) {
                throw new Error('No se recibio URL del archivo');
            }

            await verificationApi.submitDocument({
                businessId: selectedBusinessId,
                documentType,
                fileUrl,
            });

            setSelectedFile(null);
            await loadVerificationData(selectedBusinessId);
            setSuccessMessage('Documento enviado para revision');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo subir el documento'));
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitBusinessVerification = async () => {
        if (!selectedBusinessId) {
            setErrorMessage('Selecciona un negocio antes de enviar la solicitud');
            return;
        }

        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.submitBusiness(selectedBusinessId, {
                notes: verificationNotes.trim() || undefined,
            });
            await loadVerificationData(selectedBusinessId);
            setSuccessMessage('Solicitud de verificacion enviada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la solicitud de verificacion'));
        } finally {
            setSaving(false);
        }
    };

    if (loading || organizationLoading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
                <div className="h-10 w-64 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
                <div className="h-5 w-80 rounded-lg bg-gray-100 animate-pulse mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="card p-5">
                            <div className="h-4 w-20 bg-gray-100 rounded mb-3 animate-pulse"></div>
                            <div className="h-7 w-16 bg-gray-100 rounded animate-pulse"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6 animate-fade-in">
            <section className="card p-6 lg:p-8">
                <p className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Panel Negocio</p>
                <h1 className="font-display text-3xl font-bold text-gray-900 mt-1">Resumen de rendimiento</h1>
                <p className="text-gray-600 mt-2">
                    Vista simplificada enfocada en analitica base y verificacion documental.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                    <Link className="btn-primary" to="/register-business">
                        Registrar otro negocio
                    </Link>
                    <Link className="btn-secondary" to="/profile">
                        Editar perfil
                    </Link>
                </div>
            </section>

            {needsFirstBusinessSetup && (
                <section className="card p-6 lg:p-8 border border-primary-100 bg-primary-50/50">
                    <p className="text-sm uppercase tracking-wide text-primary-700 font-semibold">Primer paso</p>
                    <h2 className="font-display text-2xl font-bold text-gray-900 mt-2">Registra tu primer negocio</h2>
                    <p className="text-gray-600 mt-2 max-w-2xl">
                        Tu panel de negocio se activa despues de crear el primer negocio. En ese proceso se prepara tu organizacion interna y la verificacion documental.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <Link className="btn-primary" to="/register-business">
                            Registrar negocio ahora
                        </Link>
                        <Link className="btn-secondary" to="/businesses">
                            Ver directorio publico
                        </Link>
                    </div>
                </section>
            )}

            {errorMessage && (
                <section className="card p-4 border border-red-100 bg-red-50">
                    <p className="text-sm text-red-700">{errorMessage}</p>
                </section>
            )}
            {successMessage && (
                <section className="card p-4 border border-green-100 bg-green-50">
                    <p className="text-sm text-green-700">{successMessage}</p>
                </section>
            )}

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Negocios activos</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{businesses.length}</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vistas</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totals.views ?? 0}</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Clicks</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totals.clicks ?? 0}</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversion</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totals.conversionRate ?? 0}%</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ingresos</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrencyDo(totals.grossRevenue ?? 0)}</p>
                </article>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <article className="card p-6">
                    <h2 className="font-display text-xl font-bold text-gray-900 mb-4">Mis negocios</h2>
                    {businesses.length === 0 ? (
                        <p className="text-sm text-gray-500">Aun no tienes negocios creados.</p>
                    ) : (
                        <div className="space-y-2">
                            {businesses.map((business) => (
                                <button
                                    type="button"
                                    key={business.id}
                                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                                        selectedBusinessId === business.id
                                            ? 'border-primary-300 bg-primary-50'
                                            : 'border-gray-100 hover:border-primary-100'
                                    }`}
                                    onClick={() => setSelectedBusinessId(business.id)}
                                >
                                    <p className="font-medium text-gray-900">{business.name}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {business.verified ? 'Publicado y verificado' : 'Pendiente de verificacion'}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </article>

                <article className="card p-6 lg:col-span-2 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="font-display text-xl font-bold text-gray-900">Verificacion documental</h2>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${getStatusClass(verificationStatus?.verificationStatus || 'UNVERIFIED')}`}>
                            {getStatusLabel(verificationStatus?.verificationStatus || 'UNVERIFIED')}
                        </span>
                    </div>

                    {selectedBusiness ? (
                        <p className="text-sm text-gray-600">
                            Negocio seleccionado: <strong>{selectedBusiness.name}</strong>
                        </p>
                    ) : (
                        <p className="text-sm text-gray-500">Selecciona un negocio para gestionar su verificacion.</p>
                    )}

                    {verificationStatus?.verificationSubmittedAt && (
                        <p className="text-xs text-gray-500">
                            Enviado: {formatDateTimeDo(verificationStatus.verificationSubmittedAt)}.
                        </p>
                    )}
                    {verificationStatus?.verificationReviewedAt && (
                        <p className="text-xs text-gray-500">
                            Revisado: {formatDateTimeDo(verificationStatus.verificationReviewedAt)}.
                        </p>
                    )}
                    {verificationStatus?.verificationNotes && (
                        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            Nota: {verificationStatus.verificationNotes}
                        </p>
                    )}

                    <form onSubmit={handleUploadDocument} className="space-y-3 rounded-xl border border-gray-100 p-4">
                        <h3 className="font-semibold text-gray-900">Subir documento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <select
                                className="input-field"
                                value={documentType}
                                onChange={(event) => setDocumentType(event.target.value as VerificationDocument['documentType'])}
                                disabled={!selectedBusinessId || saving}
                            >
                                <option value="ID_CARD">Cedula</option>
                                <option value="TAX_CERTIFICATE">RNC</option>
                                <option value="BUSINESS_LICENSE">Licencia comercial</option>
                                <option value="ADDRESS_PROOF">Comprobante de direccion</option>
                                <option value="SELFIE">Selfie</option>
                                <option value="OTHER">Otro</option>
                            </select>
                            <input
                                type="file"
                                className="input-field"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                                disabled={!selectedBusinessId || saving}
                            />
                        </div>
                        <button type="submit" className="btn-primary text-sm" disabled={!selectedBusinessId || !selectedFile || saving}>
                            {saving ? 'Subiendo...' : 'Subir documento'}
                        </button>
                    </form>

                    <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                        <h3 className="font-semibold text-gray-900">Enviar solicitud de revision</h3>
                        <textarea
                            className="input-field text-sm"
                            rows={3}
                            placeholder="Notas para el equipo de verificacion (opcional)"
                            value={verificationNotes}
                            onChange={(event) => setVerificationNotes(event.target.value)}
                            disabled={!selectedBusinessId || saving}
                        />
                        <button
                            type="button"
                            className="btn-secondary text-sm"
                            onClick={() => void handleSubmitBusinessVerification()}
                            disabled={!selectedBusinessId || saving}
                        >
                            {saving ? 'Enviando...' : 'Solicitar verificacion'}
                        </button>
                    </div>

                    <div className="rounded-xl border border-gray-100 p-4">
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
                </article>
            </section>
        </div>
    );
}
