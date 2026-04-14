import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, businessApi, verificationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useOrganization } from '../context/useOrganization';
import { useTimedMessage } from '../hooks/useTimedMessage';
import { SummaryCard, SectionCard, EmptyState, ErrorState } from '../components/ui';

const VerificationWorkspace = lazy(async () => ({
    default: (await import('./dashboard-business/VerificationWorkspace')).VerificationWorkspace,
}));
const BillingWorkspace = lazy(async () => ({
    default: (await import('./dashboard-business/BillingWorkspace')).BillingWorkspace,
}));
const OperationsWorkspace = lazy(async () => ({
    default: (await import('./dashboard-business/OperationsWorkspace')).OperationsWorkspace,
}));
const GrowthWorkspace = lazy(async () => ({
    default: (await import('./dashboard-business/GrowthWorkspace')).GrowthWorkspace,
}));
const OrganizationWorkspace = lazy(async () => ({
    default: (await import('./dashboard-business/OrganizationWorkspace')).OrganizationWorkspace,
}));

// ── Tipos ────────────────────────────────────────────────
type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

interface BusinessItem {
    id: string;
    slug?: string;
    name: string;
    verified?: boolean;
    verificationStatus?: VerificationStatus;
    claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    source?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
    catalogSource?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
    lifecycleStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOFT_DELETED';
    isActive?: boolean;
    primaryManagingOrganizationId?: string | null;
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
    business?: { id: string; name: string };
}

interface BusinessVerificationStatus {
    id: string;
    verificationStatus: VerificationStatus;
    verified: boolean;
    verificationSubmittedAt?: string | null;
    verificationReviewedAt?: string | null;
    verificationNotes?: string | null;
}

interface MyClaimRequestItem {
    id: string;
    status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED';
    createdAt: string;
    reviewedAt?: string | null;
    approvedAt?: string | null;
    rejectedAt?: string | null;
    expiredAt?: string | null;
    canceledAt?: string | null;
    evidenceType: 'PHONE' | 'EMAIL_DOMAIN' | 'DOCUMENT' | 'SOCIAL' | 'MANUAL';
    business: {
        id: string;
        name: string;
        slug: string;
        claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
        lifecycleStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOFT_DELETED';
    };
}

type OwnerWorkspaceId = 'overview' | 'operations' | 'growth' | 'billing' | 'organization';

// ── Helpers ──────────────────────────────────────────────
function asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
        return (value as { data: T[] }).data;
    }
    return [];
}

function statusLabel(status: VerificationStatus | 'APPROVED' | 'REJECTED' | 'PENDING'): string {
    switch (status) {
        case 'VERIFIED': case 'APPROVED': return 'Aprobado';
        case 'PENDING': return 'Pendiente';
        case 'REJECTED': return 'Rechazado';
        case 'SUSPENDED': return 'Suspendido';
        default: return 'Sin enviar';
    }
}

function statusChipClass(status: VerificationStatus | 'APPROVED' | 'REJECTED' | 'PENDING'): string {
    switch (status) {
        case 'VERIFIED': case 'APPROVED': return 'bg-emerald-100 text-emerald-700';
        case 'PENDING': return 'bg-amber-100 text-amber-700';
        case 'REJECTED': return 'bg-red-100 text-red-700';
        case 'SUSPENDED': return 'bg-slate-200 text-slate-600';
        default: return 'bg-slate-100 text-slate-500';
    }
}

function claimStatusLabel(status?: MyClaimRequestItem['status']): string {
    switch (status) {
        case 'UNDER_REVIEW': return 'En revisión';
        case 'APPROVED': return 'Aprobado';
        case 'REJECTED': return 'Rechazado';
        case 'EXPIRED': return 'Expirado';
        case 'CANCELED': return 'Cancelado';
        default: return 'Pendiente';
    }
}

function claimStatusClass(status?: MyClaimRequestItem['status']): string {
    switch (status) {
        case 'APPROVED': return 'bg-emerald-100 text-emerald-700';
        case 'UNDER_REVIEW': return 'bg-blue-100 text-blue-700';
        case 'REJECTED': case 'CANCELED': return 'bg-red-100 text-red-700';
        case 'EXPIRED': return 'bg-slate-200 text-slate-600';
        default: return 'bg-amber-100 text-amber-700';
    }
}

