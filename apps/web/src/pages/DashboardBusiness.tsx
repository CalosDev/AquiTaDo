import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, businessApi, verificationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useOrganization } from '../context/useOrganization';
import { useTimedMessage } from '../hooks/useTimedMessage';

const VerificationWorkspace = lazy(async () => ({
    default: (await import('./dashboard-business/VerificationWorkspace')).VerificationWorkspace,
}));

type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

interface BusinessItem {
    id: string;
    slug?: string;
    name: string;
    verified?: boolean;
    verificationStatus?: VerificationStatus;
    profileCompletenessScore?: number;
    missingCoreFields?: string[];
    openNow?: boolean | null;
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
            return 'bg-primary-100 text-primary-700';
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

function LazyOwnerSectionFallback({ label }: { label: string }) {
    return (
        <article className="section-shell p-6 lg:col-span-2 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-2">
                    <div className="h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-7 w-56 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="h-8 w-28 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="h-4 w-64 rounded-full bg-slate-100 animate-pulse" />
            <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 min-h-[10.75rem]">
                <div className="h-5 w-36 animate-pulse rounded-lg bg-slate-100" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="h-11 animate-pulse rounded-xl bg-white" />
                    <div className="h-11 animate-pulse rounded-xl bg-white" />
                </div>
                <div className="h-10 w-36 animate-pulse rounded-xl bg-primary-100/60" />
            </div>
            <div className="rounded-xl border border-gray-100 p-4 min-h-[8.5rem]">
                <div className="h-5 w-40 animate-pulse rounded-lg bg-slate-100" />
                <div className="mt-4 space-y-2">
                    <div className="h-16 animate-pulse rounded-xl bg-slate-50" />
                    <div className="h-16 animate-pulse rounded-xl bg-slate-50" />
                </div>
            </div>
            <span className="sr-only">{label}</span>
        </article>
    );
}

export function DashboardBusiness() {
    const { activeOrganizationId, loading: organizationLoading, organizations } = useOrganization();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
    const [selectedBusinessId, setSelectedBusinessId] = useState('');
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

    const [verificationStatus, setVerificationStatus] = useState<BusinessVerificationStatus | null>(null);
    const [documents, setDocuments] = useState<VerificationDocument[]>([]);
    const [verificationLoadedBusinessId, setVerificationLoadedBusinessId] = useState('');
    const verificationCacheRef = useRef(
        new Map<string, {
            status: BusinessVerificationStatus | null;
            documents: VerificationDocument[];
        }>(),
    );
    const [documentType, setDocumentType] = useState<VerificationDocument['documentType']>('ID_CARD');
    const [verificationNotes, setVerificationNotes] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const selectedBusiness = useMemo(
        () => businesses.find((business) => business.id === selectedBusinessId) || null,
        [businesses, selectedBusinessId],
    );
    const hasOrganizations = organizations.length > 0;
    const needsFirstBusinessSetup = !organizationLoading && !activeOrganizationId && !hasOrganizations;
    const showVerificationSkeleton = Boolean(selectedBusinessId)
        && verificationLoading
        && verificationLoadedBusinessId !== selectedBusinessId;

    const totals = metrics?.totals ?? {};
    const completeProfiles = useMemo(
        () => businesses.filter((business) => (business.profileCompletenessScore ?? 0) >= 80).length,
        [businesses],
    );

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const [businessesRes, metricsRes] = await Promise.all([
                businessApi.getMine(),
                analyticsApi.getMyDashboard({ days: 30 }),
            ]);

            const nextBusinesses = asArray<BusinessItem>(businessesRes.data);
            const nextBusinessIds = new Set(nextBusinesses.map((business) => business.id));
            Array.from(verificationCacheRef.current.keys()).forEach((businessId) => {
                if (!nextBusinessIds.has(businessId)) {
                    verificationCacheRef.current.delete(businessId);
                }
            });
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
            if (message.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').includes('organizacion activa')) {
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

    const loadVerificationData = useCallback(async (businessId: string, options?: { force?: boolean }) => {
        if (!businessId) {
            setVerificationStatus(null);
            setDocuments([]);
            setVerificationLoading(false);
            setVerificationLoadedBusinessId('');
            return;
        }

        const cached = verificationCacheRef.current.get(businessId);
        if (cached && !options?.force) {
            setVerificationStatus(cached.status);
            setDocuments(cached.documents);
            setVerificationLoadedBusinessId(businessId);
            setVerificationLoading(false);
            return;
        }

        setVerificationLoading(true);
        if (!cached) {
            setVerificationLoadedBusinessId('');
            setVerificationStatus(null);
            setDocuments([]);
        }

        try {
            const [statusRes, documentsRes] = await Promise.all([
                verificationApi.getBusinessStatus(businessId),
                verificationApi.getMyDocuments({ businessId, limit: 50 }),
            ]);

            const statusPayload = (statusRes.data || null) as BusinessVerificationStatus | null;
            const allDocuments = asArray<VerificationDocument>(documentsRes.data);
            const filteredDocuments = allDocuments.filter((document) => {
                if (!document.business?.id) {
                    return true;
                }
                return document.business.id === businessId;
            });

            verificationCacheRef.current.set(businessId, {
                status: statusPayload,
                documents: filteredDocuments,
            });
            setVerificationStatus(statusPayload);
            setDocuments(filteredDocuments);
            setVerificationLoadedBusinessId(businessId);
        } catch (error) {
            setVerificationLoadedBusinessId(businessId);
            if (!cached) {
                setVerificationStatus(null);
                setDocuments([]);
            }
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la verificación documental'));
        } finally {
            setVerificationLoading(false);
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
            setVerificationLoading(false);
            setVerificationLoadedBusinessId('');
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
                throw new Error('No se recibio la URL del archivo');
            }

            await verificationApi.submitDocument({
                businessId: selectedBusinessId,
                documentType,
                fileUrl,
            });

            verificationCacheRef.current.delete(selectedBusinessId);
            setSelectedFile(null);
            await loadVerificationData(selectedBusinessId, { force: true });
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
            verificationCacheRef.current.delete(selectedBusinessId);
            await loadVerificationData(selectedBusinessId, { force: true });
            setSuccessMessage('Solicitud de verificación enviada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la solicitud de verificación'));
        } finally {
            setSaving(false);
        }
    };

    if (loading || organizationLoading) {
        return (
            <div className="page-shell py-10 animate-fade-in">
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
        <div className="page-shell space-y-6 animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'business-dashboard-error', tone: 'danger', text: errorMessage },
                    { id: 'business-dashboard-success', tone: 'info', text: successMessage },
                ]}
            />

            <section className="role-hero role-hero-owner">
                <p className="text-xs uppercase tracking-[0.16em] text-blue-100 font-semibold">Panel de negocio</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Estado del catálogo y visibilidad</h1>
                <p className="text-blue-100 mt-2 max-w-2xl">
                    Vista enfocada en calidad de ficha, visibilidad orgánica y verificación documental.
                </p>

                <div className="mt-5 role-kpi-grid">
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Negocios activos</p>
                        <p className="role-kpi-value">{businesses.length}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Vistas</p>
                        <p className="role-kpi-value">{totals.views ?? 0}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Conversión</p>
                        <p className="role-kpi-value">{totals.conversionRate ?? 0}%</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Perfiles fuertes</p>
                        <p className="role-kpi-value">
                            {completeProfiles}
                        </p>
                    </article>
                </div>

                <div className="mt-4 flex flex-wrap gap-2.5">
                    <span className="chip !border-white/30 !bg-white/10 !text-white">
                        Negocio seleccionado: {selectedBusiness?.name || 'Ninguno'}
                    </span>
                    <span className={`chip !border-white/30 !bg-white/10 !text-white ${verificationStatus?.verified ? '!text-blue-100' : ''}`}>
                        Estado KYC: {getStatusLabel(verificationStatus?.verificationStatus || 'UNVERIFIED')}
                    </span>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <Link className="btn-primary" to="/register-business">
                        Registrar otro negocio
                    </Link>
                    {selectedBusinessId && (
                        <Link
                            className="btn-secondary"
                            to={`/dashboard/businesses/${selectedBusinessId}/edit`}
                        >
                            Editar negocio
                        </Link>
                    )}
                    <Link className="btn-secondary" to="/profile">
                        Editar perfil
                    </Link>
                </div>
            </section>

            {needsFirstBusinessSetup && (
                <section className="section-shell border border-primary-100 bg-primary-50/70 p-6 lg:p-8">
                    <p className="text-sm uppercase tracking-wide text-primary-700 font-semibold">Primer paso</p>
                    <h2 className="font-display text-2xl font-bold text-slate-900 mt-2">Registra tu primer negocio</h2>
                    <p className="text-slate-600 mt-2 max-w-2xl">
                        Tu panel de negocio se activa después de crear el primer negocio. En ese proceso se prepara tu organización interna y la verificación documental.
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

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                <article className="panel-premium p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Negocios activos</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{businesses.length}</p>
                </article>
                <article className="panel-premium p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vistas</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totals.views ?? 0}</p>
                </article>
                <article className="panel-premium p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Clicks</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totals.clicks ?? 0}</p>
                </article>
                <article className="panel-premium p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversión</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totals.conversionRate ?? 0}%</p>
                </article>
                <article className="panel-premium p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Abiertos ahora</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                        {businesses.filter((business) => business.openNow).length}
                    </p>
                </article>
            </section>

            <section className="defer-render-section grid grid-cols-1 lg:grid-cols-3 gap-5">
                <article className="section-shell p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Portafolio</p>
                            <h2 className="font-display text-xl font-bold text-slate-900">Mis negocios</h2>
                        </div>
                        {selectedBusinessId && (
                            <Link
                                to={`/dashboard/businesses/${selectedBusinessId}/edit`}
                                className="text-xs rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 font-semibold text-primary-700 hover:bg-primary-100"
                            >
                                Editar seleccionado
                            </Link>
                        )}
                    </div>
                    {businesses.length === 0 ? (
                        <p className="text-sm text-gray-500">Aún no tienes negocios creados.</p>
                    ) : (
                        <div className="space-y-2">
                            {businesses.map((business) => (
                                <button
                                    type="button"
                                    key={business.id}
                                    className={`w-full rounded-2xl border px-3 py-3 text-left transition-all ${
                                        selectedBusinessId === business.id
                                            ? 'border-primary-300 bg-primary-50 shadow-sm'
                                            : 'border-slate-200/80 bg-white hover:border-primary-100 hover:shadow-sm'
                                    }`}
                                    onClick={() => setSelectedBusinessId(business.id)}
                                >
                                    <p className="font-medium text-slate-900">{business.name}</p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {business.verified ? 'Publicado y verificado' : 'Pendiente de verificación'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <span className="text-[11px] rounded-full bg-primary-50 px-2 py-1 text-primary-700">
                                            Ficha {business.profileCompletenessScore ?? 0}%
                                        </span>
                                        {business.openNow !== null && business.openNow !== undefined ? (
                                            <span className={`text-[11px] rounded-full px-2 py-1 ${
                                                business.openNow
                                                    ? 'bg-primary-100 text-primary-700'
                                                    : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {business.openNow ? 'Abierto ahora' : 'Cerrado ahora'}
                                            </span>
                                        ) : null}
                                    </div>
                                    {business.missingCoreFields && business.missingCoreFields.length > 0 ? (
                                        <p className="mt-2 text-[11px] text-amber-700">
                                            Faltan: {business.missingCoreFields.slice(0, 3).join(', ')}
                                        </p>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    )}
                </article>

                <Suspense fallback={<LazyOwnerSectionFallback label="Cargando verificacion documental" />}>
                    <VerificationWorkspace
                        selectedBusiness={selectedBusiness}
                        selectedBusinessId={selectedBusinessId}
                        showVerificationSkeleton={showVerificationSkeleton}
                        verificationStatus={verificationStatus}
                        documents={documents}
                        documentType={documentType}
                        hasSelectedFile={Boolean(selectedFile)}
                        verificationNotes={verificationNotes}
                        saving={saving}
                        onDocumentTypeChange={(value) => setDocumentType(value as VerificationDocument['documentType'])}
                        onFileChange={setSelectedFile}
                        onVerificationNotesChange={setVerificationNotes}
                        onUploadDocument={handleUploadDocument}
                        onSubmitBusinessVerification={() => void handleSubmitBusinessVerification()}
                        getStatusClass={getStatusClass}
                        getStatusLabel={getStatusLabel}
                    />
                </Suspense>
            </section>
        </div>
    );
}
