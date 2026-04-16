import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { analyticsApi, businessApi, verificationApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useOrganization } from '../context/useOrganization';
import { useTimedMessage } from '../hooks/useTimedMessage';
import { formatDateTimeDo } from '../lib/market';
import {
    ActionBar,
    AppCard,
    EmptyState,
    EmptyStateCard,
    PageIntroCompact,
    SectionCard,
    SummaryCard,
} from '../components/ui';

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

function businessClaimStatusLabel(status?: BusinessItem['claimStatus']): string {
    switch (status) {
        case 'CLAIMED': return 'Reclamado';
        case 'PENDING_CLAIM': return 'En revision';
        case 'SUSPENDED': return 'Suspendido';
        default: return 'Sin reclamar';
    }
}

function businessClaimStatusClass(status?: BusinessItem['claimStatus']): string {
    switch (status) {
        case 'CLAIMED': return 'bg-emerald-100 text-emerald-700';
        case 'PENDING_CLAIM': return 'bg-amber-100 text-amber-700';
        case 'SUSPENDED': return 'bg-slate-200 text-slate-600';
        default: return 'bg-slate-100 text-slate-600';
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
function isOwnerWorkspaceId(value: string | null): value is OwnerWorkspaceId {
    return WORKSPACE_TABS.some((tab) => tab.id === value);
}

function readWorkspace(searchParams: URLSearchParams): OwnerWorkspaceId {
    const workspace = searchParams.get('workspace');
    return isOwnerWorkspaceId(workspace) ? workspace : 'overview';
}

function workspaceSummary(workspace: OwnerWorkspaceId): { label: string; description: string } {
    switch (workspace) {
        case 'operations':
            return {
                label: 'Operacion diaria',
                description: 'Monitorea reservas, conversaciones y atencion activa sin perder el negocio seleccionado.',
            };
        case 'growth':
            return {
                label: 'Crecimiento',
                description: 'Revisa campanas, promociones y senales de demanda con densidad compacta y acciones claras.',
            };
        case 'billing':
            return {
                label: 'Facturacion',
                description: 'Manten plan, limites y cobros en un bloque mas sobrio y facil de auditar.',
            };
        case 'organization':
            return {
                label: 'Organizacion',
                description: 'Administra miembros, ownership y estructura tenant desde un mismo contexto.',
            };
        default:
            return {
                label: 'Resumen ejecutivo',
                description: 'Prioriza claim, verificacion y salud del perfil antes de bajar a la operacion detallada.',
            };
    }
}

export function DashboardBusiness() {
    const [searchParams, setSearchParams] = useSearchParams();
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
    const activeWorkspace = readWorkspace(searchParams);

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
    const selectedBusinessClaimRequests = useMemo(
        () =>
            claimRequests
                .filter((claimRequest) => claimRequest.business.id === selectedBusinessId)
                .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
        [claimRequests, selectedBusinessId],
    );
    const latestSelectedClaimRequest = selectedBusinessClaimRequests[0] || null;
    const documentSummary = useMemo(
        () => documents.reduce(
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
        ),
        [documents],
    );
    const openNowCount = useMemo(
        () => businesses.filter((b) => b.openNow).length,
        [businesses],
    );
    const activeWorkspaceMeta = useMemo(
        () => workspaceSummary(activeWorkspace),
        [activeWorkspace],
    );
    const showVerificationSkeleton =
        Boolean(selectedBusinessId) &&
        verificationLoading &&
        verificationLoadedBusinessId !== selectedBusinessId;
    const needsFirstBusinessSetup =
        !organizationLoading && !activeOrganizationId && !organizations.length;
    const selectedBusinessPublicPath = selectedBusiness
        ? `/businesses/${selectedBusiness.slug || selectedBusiness.id}`
        : null;

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
        if (!activeOrganizationId && activeWorkspace !== 'overview') {
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.delete('workspace');
            setSearchParams(nextSearchParams, { replace: true });
        }
    }, [activeOrganizationId, activeWorkspace, searchParams, setSearchParams]);

    // ── Handlers ─────────────────────────────────────────
    const handleWorkspaceChange = useCallback((workspace: OwnerWorkspaceId) => {
        const nextSearchParams = new URLSearchParams(searchParams);
        if (workspace === 'overview') {
            nextSearchParams.delete('workspace');
        } else {
            nextSearchParams.set('workspace', workspace);
        }
        setSearchParams(nextSearchParams, { replace: true });
    }, [searchParams, setSearchParams]);

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
                <AppCard className="mb-6">
                    <PageIntroCompact
                        eyebrow="Dashboard negocio"
                        title="Panel del negocio"
                        description="Crea o unete a una organizacion para empezar a operar desde AquiTa.do con una sola estructura."
                    />
                </AppCard>
                <EmptyStateCard
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
            <AppCard className="app-page-header">
                <div className="min-w-0">
                    <p className="page-kicker">Dashboard negocio</p>
                    <h1 className="app-page-header__title">
                        {selectedBusiness?.name ?? activeOrganization?.name ?? 'Mi negocio'}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                        {activeWorkspaceMeta.description}
                    </p>
                    <ActionBar className="mt-3">
                        {activeOrganization?.name ? (
                            <span className="chip !bg-white !text-slate-700">
                                Organizacion activa: {activeOrganization.name}
                            </span>
                        ) : null}
                        {selectedBusiness ? (
                            <span className="chip !bg-white !text-slate-700">
                                Perfil: {selectedBusiness.profileCompletenessScore ?? 0}% completo
                            </span>
                        ) : null}
                        <span className="chip !bg-white !text-slate-700">
                            {businesses.length} negocio{businesses.length !== 1 ? 's' : ''} gestionados
                        </span>
                    </ActionBar>
                </div>
                <ActionBar className="justify-end">
                    {selectedBusinessPublicPath ? (
                        <Link
                            to={selectedBusinessPublicPath}
                            className="btn-ghost text-xs"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Ver ficha pública ↗
                        </Link>
                    ) : null}
                    <Link to="/register-business" className="btn-primary text-xs px-4 py-2">
                        + Negocio
                    </Link>
                </ActionBar>
            </AppCard>

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
            {selectedBusiness && activeWorkspace === 'overview' && (
                <section aria-label="Control de claim y readiness">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                        <SectionCard
                            title="Control de claim"
                            description="Estado actual primero, luego checklist y por ultimo historial reciente."
                            density="compact"
                            actions={(
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${businessClaimStatusClass(selectedBusiness.claimStatus)}`}>
                                    {businessClaimStatusLabel(selectedBusiness.claimStatus)}
                                </span>
                            )}
                        >
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Estado actual</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                        {selectedBusiness.claimStatus === 'CLAIMED'
                                            ? 'La organizacion ya opera este negocio.'
                                            : selectedBusiness.claimStatus === 'PENDING_CLAIM'
                                                ? 'Hay una solicitud activa esperando decision.'
                                                : 'Todavia falta completar el control del claim.'}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                        {latestSelectedClaimRequest
                                            ? `Ultimo movimiento: ${claimStatusLabel(latestSelectedClaimRequest.status).toLowerCase()} por ${latestSelectedClaimRequest.evidenceType.toLowerCase().replace('_', ' ')}.`
                                            : 'Todavia no hay solicitudes recientes asociadas a este negocio en el dashboard.'}
                                    </p>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Checklist minimo</p>
                                    <div className="mt-3 space-y-2">
                                        {[
                                            {
                                                label: 'Negocio vinculado',
                                                detail: selectedBusiness.claimStatus === 'CLAIMED'
                                                    ? 'Ownership confirmado para esta organizacion.'
                                                    : 'Aun falta confirmar el ownership.',
                                                done: selectedBusiness.claimStatus === 'CLAIMED',
                                            },
                                            {
                                                label: 'Solicitud en curso',
                                                detail: latestSelectedClaimRequest
                                                    ? `${claimStatusLabel(latestSelectedClaimRequest.status)} en el expediente mas reciente.`
                                                    : 'No hay solicitudes activas en este momento.',
                                                done: Boolean(latestSelectedClaimRequest),
                                            },
                                            {
                                                label: 'Perfil base listo',
                                                detail: (selectedBusiness.profileCompletenessScore ?? 0) >= 80
                                                    ? 'La ficha tiene contexto suficiente para seguir con verificacion.'
                                                    : 'Completa campos base antes de escalar procesos sensibles.',
                                                done: (selectedBusiness.profileCompletenessScore ?? 0) >= 80,
                                            },
                                        ].map((item) => (
                                            <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
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
                                </div>
                            </div>

                            {selectedBusinessClaimRequests.length > 0 ? (
                                <div className="card-list mt-4">
                                    <div className="card-list__header">
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Historial reciente</p>
                                        <p className="text-xs text-slate-500">{selectedBusinessClaimRequests.length} eventos</p>
                                    </div>
                                    {selectedBusinessClaimRequests.slice(0, 3).map((claim) => (
                                        <div key={claim.id} className="card-list__item items-start justify-between">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-slate-900">{claimStatusLabel(claim.status)}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Evidencia {claim.evidenceType.toLowerCase().replace('_', ' ')} · {formatDateTimeDo(claim.createdAt)}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${claimStatusClass(claim.status)}`}>
                                                {claimStatusLabel(claim.status)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    title="Sin eventos recientes"
                                    body="Cuando este negocio tenga un nuevo movimiento de claim, aparecera aqui con trazabilidad compacta."
                                    className="mt-4"
                                />
                            )}
                        </SectionCard>

                        <SectionCard
                            title="Readiness de verificacion"
                            description="Estado primero, luego evidencia y solo despues solicitud formal."
                            density="compact"
                            actions={(
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusChipClass(verificationStatus?.verificationStatus || 'UNVERIFIED')}`}>
                                    {statusLabel(verificationStatus?.verificationStatus || 'UNVERIFIED')}
                                </span>
                            )}
                        >
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Documentos</p>
                                    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{documentSummary.total}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {documentSummary.approved} aprobados · {documentSummary.pending} pendientes · {documentSummary.rejected} rechazados
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Perfil util</p>
                                    <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                                        {selectedBusiness.profileCompletenessScore ?? 0}%
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {(selectedBusiness.profileCompletenessScore ?? 0) >= 80
                                            ? 'Base suficiente para enviar un expediente claro.'
                                            : 'Conviene completar la ficha antes de enviar mas evidencia.'}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Siguiente paso sugerido</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                    {verificationStatus?.verified
                                        ? 'Mantener el expediente limpio y responder si el equipo solicita contexto adicional.'
                                        : documentSummary.total === 0
                                            ? 'Empieza cargando evidencia basica antes de solicitar revision.'
                                            : verificationStatus?.verificationSubmittedAt
                                                ? 'El expediente ya fue enviado. Ahora conviene esperar revision o responder observaciones.'
                                                : 'El expediente ya tiene evidencia. Puedes pasar a solicitud de revision.'}
                                </p>
                                {selectedBusiness.missingCoreFields && selectedBusiness.missingCoreFields.length > 0 ? (
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                        Faltan campos base: {selectedBusiness.missingCoreFields.slice(0, 3).join(', ')}
                                        {selectedBusiness.missingCoreFields.length > 3 ? ` +${selectedBusiness.missingCoreFields.length - 3}` : ''}
                                    </p>
                                ) : (
                                    <p className="mt-2 text-xs leading-5 text-slate-500">
                                        La ficha ya tiene cobertura minima para seguir con procesos de compliance.
                                    </p>
                                )}
                            </div>
                        </SectionCard>
                    </div>
                </section>
            )}

            {selectedBusiness && activeWorkspace !== 'overview' && (
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
                    <AppCard
                        title="Negocio activo"
                        description="Cambia el contexto del dashboard sin salir del workspace actual."
                        className="card-filter density-compact"
                    >
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
                    </AppCard>
                </section>
            )}

            {/* ═══ Tabs de workspace ═══ */}
            {activeOrganizationId && (
                <section className="page-section">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="page-kicker">{activeWorkspaceMeta.label}</p>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                                Cambia de workspace sin salir del contexto del negocio actual. El shell y la URL quedan alineados.
                            </p>
                        </div>
                        {selectedBusiness ? (
                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Claim</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                        {selectedBusiness.claimStatus === 'CLAIMED'
                                            ? 'Activo'
                                            : selectedBusiness.claimStatus === 'PENDING_CLAIM'
                                                ? 'En revisión'
                                                : 'Pendiente'}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Verificación</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                        {verificationStatus ? statusLabel(verificationStatus.verificationStatus) : 'Sin enviar'}
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Salud perfil</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                        {selectedBusiness.profileCompletenessScore ?? 0}% completo
                                    </p>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="workspace-strip mt-5" role="tablist" aria-label="Áreas de trabajo">
                        {WORKSPACE_TABS.map((tab) => {
                            const isActive = activeWorkspace === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    role="tab"
                                    type="button"
                                    aria-selected={isActive}
                                    onClick={() => handleWorkspaceChange(tab.id)}
                                    className={`workspace-strip__button shrink-0 ${
                                        isActive ? 'workspace-strip__button--active' : ''
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </section>
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
                        <SectionCard
                            title="Claims recientes"
                            description={`${claimSummary.PENDING ?? 0} pendientes y ${claimSummary.UNDER_REVIEW ?? 0} en revision`}
                            density="compact"
                        >
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