// ── Skeleton de workspace ─────────────────────────────────
function WorkspaceSkeleton() {
    return (
        <div className="card-section density-compact animate-pulse space-y-4">
            <div className="h-4 w-40 rounded-full bg-slate-100" />
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-24 rounded-xl bg-slate-100" />
                <div className="h-24 rounded-xl bg-slate-100" />
            </div>
        </div>
    );
}

// ── Tabs de workspace ─────────────────────────────────────
const WORKSPACE_TABS: { id: OwnerWorkspaceId; label: string }[] = [
    { id: 'overview',      label: 'Resumen' },
    { id: 'operations',   label: 'Operación' },
    { id: 'growth',       label: 'Crecimiento' },
    { id: 'billing',      label: 'Facturación' },
    { id: 'organization', label: 'Organización' },
];

// ── Componente principal ──────────────────────────────────
export function DashboardBusiness() {
    const {
        activeOrganization,
        activeOrganizationId,
        loading: organizationLoading,
        organizations,
    } = useOrganization();

    const [loading, setLoading]             = useState(true);
    const [saving, setSaving]               = useState(false);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [errorMessage, setErrorMessage]   = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [activeWorkspace, setActiveWorkspace] = useState<OwnerWorkspaceId>('overview');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const [businesses, setBusinesses]                   = useState<BusinessItem[]>([]);
    const [selectedBusinessId, setSelectedBusinessId]   = useState('');
    const [metrics, setMetrics]                         = useState<DashboardMetrics | null>(null);
    const [claimRequests, setClaimRequests]             = useState<MyClaimRequestItem[]>([]);
    const [claimSummary, setClaimSummary]               = useState<Record<string, number>>({});

    const [verificationStatus, setVerificationStatus]   = useState<BusinessVerificationStatus | null>(null);
    const [documents, setDocuments]                     = useState<VerificationDocument[]>([]);
    const [verificationLoadedBusinessId, setVerificationLoadedBusinessId] = useState('');
    const verificationCacheRef = useRef(
        new Map<string, { status: BusinessVerificationStatus | null; documents: VerificationDocument[] }>(),
    );
    const [documentType, setDocumentType]   = useState<VerificationDocument['documentType']>('ID_CARD');
    const [verificationNotes, setVerificationNotes] = useState('');
    const [selectedFile, setSelectedFile]   = useState<File | null>(null);

    // ── Derivados ─────────────────────────────────────────
    const selectedBusiness = useMemo(
        () => businesses.find((b) => b.id === selectedBusinessId) || null,
        [businesses, selectedBusinessId],
    );
    const totals = metrics?.totals ?? {};
    const completeProfiles = useMemo(
        () => businesses.filter((b) => (b.profileCompletenessScore ?? 0) >= 80).length,
        [businesses],
    );
    const activeClaimRequests = useMemo(
        () => claimRequests.filter((r) => r.status === 'PENDING' || r.status === 'UNDER_REVIEW'),
        [claimRequests],
    );
    const openNowCount = useMemo(
        () => businesses.filter((b) => b.openNow).length,
        [businesses],
    );
    const showVerificationSkeleton =
        Boolean(selectedBusinessId) &&
        verificationLoading &&
        verificationLoadedBusinessId !== selectedBusinessId;
    const needsFirstBusinessSetup =
        !organizationLoading && !activeOrganizationId && !organizations.length;

    // ── Carga de datos ────────────────────────────────────
    const loadClaimRequests = useCallback(async () => {
        try {
            const res = await businessApi.getMyClaimRequests({ limit: 10 });
            setClaimRequests(asArray<MyClaimRequestItem>(res.data));
            setClaimSummary(((res.data as { summary?: Record<string, number> } | undefined)?.summary || {}) as Record<string, number>);
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, 'No se pudo cargar el estado de tus claims'));
        }
    }, []);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const [bizRes, metricsRes, claimRes] = await Promise.all([
                businessApi.getMine(),
                analyticsApi.getMyDashboard({ days: 30 }),
                businessApi.getMyClaimRequests({ limit: 10 }),
            ]);
            const nextBiz = asArray<BusinessItem>(bizRes.data);
            const nextIds = new Set(nextBiz.map((b) => b.id));
            Array.from(verificationCacheRef.current.keys()).forEach((id) => {
                if (!nextIds.has(id)) verificationCacheRef.current.delete(id);
            });
            setBusinesses(nextBiz);
            setMetrics((metricsRes.data || null) as DashboardMetrics | null);
            setClaimRequests(asArray<MyClaimRequestItem>(claimRes.data));
            setClaimSummary(((claimRes.data as { summary?: Record<string, number> } | undefined)?.summary || {}) as Record<string, number>);
            setSelectedBusinessId((cur) => {
                if (cur && nextBiz.some((b) => b.id === cur)) return cur;
                return nextBiz[0]?.id || '';
            });
        } catch (err) {
            const msg = getApiErrorMessage(err, 'No se pudo cargar el panel del negocio');
            if (msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('organizacion activa')) {
                setBusinesses([]); setMetrics(null); setSelectedBusinessId('');
                setVerificationStatus(null); setDocuments([]); setErrorMessage('');
            } else {
                setErrorMessage(msg);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const loadVerificationData = useCallback(async (businessId: string, opts?: { force?: boolean }) => {
        if (!businessId) {
            setVerificationStatus(null); setDocuments([]);
            setVerificationLoading(false); setVerificationLoadedBusinessId('');
            return;
        }
        const cached = verificationCacheRef.current.get(businessId);
        if (cached && !opts?.force) {
            setVerificationStatus(cached.status); setDocuments(cached.documents);
            setVerificationLoadedBusinessId(businessId); setVerificationLoading(false);
            return;
        }
        setVerificationLoading(true);
        if (!cached) { setVerificationLoadedBusinessId(''); setVerificationStatus(null); setDocuments([]); }
        try {
            const [statusRes, docsRes] = await Promise.all([
                verificationApi.getBusinessStatus(businessId),
                verificationApi.getMyDocuments({ businessId, limit: 50 }),
            ]);
            const statusPayload = (statusRes.data || null) as BusinessVerificationStatus | null;
            const allDocs = asArray<VerificationDocument>(docsRes.data);
            const filtered = allDocs.filter((d) => !d.business?.id || d.business.id === businessId);
            verificationCacheRef.current.set(businessId, { status: statusPayload, documents: filtered });
            setVerificationStatus(statusPayload); setDocuments(filtered);
            setVerificationLoadedBusinessId(businessId);
        } catch (err) {
            setVerificationLoadedBusinessId(businessId);
            if (!cached) { setVerificationStatus(null); setDocuments([]); }
            setErrorMessage(getApiErrorMessage(err, 'No se pudo cargar la verificación documental'));
        } finally {
            setVerificationLoading(false);
        }
    }, []);

    useEffect(() => {
        if (organizationLoading) return;
        if (!activeOrganizationId) {
            setLoading(false); setBusinesses([]); setMetrics(null);
            setSelectedBusinessId(''); setVerificationStatus(null);
            setDocuments([]); setVerificationLoading(false); setVerificationLoadedBusinessId('');
            void loadClaimRequests();
            return;
        }
        void loadDashboard();
    }, [activeOrganizationId, loadClaimRequests, loadDashboard, organizationLoading]);

    useEffect(() => {
        if (!activeOrganizationId || !selectedBusinessId) return;
        void loadVerificationData(selectedBusinessId);
    }, [activeOrganizationId, loadVerificationData, selectedBusinessId]);

    useEffect(() => {
        if (!activeOrganizationId && activeWorkspace !== 'overview') setActiveWorkspace('overview');
    }, [activeOrganizationId, activeWorkspace]);

    // ── Handlers ─────────────────────────────────────────
    const handleUploadDocument = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBusinessId) { setErrorMessage('Selecciona un negocio antes de subir documentos'); return; }
        if (!selectedFile) { setErrorMessage('Selecciona un archivo'); return; }
        setSaving(true); setErrorMessage(''); setSuccessMessage('');
        try {
            const uploadRes = await verificationApi.uploadDocumentFile(selectedBusinessId, selectedFile);
            const payload = (uploadRes.data || {}) as { fileUrl?: string; url?: string };
            const fileUrl = payload.fileUrl || payload.url;
            if (!fileUrl) throw new Error('No se recibió la URL del archivo');
            await verificationApi.submitDocument({ businessId: selectedBusinessId, documentType, fileUrl });
            verificationCacheRef.current.delete(selectedBusinessId);
            setSelectedFile(null);
            await loadVerificationData(selectedBusinessId, { force: true });
            setSuccessMessage('Documento enviado para revisión');
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, 'No se pudo subir el documento'));
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitVerification = async () => {
        if (!selectedBusinessId) { setErrorMessage('Selecciona un negocio antes de enviar la solicitud'); return; }
        setSaving(true); setErrorMessage(''); setSuccessMessage('');
        try {
            await verificationApi.submitBusiness(selectedBusinessId, { notes: verificationNotes.trim() || undefined });
            verificationCacheRef.current.delete(selectedBusinessId);
            await loadVerificationData(selectedBusinessId, { force: true });
            setSuccessMessage('Solicitud de verificación enviada');
        } catch (err) {
            setErrorMessage(getApiErrorMessage(err, 'No se pudo enviar la solicitud de verificación'));
        } finally {
            setSaving(false);
        }
    };

    // ── Loading skeleton ──────────────────────────────────
    if (loading || organizationLoading) {
        return (
            <div className="app-page-inner density-compact animate-fade-in">
                {/* Fila 1 skeleton */}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="card-summary animate-pulse">
                            <div className="h-2.5 w-20 rounded-full bg-slate-100" />
                            <div className="mt-3 h-8 w-16 rounded-xl bg-slate-100" />
                        </div>
                    ))}
                </div>
                {/* Fila 2 skeleton */}
                <div className="grid gap-3 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="card-section animate-pulse space-y-2">
                            <div className="h-3 w-24 rounded-full bg-slate-100" />
                            <div className="h-16 rounded-lg bg-slate-100" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── Setup inicial sin organización ───────────────────
    if (needsFirstBusinessSetup) {
        return (
            <div className="app-page-inner density-cozy">
                <div className="app-page-header">
                    <h1 className="app-page-header__title">Panel del negocio</h1>
                </div>
                <EmptyState
                    title="Aún no tienes una organización"
                    body="Crea o únete a una organización para gestionar tus negocios en AquiTa.do."
                    action={
                        <Link to="/register-business" className="btn-primary text-sm">
                            Registrar negocio
                        </Link>
                    }
                    icon={
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                            <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    }
                />
            </div>
        );
    }

    // ── Vista principal ───────────────────────────────────
    return (
        <div className="app-page-inner density-compact animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'biz-dashboard-error',   tone: 'danger', text: errorMessage },
                    { id: 'biz-dashboard-success', tone: 'info',   text: successMessage },
                ]}
            />

            {/* ── Page Header ───────────────────────────── */}
            <div className="app-page-header">
                <div>
                    <h1 className="app-page-header__title">
                        {activeOrganization?.name ?? 'Mi negocio'}
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        {businesses.length} negocio{businesses.length !== 1 ? 's' : ''} gestionados
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    {businesses.length > 0 && selectedBusiness && (
                        <Link
                            to={`/businesses/${selectedBusiness.slug}`}
                            className="btn-ghost text-xs"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Ver ficha pública ↗
                        </Link>
                    )}
                    <Link to="/register-business" className="btn-primary text-xs px-4 py-2">
                        + Negocio
                    </Link>
                </div>
            </div>

            {/* ═══ FILA 1: Contexto del negocio + estado rápido (§ 9.4) ═══ */}
            <section aria-label="Estado del negocio">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Vistas calificadas"
                        value={(totals.views ?? 0).toLocaleString('es-DO')}
                        delta="+12% vs mes pasado"
                    />
                    <SummaryCard
                        label="Clicks a contacto"
                        value={(totals.clicks ?? 0).toLocaleString('es-DO')}
                        delta={`${activeClaimRequests.length} claims activos`}
                    />
                    <SummaryCard
                        label="Conversión"
                        value={`${totals.conversionRate ?? 0}%`}
                        delta={verificationStatus?.verified ? 'Perfil verificado' : 'Sin KYC completo'}
                    />
                    <SummaryCard
                        label="Perfiles fuertes"
                        value={`${completeProfiles}`}
                        delta={`${openNowCount} abiertos ahora`}
                    />
                </div>
            </section>

            {/* Estado del negocio seleccionado (claim + verificación + salud) */}
            {selectedBusiness && (
                <section aria-label="Estado del negocio activo">
                    <div className="grid gap-3 md:grid-cols-3">
                        {/* Claim */}
                        <div className="card-section density-compact">
                            <div className="card-section__header">
                                <h3 className="card-section__title">Claim</h3>
                                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                    selectedBusiness.claimStatus === 'CLAIMED'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                }`}>
                                    {selectedBusiness.claimStatus === 'CLAIMED' ? 'Reclamado' :
                                     selectedBusiness.claimStatus === 'PENDING_CLAIM' ? 'Pendiente' : 'Sin reclamar'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                {selectedBusiness.claimStatus === 'CLAIMED'
                                    ? 'Tu negocio está vinculado correctamente a esta organización.'
                                    : 'El negocio aún no está reclamado. Inicia el proceso para tomar el control.'}
                            </p>
                        </div>

                        {/* Verificación KYC */}
                        <div className="card-section density-compact">
                            <div className="card-section__header">
                                <h3 className="card-section__title">Verificación KYC</h3>
                                {verificationStatus && (
                                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusChipClass(verificationStatus.verificationStatus)}`}>
                                        {statusLabel(verificationStatus.verificationStatus)}
                                    </span>
                                )}
                            </div>
                            {showVerificationSkeleton ? (
                                <div className="h-8 animate-pulse rounded-lg bg-slate-100" />
                            ) : (
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    {verificationStatus?.verified
                                        ? 'Identidad verificada. Tu negocio aparece como confiable.'
                                        : 'Sube documentos de verificación para obtener el sello KYC.'}
                                </p>
                            )}
                        </div>

                        {/* Salud del perfil */}
                        <div className="card-section density-compact">
                            <div className="card-section__header">
                                <h3 className="card-section__title">Perfil</h3>
                                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                                    (selectedBusiness.profileCompletenessScore ?? 0) >= 80
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-amber-100 text-amber-700'
                                }`}>
                                    {selectedBusiness.profileCompletenessScore ?? 0}%
                                </span>
                            </div>
                            {selectedBusiness.missingCoreFields && selectedBusiness.missingCoreFields.length > 0 ? (
                                <p className="text-xs text-slate-500">
                                    Faltan: {selectedBusiness.missingCoreFields.slice(0, 2).join(', ')}
                                    {selectedBusiness.missingCoreFields.length > 2 && ` +${selectedBusiness.missingCoreFields.length - 2}`}
                                </p>
                            ) : (
                                <p className="text-xs text-slate-500">Perfil completo. Buen trabajo.</p>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* ═══ Selector de negocio (si hay más de uno) ═══ */}
            {businesses.length > 1 && (
                <section aria-label="Negocios gestionados">
                    <div className="card-filter density-compact">
                        <label htmlFor="business-select" className="text-xs font-semibold text-slate-600 mb-2 block">
                            Negocio activo
                        </label>
                        <select
                            id="business-select"
                            value={selectedBusinessId}
                            onChange={(e) => setSelectedBusinessId(e.target.value)}
                            className="input-field text-sm py-2"
                        >
                            {businesses.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                </section>
            )}

            {/* ═══ Tabs de workspace ═══ */}
            {activeOrganizationId && (
                <div className="flex gap-1 overflow-x-auto border-b border-slate-100 pb-0" role="tablist" aria-label="Áreas de trabajo">
                    {WORKSPACE_TABS.map((tab) => {
                        const isActive = activeWorkspace === tab.id;
                        return (
                            <button
                                key={tab.id}
                                role="tab"
                                type="button"
                                aria-selected={isActive}
                                onClick={() => setActiveWorkspace(tab.id)}
                                className={`shrink-0 border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
                                    isActive
                                        ? 'border-primary-600 text-primary-700'
                                        : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ═══ FILA 2: Operación diaria ═══ */}
            {activeWorkspace === 'overview' && (
                <section aria-label="Resumen y claims">
                    {claimRequests.length === 0 ? (
                        <EmptyState
                            title="Sin claims activos"
                            body="Cuando inicies o recibas un claim de negocio, aparecerá aquí."
                        />
                    ) : (
                        <SectionCard title="Claims recientes" density="compact">
                            <div className="card-list">
                                {claimRequests.slice(0, 5).map((claim) => (
                                    <div key={claim.id} className="card-list__item">
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate text-sm font-medium text-slate-800">{claim.business.name}</p>
                                            <p className="text-xs text-slate-500">{claimStatusLabel(claim.status)}</p>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${claimStatusClass(claim.status)}`}>
                                            {claimStatusLabel(claim.status)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    )}
                </section>
            )}

            {/* ═══ FILA 2: Operaciones ═══ */}
            {activeWorkspace === 'operations' && activeOrganizationId && (
                <section aria-label="Operación diaria">
                    <Suspense fallback={<WorkspaceSkeleton />}>
                        <OperationsWorkspace
                            activeOrganizationId={activeOrganizationId}
                            businesses={businesses.map(b => ({ id: b.id, name: b.name, slug: b.slug }))}
                            selectedBusinessId={selectedBusinessId}
                        />
                    </Suspense>
                </section>
            )}

            {/* ═══ FILA 3: Crecimiento ═══ */}
            {activeWorkspace === 'growth' && activeOrganizationId && (
                <section aria-label="Crecimiento y visibilidad">
                    <Suspense fallback={<WorkspaceSkeleton />}>
                        <GrowthWorkspace
                            activeOrganizationId={activeOrganizationId}
                            businesses={businesses.map(b => ({ id: b.id, name: b.name, slug: b.slug }))}
                            selectedBusinessId={selectedBusinessId}
                        />
                    </Suspense>
                </section>
            )}

            {/* ═══ FILA 4: Administración ═══ */}
            {activeWorkspace === 'billing' && activeOrganizationId && (
                <section aria-label="Facturación y planes">
                    <Suspense fallback={<WorkspaceSkeleton />}>
                        <BillingWorkspace
                            activeOrganizationId={activeOrganizationId}
                            organizationName={activeOrganization?.name}
                        />
                    </Suspense>
                </section>
            )}

            {activeWorkspace === 'organization' && activeOrganizationId && (
                <section aria-label="Organización y equipo">
                    <Suspense fallback={<WorkspaceSkeleton />}>
                        <OrganizationWorkspace
                            activeOrganizationId={activeOrganizationId}
                            organizationName={activeOrganization?.name}
                            businesses={businesses.map(b => ({ id: b.id, name: b.name, slug: b.slug }))}
                            selectedBusinessId={selectedBusinessId}
                        />
                    </Suspense>
                </section>
            )}

            {/* Verificación — en overview si hay negocio seleccionado */}
            {activeWorkspace === 'overview' && selectedBusinessId && activeOrganizationId && (
                <section aria-label="Verificación documental">
                    <Suspense fallback={<WorkspaceSkeleton />}>
                        <VerificationWorkspace
                            selectedBusiness={selectedBusiness ? { name: selectedBusiness.name } : null}
                            selectedBusinessId={selectedBusinessId}
                            showVerificationSkeleton={showVerificationSkeleton}
                            verificationStatus={verificationStatus}
                            documents={documents}
                            documentType={documentType}
                            hasSelectedFile={selectedFile !== null}
                            verificationNotes={verificationNotes}
                            saving={saving}
                            onDocumentTypeChange={(val) => setDocumentType(val as any)}
                            onFileChange={setSelectedFile}
                            onVerificationNotesChange={setVerificationNotes}
                            onUploadDocument={handleUploadDocument}
                            onSubmitBusinessVerification={handleSubmitVerification}
                            getStatusClass={statusChipClass}
                            getStatusLabel={statusLabel}
                        />
                    </Suspense>
                </section>
            )}
        </div>
    );
}
