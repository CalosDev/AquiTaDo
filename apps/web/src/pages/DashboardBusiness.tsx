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

function getClaimRequestStatusLabel(status: MyClaimRequestItem['status']): string {
    switch (status) {
        case 'UNDER_REVIEW':
            return 'En revisión';
        case 'APPROVED':
            return 'Aprobado';
        case 'REJECTED':
            return 'Rechazado';
        case 'EXPIRED':
            return 'Expirado';
        case 'CANCELED':
            return 'Cancelado';
        default:
            return 'Pendiente';
    }
}

function getClaimRequestStatusClass(status: MyClaimRequestItem['status']): string {
    switch (status) {
        case 'APPROVED':
            return 'bg-primary-100 text-primary-700';
        case 'UNDER_REVIEW':
            return 'bg-blue-100 text-blue-700';
        case 'REJECTED':
        case 'CANCELED':
            return 'bg-red-100 text-red-700';
        case 'EXPIRED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-amber-100 text-amber-700';
    }
}

function getBusinessClaimStatusLabel(status?: BusinessItem['claimStatus']): string {
    switch (status) {
        case 'CLAIMED':
            return 'Reclamado';
        case 'PENDING_CLAIM':
            return 'Claim pendiente';
        case 'SUSPENDED':
            return 'Claim suspendido';
        default:
            return 'No reclamado';
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

function LazyBillingSectionFallback() {
    return (
        <section className="section-shell p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <div className="h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-8 w-64 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="h-10 w-36 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="h-3 w-16 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-3 h-7 w-20 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="h-5 w-40 rounded-full bg-slate-100 animate-pulse" />
                    <div className="mt-4 h-48 rounded-3xl bg-slate-50 animate-pulse" />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="h-5 w-32 rounded-full bg-slate-100 animate-pulse" />
                    <div className="mt-4 h-48 rounded-3xl bg-slate-50 animate-pulse" />
                </div>
            </div>
        </section>
    );
}

function LazyOperationsSectionFallback() {
    return (
        <section className="section-shell p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <div className="h-3 w-32 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-8 w-72 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="h-10 w-36 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="h-5 w-40 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-4 h-48 rounded-3xl bg-slate-50 animate-pulse" />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="h-5 w-40 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-4 h-56 rounded-3xl bg-slate-50 animate-pulse" />
                    </div>
                ))}
            </div>
        </section>
    );
}

function LazyOrganizationSectionFallback() {
    return (
        <section className="section-shell p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <div className="h-3 w-32 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-8 w-80 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="h-10 w-36 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="h-3 w-20 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-3 h-7 w-16 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="h-5 w-44 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-4 h-56 rounded-3xl bg-slate-50 animate-pulse" />
                    </div>
                ))}
            </div>
        </section>
    );
}

function LazyGrowthSectionFallback() {
    return (
        <section className="section-shell p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                    <div className="h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-8 w-72 rounded-full bg-slate-100 animate-pulse" />
                </div>
                <div className="h-10 w-36 rounded-full bg-slate-100 animate-pulse" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="h-3 w-20 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-3 h-7 w-16 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                    <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="h-5 w-44 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-4 h-56 rounded-3xl bg-slate-50 animate-pulse" />
                    </div>
                ))}
            </div>
        </section>
    );
}

export function DashboardBusiness() {
    const {
        activeOrganization,
        activeOrganizationId,
        loading: organizationLoading,
        organizations,
    } = useOrganization();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [activeWorkspace, setActiveWorkspace] = useState<OwnerWorkspaceId>('overview');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const [businesses, setBusinesses] = useState<BusinessItem[]>([]);
    const [selectedBusinessId, setSelectedBusinessId] = useState('');
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [claimRequests, setClaimRequests] = useState<MyClaimRequestItem[]>([]);
    const [claimSummary, setClaimSummary] = useState<Record<string, number>>({});

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
    const activeClaimRequests = useMemo(
        () => claimRequests.filter((claimRequest) => claimRequest.status === 'PENDING' || claimRequest.status === 'UNDER_REVIEW'),
        [claimRequests],
    );
    const workspaceTabs = useMemo(
        () => ([
            {
                id: 'overview' as const,
                label: 'Resumen',
                description: 'Claims, portafolio y verificacion',
                badge: `${businesses.length} negocios`,
            },
            {
                id: 'operations' as const,
                label: 'Operacion',
                description: 'Reservas, mensajeria y ejecucion',
                badge: selectedBusiness ? selectedBusiness.name : 'Negocio',
            },
            {
                id: 'growth' as const,
                label: 'Crecimiento',
                description: 'Visibilidad, campanas y demanda',
                badge: `${totals.views ?? 0} vistas`,
            },
            {
                id: 'billing' as const,
                label: 'Facturacion',
                description: 'Plan, wallet y pagos',
                badge: activeOrganization ? activeOrganization.name : 'Requiere org',
            },
            {
                id: 'organization' as const,
                label: 'Organizacion',
                description: 'Equipo, permisos y gobierno',
                badge: `${organizations.length} org`,
            },
        ]),
        [activeOrganization, businesses.length, organizations.length, selectedBusiness, totals.views],
    );
    const openNowCount = useMemo(
        () => businesses.filter((business) => business.openNow).length,
        [businesses],
    );
    const selectedBusinessMissingFields = selectedBusiness?.missingCoreFields ?? [];
    const overviewMetrics = useMemo(
        () => ([
            {
                label: 'Vistas calificadas',
                value: `${(totals.views ?? 0).toLocaleString('es-DO')}`,
                meta: '+12% vs mes pasado',
            },
            {
                label: 'Clicks a contacto',
                value: `${(totals.clicks ?? 0).toLocaleString('es-DO')}`,
                meta: `${activeClaimRequests.length} claims activos`,
            },
            {
                label: 'Conversión',
                value: `${totals.conversionRate ?? 0}%`,
                meta: verificationStatus?.verified ? 'Con perfil verificado' : 'Aún sin KYC completo',
            },
            {
                label: 'Perfiles fuertes',
                value: `${completeProfiles}`,
                meta: `${openNowCount} abiertos ahora`,
            },
        ]),
        [
            activeClaimRequests.length,
            completeProfiles,
            openNowCount,
            totals.clicks,
            totals.conversionRate,
            totals.views,
            verificationStatus?.verified,
        ],
    );
    const focusChecklist = useMemo(() => {
        const items: string[] = [];

        if (selectedBusinessMissingFields.length > 0) {
            items.push(`Completar ${selectedBusinessMissingFields.slice(0, 2).join(' y ')}.`);
        }

        if (!verificationStatus?.verified) {
            items.push('Subir o revisar la documentación de verificación.');
        }

        if (activeClaimRequests.length > 0) {
            items.push(`Atender ${activeClaimRequests.length} claims activos antes de publicar más visibilidad.`);
        }

        if (items.length === 0) {
            items.push('La base está estable. El siguiente paso es activar campañas o promoción puntual.');
        }

        return items.slice(0, 3);
    }, [activeClaimRequests.length, selectedBusinessMissingFields, verificationStatus?.verified]);
    const activeWorkspaceMeta = workspaceTabs.find((workspace) => workspace.id === activeWorkspace) ?? workspaceTabs[0];
    const selectedBusinessSummary = selectedBusiness
        ? `${selectedBusiness.verified ? 'Publicado' : 'En preparación'} · ${getBusinessClaimStatusLabel(selectedBusiness.claimStatus)}`
        : 'Selecciona un negocio para centrar la operación.';

    const loadClaimRequests = useCallback(async () => {
        try {
            const response = await businessApi.getMyClaimRequests({ limit: 10 });
            setClaimRequests(asArray<MyClaimRequestItem>(response.data));
            setClaimSummary(((response.data as { summary?: Record<string, number> } | undefined)?.summary || {}) as Record<string, number>);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el estado de tus claims'));
        }
    }, []);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const [businessesRes, metricsRes, claimRequestsRes] = await Promise.all([
                businessApi.getMine(),
                analyticsApi.getMyDashboard({ days: 30 }),
                businessApi.getMyClaimRequests({ limit: 10 }),
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
            setClaimRequests(asArray<MyClaimRequestItem>(claimRequestsRes.data));
            setClaimSummary(((claimRequestsRes.data as { summary?: Record<string, number> } | undefined)?.summary || {}) as Record<string, number>);

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
            void loadClaimRequests();
            return;
        }

        void loadDashboard();
    }, [activeOrganizationId, loadClaimRequests, loadDashboard, organizationLoading]);

    useEffect(() => {
        if (!activeOrganizationId || !selectedBusinessId) {
            return;
        }
        void loadVerificationData(selectedBusinessId);
    }, [activeOrganizationId, loadVerificationData, selectedBusinessId]);

    useEffect(() => {
        if (!activeOrganizationId && activeWorkspace !== 'overview') {
            setActiveWorkspace('overview');
        }
    }, [activeOrganizationId, activeWorkspace]);

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
        <div className="page-shell animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'business-dashboard-error', tone: 'danger', text: errorMessage },
                    { id: 'business-dashboard-success', tone: 'info', text: successMessage },
                ]}
            />

            <div className="owner-dashboard-shell">
                <aside className="owner-dashboard-sidebar space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xl font-black text-white">
                            A
                        </div>
                        <div>
                            <p className="font-display text-2xl font-bold text-white">AquiTa.do</p>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-blue-100/80">
                                Control center para negocios
                            </p>
                        </div>
                    </div>

                    <div className="owner-dashboard-glass-card p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-100/78">
                            Organización activa
                        </p>
                        <h2 className="mt-3 font-display text-2xl font-bold text-white">
                            {activeOrganization?.name || 'Negocio independiente'}
                        </h2>
                        <p className="mt-2 text-sm text-blue-50/88">{selectedBusinessSummary}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            <span className="kpi-chip-soft">
                                {verificationStatus?.verified ? 'KYC aprobado' : 'KYC pendiente'}
                            </span>
                            <span className="kpi-chip-soft">{businesses.length} negocios</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-100/75">
                            Áreas de trabajo
                        </p>
                        {workspaceTabs.map((workspace) => {
                            const disabled = workspace.id !== 'overview' && !activeOrganizationId;
                            const active = activeWorkspace === workspace.id;

                            return (
                                <button
                                    key={workspace.id}
                                    type="button"
                                    className={`owner-dashboard-glass-card w-full px-4 py-3 text-left transition-all ${
                                        active
                                            ? 'border-white/18 bg-white/14 shadow-[0_22px_34px_-28px_rgba(6,54,168,0.72)]'
                                            : 'opacity-92 hover:bg-white/12'
                                    } ${disabled ? 'cursor-not-allowed opacity-55 hover:bg-white/8' : ''}`}
                                    onClick={() => {
                                        if (!disabled) {
                                            setActiveWorkspace(workspace.id);
                                        }
                                    }}
                                    aria-pressed={active}
                                    disabled={disabled}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-white">{workspace.label}</p>
                                            <p className="mt-1 text-xs text-blue-100/72">{workspace.description}</p>
                                        </div>
                                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85">
                                            {workspace.badge}
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="owner-dashboard-glass-card p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-100/78">
                            Enfoque de hoy
                        </p>
                        <h3 className="mt-3 font-display text-2xl font-bold text-white">
                            Menos módulos, más decisión.
                        </h3>
                        <div className="mt-4 space-y-3">
                            {focusChecklist.map((item) => (
                                <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-white/8 px-3 py-3">
                                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                                    <p className="text-sm leading-6 text-blue-50/88">{item}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                <div className="owner-dashboard-main">
                    <section className="owner-dashboard-hero">
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_320px]">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100/90">
                                    {activeWorkspaceMeta.label}
                                </p>
                                <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight text-white lg:text-[2.9rem]">
                                    Un panel que prioriza lo que mueve el negocio.
                                </h1>
                                <p className="mt-3 max-w-2xl text-base leading-7 text-blue-50/88">
                                    El dashboard deja de apilar bloques y pasa a operar como un centro de trabajo:
                                    negocio activo arriba, navegación persistente a la izquierda y una narrativa clara
                                    entre catálogo, claims y verificación.
                                </p>

                                <div className="mt-5 flex flex-wrap gap-2.5">
                                    <span className="kpi-chip-soft">
                                        Seleccionado: {selectedBusiness?.name || 'Ninguno'}
                                    </span>
                                    <span className="kpi-chip-soft">
                                        Estado KYC: {getStatusLabel(verificationStatus?.verificationStatus || 'UNVERIFIED')}
                                    </span>
                                    <span className="kpi-chip-soft">
                                        Claim activo: {getBusinessClaimStatusLabel(selectedBusiness?.claimStatus)}
                                    </span>
                                    <span className="kpi-chip-soft">
                                        Claims en curso: {activeClaimRequests.length}
                                    </span>
                                </div>

                                <div className="role-hero-actions mt-6">
                                    <Link className="btn-primary role-hero-action" to="/register-business">
                                        Registrar otro negocio
                                    </Link>
                                    {selectedBusinessId && (
                                        <Link
                                            className="btn-secondary role-hero-action !border-white/20 !bg-white/90 !text-primary-900 hover:!bg-white"
                                            to={`/dashboard/businesses/${selectedBusinessId}/edit`}
                                        >
                                            Editar negocio
                                        </Link>
                                    )}
                                    <Link className="btn-secondary role-hero-action !border-white/20 !bg-white/10 !text-white hover:!bg-white/16" to="/profile">
                                        Editar perfil
                                    </Link>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <article className="rounded-[26px] border border-white/14 bg-white/92 p-5 text-slate-900 shadow-[0_24px_40px_-32px_rgba(8,27,91,0.45)]">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-700">Salud del perfil</p>
                                    <div className="mt-3 flex items-end gap-3">
                                        <p className="font-display text-5xl font-bold leading-none text-slate-950">
                                            {selectedBusiness?.profileCompletenessScore ?? 0}
                                        </p>
                                        <p className="pb-1 text-sm font-medium text-slate-500">/100</p>
                                    </div>
                                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-primary-100">
                                        <div
                                            className="h-full rounded-full bg-[linear-gradient(90deg,#0e4dff_0%,#ff3b6a_100%)]"
                                            style={{ width: `${selectedBusiness?.profileCompletenessScore ?? 0}%` }}
                                        />
                                    </div>
                                    <p className="mt-3 text-sm leading-6 text-slate-600">
                                        {selectedBusinessMissingFields.length > 0
                                            ? `Aún faltan ${selectedBusinessMissingFields.slice(0, 3).join(', ')} para cerrar la ficha.`
                                            : 'La base está completa. El siguiente paso es exprimir visibilidad y conversiones.'}
                                    </p>
                                </article>

                                <article className="rounded-[26px] border border-white/12 bg-white/10 p-5 backdrop-blur-md">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-100/88">
                                        Siguiente mejor jugada
                                    </p>
                                    <div className="mt-4 space-y-3">
                                        {focusChecklist.map((item) => (
                                            <div key={item} className="flex gap-3 rounded-2xl border border-white/12 bg-white/8 px-3 py-3">
                                                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                                                <p className="text-sm leading-6 text-blue-50/90">{item}</p>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            </div>
                        </div>
                    </section>

                    {activeWorkspace === 'overview' && needsFirstBusinessSetup && (
                        <section className="owner-dashboard-soft-card border border-primary-200 bg-primary-50/75">
                            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-700">Primer paso</p>
                            <h2 className="mt-2 font-display text-3xl font-bold text-slate-900">Registra tu primer negocio</h2>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                                La organización solo se prepara dentro del flujo de negocio, cuando publicas tu primer negocio
                                o entras a una invitación. Las cuentas cliente no crean organización por sí solas.
                            </p>
                            <div className="mt-5 flex flex-wrap gap-3">
                                <Link className="btn-primary" to="/register-business">
                                    Registrar negocio ahora
                                </Link>
                                <Link className="btn-secondary" to="/businesses">
                                    Ver directorio público
                                </Link>
                            </div>
                        </section>
                    )}

                    {activeWorkspace === 'overview' && (
                        <>
                            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                                {overviewMetrics.map((metric) => (
                                    <article key={metric.label} className="owner-dashboard-metric">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700/80">
                                            {metric.label}
                                        </p>
                                        <p className="mt-3 font-display text-[2.35rem] font-bold leading-none text-slate-950">
                                            {metric.value}
                                        </p>
                                        <p className="mt-3 text-sm text-slate-500">{metric.meta}</p>
                                    </article>
                                ))}
                            </section>

                            <section className="grid grid-cols-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                                <article className="owner-dashboard-soft-card">
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Portafolio</p>
                                            <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">Mis negocios</h2>
                                            <p className="mt-2 text-sm text-slate-600">
                                                Una lectura rápida de ficha, estado público y próximas correcciones.
                                            </p>
                                        </div>
                                        {selectedBusinessId && (
                                            <Link
                                                to={`/dashboard/businesses/${selectedBusinessId}/edit`}
                                                className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                                            >
                                                Editar seleccionado
                                            </Link>
                                        )}
                                    </div>

                                    {businesses.length === 0 ? (
                                        <p className="text-sm text-slate-500">Aún no tienes negocios creados.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {businesses.map((business) => (
                                                <button
                                                    type="button"
                                                    key={business.id}
                                                    className={`w-full rounded-[22px] border px-4 py-4 text-left transition-all ${
                                                        selectedBusinessId === business.id
                                                            ? 'border-primary-300 bg-primary-50 shadow-sm'
                                                            : 'border-slate-200/80 bg-white hover:border-primary-100 hover:shadow-sm'
                                                    }`}
                                                    onClick={() => setSelectedBusinessId(business.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="font-semibold text-slate-900">{business.name}</p>
                                                            <p className="mt-1 text-xs text-slate-500">
                                                                {business.verified ? 'Publicado y verificado' : 'Pendiente de verificación'}
                                                            </p>
                                                        </div>
                                                        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700">
                                                            {business.profileCompletenessScore ?? 0}%
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
                                                            {getBusinessClaimStatusLabel(business.claimStatus)}
                                                        </span>
                                                        {business.openNow !== null && business.openNow !== undefined ? (
                                                            <span className={`rounded-full px-2.5 py-1 text-[11px] ${
                                                                business.openNow
                                                                    ? 'bg-primary-100 text-primary-700'
                                                                    : 'bg-slate-100 text-slate-600'
                                                            }`}>
                                                                {business.openNow ? 'Abierto ahora' : 'Cerrado ahora'}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {business.missingCoreFields && business.missingCoreFields.length > 0 ? (
                                                        <p className="mt-3 text-[11px] leading-5 text-amber-700">
                                                            Faltan: {business.missingCoreFields.slice(0, 3).join(', ')}
                                                        </p>
                                                    ) : null}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </article>

                                <Suspense fallback={<LazyOwnerSectionFallback label="Cargando verificación documental" />}>
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

                            <section className="owner-dashboard-soft-card">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Claim / ownership</p>
                                        <h2 className="mt-2 font-display text-2xl font-bold text-slate-900">Estado de tus reclamaciones</h2>
                                        <p className="mt-2 text-sm text-slate-600">
                                            Reclamaciones visibles como una cola de decisiones, no como otro módulo perdido.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED'] as const).map((status) => (
                                            <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                {status}: {claimSummary[status] ?? 0}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {claimRequests.length > 0 ? (
                                    <div className="mt-5 grid gap-3 xl:grid-cols-2">
                                        {claimRequests.map((claimRequest) => (
                                            <article key={claimRequest.id} className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-semibold text-slate-900">{claimRequest.business.name}</p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            Enviada {new Date(claimRequest.createdAt).toLocaleDateString('es-DO')}
                                                        </p>
                                                    </div>
                                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getClaimRequestStatusClass(claimRequest.status)}`}>
                                                        {getClaimRequestStatusLabel(claimRequest.status)}
                                                    </span>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                                                    <span className="rounded-full bg-white px-2.5 py-1">
                                                        Evidencia: {claimRequest.evidenceType}
                                                    </span>
                                                    <span className="rounded-full bg-white px-2.5 py-1">
                                                        Perfil: {getBusinessClaimStatusLabel(claimRequest.business.claimStatus)}
                                                    </span>
                                                </div>
                                                <div className="mt-4 flex flex-wrap gap-3">
                                                    <Link className="btn-secondary text-sm" to={`/businesses/${claimRequest.business.slug}`}>
                                                        Ver ficha
                                                    </Link>
                                                    {claimRequest.business.claimStatus === 'CLAIMED' ? (
                                                        <span className="text-sm text-primary-700">
                                                            Si ya fue aprobado, este perfil debe aparecer también en “Mis negocios”.
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-5 text-sm text-slate-600">
                                        Todavía no tienes reclamaciones registradas. Si encuentras tu negocio en el directorio,
                                        ábrelo y usa la opción para reclamarlo.
                                    </p>
                                )}
                            </section>
                        </>
                    )}

                    {activeWorkspace === 'billing' && (
                        <Suspense fallback={<LazyBillingSectionFallback />}>
                            <BillingWorkspace
                                activeOrganizationId={activeOrganizationId}
                                organizationName={activeOrganization?.name || null}
                            />
                        </Suspense>
                    )}

                    {activeWorkspace === 'operations' && (
                        <Suspense fallback={<LazyOperationsSectionFallback />}>
                            <OperationsWorkspace
                                activeOrganizationId={activeOrganizationId}
                                businesses={businesses.map((business) => ({
                                    id: business.id,
                                    name: business.name,
                                    slug: business.slug,
                                }))}
                                selectedBusinessId={selectedBusinessId}
                            />
                        </Suspense>
                    )}

                    {activeWorkspace === 'growth' && (
                        <Suspense fallback={<LazyGrowthSectionFallback />}>
                            <GrowthWorkspace
                                activeOrganizationId={activeOrganizationId}
                                businesses={businesses.map((business) => ({
                                    id: business.id,
                                    name: business.name,
                                    slug: business.slug,
                                }))}
                                selectedBusinessId={selectedBusinessId}
                            />
                        </Suspense>
                    )}

                    {activeWorkspace === 'organization' && (
                        <Suspense fallback={<LazyOrganizationSectionFallback />}>
                            <OrganizationWorkspace
                                activeOrganizationId={activeOrganizationId}
                                organizationName={activeOrganization?.name || null}
                                businesses={businesses.map((business) => ({
                                    id: business.id,
                                    name: business.name,
                                    slug: business.slug,
                                }))}
                                selectedBusinessId={selectedBusinessId}
                            />
                        </Suspense>
                    )}
                </div>
            </div>
        </div>
    );
}
