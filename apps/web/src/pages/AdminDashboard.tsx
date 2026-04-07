import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiErrorMessage } from '../api/error';
import {
    aiApi,
    analyticsApi,
    businessApi,
    categoryApi,
    healthApi,
    observabilityApi,
    reviewApi,
    verificationApi,
} from '../api/endpoints';
import {
    EMPTY_OBSERVABILITY_SUMMARY,
    healthStatusClass,
    normalizeBusinessVerificationStatus,
    parseObservabilitySummary,
    toSlug,
    verificationStatusClass,
    verificationStatusLabel,
    type BusinessVerificationState,
    type ObservabilitySummary,
} from './admin-dashboard/helpers';
import { GrowthInsightsPanel } from './admin-dashboard/GrowthInsightsPanel';
import { VerificationQueueSection } from './admin-dashboard/VerificationQueueSection';
import type { GrowthInsightsSnapshot, ModerationQueueItem } from './admin-dashboard/types';
import { PageFeedbackStack } from '../components/PageFeedbackStack';

interface Business {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    verificationStatus: BusinessVerificationState;
    createdAt: string;
    profileCompletenessScore?: number;
    missingCoreFields?: string[];
    openNow?: boolean | null;
    owner?: { name: string };
    organization?: { id: string; name: string; slug: string };
    province?: { id: string; name: string; slug: string };
    _count?: { reviews: number };
}

interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    parentId?: string | null;
    parent?: { id: string; name: string } | null;
    children?: Array<{ id: string; name: string }>;
    _count?: { businesses: number };
}

interface CatalogQualitySnapshot {
    totalBusinesses: number;
    incompleteCount: number;
    duplicateClusterCount: number;
    incompleteBusinesses: Array<{
        id: string;
        slug: string;
        name: string;
        profileCompletenessScore: number;
        missingCoreFields: string[];
        city?: { name: string } | null;
        province?: { name: string } | null;
    }>;
    duplicateCandidates: Array<{
        key: string;
        reasons: string[];
        businesses: Array<{
            id: string;
            slug: string;
            name: string;
            city?: { name: string } | null;
            province?: { name: string } | null;
        }>;
    }>;
}

interface PendingVerificationBusiness {
    id: string;
    name: string;
    slug: string;
    riskScore: number;
    verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'UNVERIFIED';
    verificationSubmittedAt?: string | null;
    verificationNotes?: string | null;
    organization: {
        id: string;
        name: string;
        slug: string;
    };
    documents: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
    };
}

interface MarketReport {
    id: string;
    reportType: 'PROVINCE_CATEGORY_DEMAND' | 'TRENDING_BUSINESSES' | 'CONVERSION_BENCHMARK';
    generatedAt: string;
    generatedByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface FlaggedReview {
    id: string;
    rating: number;
    comment?: string | null;
    moderationReason?: string | null;
    flaggedAt?: string | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
    };
    business: {
        id: string;
        name: string;
    };
}

interface ReviewAiSentimentInsight {
    reviewId: string;
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    score: number;
    summary: string | null;
    isNegative: boolean;
}

interface OperationalDashboardSnapshot {
    status: 'up' | 'degraded' | 'down';
    timestamp: string;
    uptimeSeconds: number;
    responseTimeMs?: number;
    checks?: {
        database?: {
            status?: 'up' | 'degraded' | 'down';
            schema?: 'up' | 'down';
            pool?: {
                status?: 'up' | 'degraded' | 'down';
                activeConnections?: number;
                maxConnections?: number;
                saturationPct?: number;
            };
        };
        ai?: {
            status?: 'up' | 'degraded' | 'down';
            thresholdMs?: number;
            operations?: Array<{
                operation: string;
                p95Ms: number;
                errorRatePct: number;
            }>;
        };
        email?: {
            status?: 'up' | 'degraded' | 'down';
            thresholdMs?: number;
            reason?: string;
            operations?: Array<{
                operation: string;
                p95Ms: number;
                errorRatePct: number;
            }>;
        };
        whatsapp?: {
            status?: 'up' | 'degraded' | 'down';
            thresholdMs?: number;
            operations?: Array<{
                operation: string;
                p95Ms: number;
                errorRatePct: number;
            }>;
        };
    };
    passwordReset?: {
        providerConfigured?: boolean;
        requestsLast24h?: number;
        completionsLast24h?: number;
        completionRatePct?: number;
        activeTokens?: number;
        expiredPendingTokens?: number;
    };
}

interface MarketInsightsSnapshot {
    totals: {
        trackedBusinesses: number;
        views: number;
        clicks: number;
        conversions: number;
        reservationRequests: number;
        grossRevenue: number;
        conversionRate: number;
        reservationRequestRate: number;
    };
    topBusinesses: Array<{
        id: string;
        name: string;
        slug: string;
        stats: {
            views: number;
            clicks: number;
            conversions: number;
            reservationRequests: number;
            grossRevenue: number;
            conversionRate: number;
            averageRating: number;
            reviewCount: number;
        };
    }>;
    provinces: Array<{
        provinceId: string;
        provinceName: string;
        businessCount: number;
        views: number;
        conversions: number;
        reservationRequests: number;
        grossRevenue: number;
        conversionRate: number;
        averageRating: number;
    }>;
    categories: Array<{
        categoryId: string;
        categoryName: string;
        businessCount: number;
        views: number;
        conversions: number;
        reservationRequests: number;
        grossRevenue: number;
        conversionRate: number;
    }>;
}

interface MarketReportDetail extends MarketReport {
    summary?: Record<string, unknown> | null;
    filters?: Record<string, unknown> | null;
    periodStart?: string;
    periodEnd?: string;
}

type CategoryForm = {
    name: string;
    slug: string;
    icon: string;
    parentId: string;
};

const EMPTY_CATEGORY_FORM: CategoryForm = {
    name: '',
    slug: '',
    icon: '',
    parentId: '',
};
const DELETE_CONFIRMATION_TEXT = 'ELIMINAR';
export function AdminDashboard() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [catalogQuality, setCatalogQuality] = useState<CatalogQualitySnapshot | null>(null);
    const [catalogQualityLoading, setCatalogQualityLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'businesses' | 'categories' | 'catalog' | 'verification' | 'observability'>('businesses');
    const [businessSearch, setBusinessSearch] = useState('');
    const [businessStatusFilter, setBusinessStatusFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING' | 'SUSPENDED' | 'REJECTED'>('ALL');
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [confirmDeleteBusinessId, setConfirmDeleteBusinessId] = useState<string | null>(null);
    const [deleteBusinessReason, setDeleteBusinessReason] = useState('');
    const [deleteBusinessConfirmationText, setDeleteBusinessConfirmationText] = useState('');
    const [confirmDeleteCategoryId, setConfirmDeleteCategoryId] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [pendingVerifications, setPendingVerifications] = useState<PendingVerificationBusiness[]>([]);
    const [marketReports, setMarketReports] = useState<MarketReport[]>([]);
    const [marketInsights, setMarketInsights] = useState<MarketInsightsSnapshot | null>(null);
    const [growthInsights, setGrowthInsights] = useState<GrowthInsightsSnapshot | null>(null);
    const [selectedMarketReportId, setSelectedMarketReportId] = useState<string | null>(null);
    const [marketReportDetail, setMarketReportDetail] = useState<MarketReportDetail | null>(null);
    const [marketReportLoading, setMarketReportLoading] = useState(false);
    const [flaggedReviews, setFlaggedReviews] = useState<FlaggedReview[]>([]);
    const [reviewAiInsights, setReviewAiInsights] = useState<Record<string, ReviewAiSentimentInsight>>({});
    const [analyzingReviewId, setAnalyzingReviewId] = useState<string | null>(null);
    const [moderationQueue, setModerationQueue] = useState<ModerationQueueItem[]>([]);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [observabilityLoading, setObservabilityLoading] = useState(false);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [observabilityRaw, setObservabilityRaw] = useState('');
    const [observabilitySummary, setObservabilitySummary] = useState<ObservabilitySummary>(EMPTY_OBSERVABILITY_SUMMARY);
    const [operationalHealth, setOperationalHealth] = useState<OperationalDashboardSnapshot | null>(null);
    const [operationalHealthLoading, setOperationalHealthLoading] = useState(false);

    const [newCategoryForm, setNewCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);

    const businessStatusSummary = useMemo(() => {
        const summary = {
            total: businesses.length,
            verified: 0,
            pending: 0,
            suspended: 0,
            rejected: 0,
        };

        businesses.forEach((business) => {
            const status = normalizeBusinessVerificationStatus(business);
            if (status === 'VERIFIED') {
                summary.verified += 1;
                return;
            }
            if (status === 'SUSPENDED') {
                summary.suspended += 1;
                return;
            }
            if (status === 'REJECTED') {
                summary.rejected += 1;
                return;
            }
            summary.pending += 1;
        });

        return summary;
    }, [businesses]);

    const filteredBusinesses = useMemo(() => {
        const normalizedSearch = businessSearch.trim().toLowerCase();

        return businesses.filter((business) => {
            const status = normalizeBusinessVerificationStatus(business);
            const matchesStatus = businessStatusFilter === 'ALL'
                ? true
                : businessStatusFilter === 'PENDING'
                    ? (status === 'PENDING' || status === 'UNVERIFIED')
                    : status === businessStatusFilter;

            if (!matchesStatus) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const ownerName = business.owner?.name?.toLowerCase() || '';
            const organizationName = business.organization?.name?.toLowerCase() || '';
            const provinceName = business.province?.name?.toLowerCase() || '';

            return (
                business.name.toLowerCase().includes(normalizedSearch)
                || ownerName.includes(normalizedSearch)
                || organizationName.includes(normalizedSearch)
                || provinceName.includes(normalizedSearch)
            );
        });
    }, [businessSearch, businessStatusFilter, businesses]);
    const parentCategoryOptions = useMemo(
        () => categories.filter((category) => !category.parentId),
        [categories],
    );

    const loadData = useCallback(async () => {
        setErrorMessage('');

        try {
            const [businessesResponse, categoriesResponse] = await Promise.all([
                businessApi.getAllAdmin({ limit: 100 }),
                categoryApi.getAll(),
            ]);
            setBusinesses(businessesResponse.data.data || []);
            setCategories(categoriesResponse.data);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el panel admin'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const loadVerificationData = useCallback(async () => {
        setVerificationLoading(true);
        setInsightsLoading(true);
        try {
            const [
                pendingRes,
                reportsRes,
                flaggedReviewsRes,
                moderationQueueRes,
                marketInsightsRes,
                growthInsightsRes,
            ] = await Promise.all([
                verificationApi.getPendingBusinessesAdmin({ limit: 50 }),
                analyticsApi.listMarketReports({ limit: 20 }),
                reviewApi.getFlagged({ limit: 50 }),
                verificationApi.getModerationQueueAdmin({ limit: 80 }),
                analyticsApi.getMarketInsights({ days: 30, limit: 10 }),
                analyticsApi.getGrowthInsights({ days: 30, limit: 10 }),
            ]);
            const reports = (reportsRes.data || []) as MarketReport[];
            setPendingVerifications((pendingRes.data || []) as PendingVerificationBusiness[]);
            setMarketReports(reports);
            setFlaggedReviews((flaggedReviewsRes.data || []) as FlaggedReview[]);
            setModerationQueue((moderationQueueRes.data?.items || []) as ModerationQueueItem[]);
            setMarketInsights((marketInsightsRes.data || null) as MarketInsightsSnapshot | null);
            setGrowthInsights((growthInsightsRes.data || null) as GrowthInsightsSnapshot | null);
            setSelectedMarketReportId((current) => {
                if (current && reports.some((report) => report.id === current)) {
                    return current;
                }
                return reports[0]?.id ?? null;
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar verificación y data layer'));
            setMarketInsights(null);
            setGrowthInsights(null);
        } finally {
            setVerificationLoading(false);
            setInsightsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'verification') {
            void loadVerificationData();
        }
    }, [activeTab, loadVerificationData]);

    const loadMarketReportDetail = useCallback(async (reportId: string) => {
        if (!reportId) {
            setMarketReportDetail(null);
            return;
        }

        setMarketReportLoading(true);
        try {
            const response = await analyticsApi.getMarketReportById(reportId);
            setMarketReportDetail((response.data || null) as MarketReportDetail | null);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el detalle del reporte'));
            setMarketReportDetail(null);
        } finally {
            setMarketReportLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab !== 'verification' || !selectedMarketReportId) {
            setMarketReportDetail(null);
            return;
        }

        void loadMarketReportDetail(selectedMarketReportId);
    }, [activeTab, selectedMarketReportId, loadMarketReportDetail]);

    const loadObservabilityData = useCallback(async () => {
        setObservabilityLoading(true);
        setErrorMessage('');
        try {
            const response = await observabilityApi.getMetrics();
            const payload = typeof response.data === 'string'
                ? response.data
                : String(response.data ?? '');
            setObservabilityRaw(payload);
            setObservabilitySummary(parseObservabilitySummary(payload));
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar observabilidad'));
        } finally {
            setObservabilityLoading(false);
        }
    }, []);

    const loadCatalogQuality = useCallback(async () => {
        setCatalogQualityLoading(true);
        setErrorMessage('');

        try {
            const response = await businessApi.getCatalogQuality({ limit: 25 });
            setCatalogQuality((response.data || null) as CatalogQualitySnapshot | null);
        } catch (error) {
            setCatalogQuality(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la calidad del catalogo'));
        } finally {
            setCatalogQualityLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'catalog') {
            void loadCatalogQuality();
        }
    }, [activeTab, loadCatalogQuality]);

    const loadOperationalHealth = useCallback(async () => {
        setOperationalHealthLoading(true);
        try {
            const response = await healthApi.getDashboard();
            setOperationalHealth((response.data || null) as OperationalDashboardSnapshot | null);
        } catch (error) {
            setOperationalHealth(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el dashboard operacional'));
        } finally {
            setOperationalHealthLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTab === 'observability') {
            void loadObservabilityData();
            void loadOperationalHealth();
        }
    }, [activeTab, loadObservabilityData, loadOperationalHealth]);

    const handleDeleteBusiness = async (businessId: string, reason: string) => {
        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.delete(businessId, {
                reason: reason.trim(),
            });
            setBusinesses((current) => current.filter((business) => business.id !== businessId));
            setSuccessMessage('Negocio eliminado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar el negocio'));
        } finally {
            setProcessingId(null);
            setConfirmDeleteBusinessId(null);
            setDeleteBusinessReason('');
            setDeleteBusinessConfirmationText('');
        }
    };

    const requestBusinessDelete = (businessId: string) => {
        setDeleteBusinessReason('');
        setDeleteBusinessConfirmationText('');
        setConfirmDeleteBusinessId(businessId);
    };

    const cancelBusinessDelete = () => {
        setConfirmDeleteBusinessId(null);
        setDeleteBusinessReason('');
        setDeleteBusinessConfirmationText('');
    };

    const handleCreateCategory = async (event: React.FormEvent) => {
        event.preventDefault();

        const slug = newCategoryForm.slug.trim() || toSlug(newCategoryForm.name);
        if (!newCategoryForm.name.trim() || !slug) {
            setErrorMessage('Nombre y slug son obligatorios');
            return;
        }

        setProcessingId('create-category');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await categoryApi.create({
                name: newCategoryForm.name.trim(),
                slug,
                icon: newCategoryForm.icon.trim() || undefined,
                parentId: newCategoryForm.parentId || undefined,
            });
            setNewCategoryForm(EMPTY_CATEGORY_FORM);
            await loadData();
            setSuccessMessage('Categoria creada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la categoría'));
        } finally {
            setProcessingId(null);
        }
    };

    const startCategoryEdit = (category: Category) => {
        setEditingCategoryId(category.id);
        setEditingCategoryForm({
            name: category.name,
            slug: category.slug,
            icon: category.icon || '',
            parentId: category.parentId || '',
        });
        setErrorMessage('');
        setSuccessMessage('');
    };

    const cancelCategoryEdit = () => {
        setEditingCategoryId(null);
        setEditingCategoryForm(EMPTY_CATEGORY_FORM);
    };

    const saveCategoryEdit = async (categoryId: string) => {
        if (!editingCategoryForm.name.trim() || !editingCategoryForm.slug.trim()) {
            setErrorMessage('Nombre y slug son obligatorios');
            return;
        }

        setProcessingId(categoryId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await categoryApi.update(categoryId, {
                name: editingCategoryForm.name.trim(),
                slug: toSlug(editingCategoryForm.slug.trim()),
                icon: editingCategoryForm.icon.trim() || undefined,
                parentId: editingCategoryForm.parentId || null,
            });
            await loadData();
            cancelCategoryEdit();
            setSuccessMessage('Categoria actualizada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la categoría'));
        } finally {
            setProcessingId(null);
        }
    };

    const deleteCategory = async (categoryId: string) => {
        setProcessingId(categoryId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await categoryApi.delete(categoryId);
            setCategories((current) => current.filter((category) => category.id !== categoryId));
            if (editingCategoryId === categoryId) {
                cancelCategoryEdit();
            }
            setSuccessMessage('Categoria eliminada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la categoría'));
        } finally {
            setProcessingId(null);
            setConfirmDeleteCategoryId(null);
        }
    };

    const requestCategoryDelete = (categoryId: string) => {
        if (confirmDeleteCategoryId === categoryId) {
            void deleteCategory(categoryId);
            return;
        }

        setConfirmDeleteCategoryId(categoryId);
    };

    const handleReviewVerification = async (
        businessId: string,
        status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED',
    ) => {
        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.reviewBusinessAdmin(businessId, {
                status,
                notes: status === 'VERIFIED'
                    ? 'Verificación aprobada por el equipo admin'
                    : 'Revisión administrativa',
            });
            await Promise.all([loadData(), loadVerificationData()]);
            setSuccessMessage('Revisión de verificación actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la verificación'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleGenerateMarketReport = async (
        reportType: 'PROVINCE_CATEGORY_DEMAND' | 'TRENDING_BUSINESSES' | 'CONVERSION_BENCHMARK',
    ) => {
        setGeneratingReport(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await analyticsApi.generateMarketReport({
                reportType,
                days: 30,
            });
            await loadVerificationData();
            setSuccessMessage('Reporte de mercado generado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo generar el reporte'));
        } finally {
            setGeneratingReport(false);
        }
    };

    const handleModerateFlaggedReview = async (
        reviewId: string,
        status: 'APPROVED' | 'FLAGGED',
    ) => {
        setProcessingId(reviewId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await reviewApi.moderate(reviewId, {
                status,
                reason: status === 'APPROVED'
                    ? 'Aprobada por el equipo de moderación'
                    : 'Mantenida en cola por riesgo',
            });
            await Promise.all([loadData(), loadVerificationData()]);
            setSuccessMessage(
                status === 'APPROVED'
                    ? 'Reseña aprobada y publicada'
                    : 'Reseña mantenida como sospechosa',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la reseña'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleReviewDocument = async (
        documentId: string,
        status: 'APPROVED' | 'REJECTED',
    ) => {
        setProcessingId(documentId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.reviewDocumentAdmin(documentId, {
                status,
                rejectionReason: status === 'REJECTED'
                    ? 'Documento rechazado por moderación administrativa'
                    : undefined,
            });
            await loadVerificationData();
            setSuccessMessage(
                status === 'APPROVED'
                    ? 'Documento aprobado correctamente'
                    : 'Documento rechazado correctamente',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo revisar el documento'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleResolvePreventiveModeration = async (
        businessId: string,
        decision: 'APPROVE_FOR_KYC' | 'KEEP_BLOCKED',
    ) => {
        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.resolvePreventiveModerationAdmin(businessId, {
                decision,
                notes: decision === 'APPROVE_FOR_KYC'
                    ? 'Liberado por moderacion preventiva para revision KYC'
                    : 'Bloqueo preventivo confirmado por revision administrativa',
            });
            await loadVerificationData();
            setSuccessMessage(
                decision === 'APPROVE_FOR_KYC'
                    ? 'Negocio liberado para entrar a la cola KYC'
                    : 'Negocio mantenido en bloqueo preventivo',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo resolver la premoderacion'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleAnalyzeFlaggedReview = async (reviewId: string) => {
        setAnalyzingReviewId(reviewId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await aiApi.analyzeReviewSentiment(reviewId);
            const payload = response.data as ReviewAiSentimentInsight;
            setReviewAiInsights((current) => ({
                ...current,
                [reviewId]: payload,
            }));
            setSuccessMessage('Análisis de IA generado para la reseña');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo analizar la reseña con IA'));
        } finally {
            setAnalyzingReviewId(null);
        }
    };

    const tabs = [
        { key: 'businesses', label: 'Negocios', icon: 'N' },
        { key: 'categories', label: 'Categorías', icon: 'C' },
        { key: 'catalog', label: 'Catalogo', icon: 'Q' },
        { key: 'verification', label: 'KYC + Data Layer', icon: 'K' },
        { key: 'observability', label: 'Observabilidad', icon: 'O' },
    ] as const;

    return (
        <div className="page-shell max-w-6xl animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'admin-dashboard-error', tone: 'danger', text: errorMessage },
                    { id: 'admin-dashboard-success', tone: 'info', text: successMessage },
                ]}
            />
            
            <section className="role-hero role-hero-admin mb-8">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-200 font-semibold">Panel Admin</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Control de plataforma</h1>
                <p className="text-slate-200 mt-2 max-w-2xl">
                    Gestión de negocios, categorías, moderación de contenido y salud operativa.
                </p>

                <div className="mt-5 role-kpi-grid !xl:grid-cols-4">
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Total negocios</p>
                        <p className="role-kpi-value">{businessStatusSummary.total}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Verificados</p>
                        <p className="role-kpi-value">{businessStatusSummary.verified}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Pendientes KYC</p>
                        <p className="role-kpi-value">{businessStatusSummary.pending}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Categorías</p>
                        <p className="role-kpi-value">{categories.length}</p>
                    </article>
                </div>
            </section>

            <p className="text-gray-500 mb-8">
                Gestión de negocios, categorías, moderación y observabilidad en un solo panel.
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
                {tabs.map((tab) => (
                    <button
                        type="button"
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        aria-current={activeTab === tab.key ? 'page' : undefined}
                        className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            activeTab === tab.key
                                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                                : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-400 hover:text-primary-700'
                        }`}
                    >
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-black/10 text-[11px] font-semibold">
                            {tab.icon}
                        </span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
            ) : (
                <>
                    {activeTab === 'businesses' && (
                        <div className="card overflow-hidden">
                            <div className="border-b border-gray-100 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <input
                                            type="text"
                                            value={businessSearch}
                                            onChange={(event) => setBusinessSearch(event.target.value)}
                                            className="input-field text-sm sm:w-80"
                                            placeholder="Buscar por negocio, propietario, organización o provincia"
                                        />
                                        <select
                                            value={businessStatusFilter}
                                            onChange={(event) =>
                                                setBusinessStatusFilter(
                                                    event.target.value as 'ALL' | 'VERIFIED' | 'PENDING' | 'SUSPENDED' | 'REJECTED',
                                                )
                                            }
                                            className="input-field text-sm sm:w-52"
                                        >
                                            <option value="ALL">Todos los estados</option>
                                            <option value="VERIFIED">Verificados</option>
                                            <option value="PENDING">Pendientes</option>
                                            <option value="SUSPENDED">Suspendidos</option>
                                            <option value="REJECTED">Rechazados</option>
                                        </select>
                                    </div>

                                    <button
                                        type="button"
                                        className="btn-secondary text-xs w-fit"
                                        onClick={() => void loadData()}
                                        disabled={loading}
                                    >
                                        {loading ? 'Actualizando...' : 'Actualizar lista'}
                                    </button>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                        Total {businessStatusSummary.total}
                                    </span>
                                    <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700">
                                        Verificados {businessStatusSummary.verified}
                                    </span>
                                    <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700">
                                        Pendientes {businessStatusSummary.pending}
                                    </span>
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                                        Suspendidos {businessStatusSummary.suspended}
                                    </span>
                                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                                        Rechazados {businessStatusSummary.rejected}
                                    </span>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Negocio
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Propietario
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Organizacion
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Estado
                                            </th>
                                            <th className="text-left text-xs font-semibold text-gray-500 uppercase p-4">
                                                Fecha
                                            </th>
                                            <th className="text-right text-xs font-semibold text-gray-500 uppercase p-4">
                                                Acciones
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredBusinesses.map((business) => {
                                            const verificationStatus = normalizeBusinessVerificationStatus(business);
                                            return (
                                            <tr key={business.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4">
                                                    <p className="font-medium text-gray-900">{business.name}</p>
                                                    <p className="text-xs text-gray-500">{business.province?.name || 'Sin provincia'}</p>
                                                </td>
                                                <td className="p-4 text-sm text-gray-500">
                                                    {business.owner?.name || '-'}
                                                </td>
                                                <td className="p-4 text-sm text-gray-500">
                                                    {business.organization?.name || '-'}
                                                </td>
                                                <td className="p-4">
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${verificationStatusClass(verificationStatus)}`}
                                                    >
                                                        {verificationStatusLabel(verificationStatus)}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-gray-400">
                                                    {new Date(business.createdAt).toLocaleDateString('es-DO')}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex flex-wrap justify-end gap-2">
                                                        {verificationStatus !== 'VERIFIED' && (
                                                            <button
                                                                onClick={() => void handleReviewVerification(business.id, 'VERIFIED')}
                                                                disabled={processingId === business.id}
                                                                className="text-xs bg-primary-100 text-primary-700 px-3 py-1 rounded-lg hover:bg-primary-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                {processingId === business.id
                                                                    ? 'Procesando...'
                                                                    : verificationStatus === 'SUSPENDED' || verificationStatus === 'REJECTED'
                                                                        ? 'Reactivar'
                                                                        : 'Aprobar'}
                                                            </button>
                                                        )}
                                                        {verificationStatus !== 'SUSPENDED' && (
                                                            <button
                                                                onClick={() => void handleReviewVerification(business.id, 'SUSPENDED')}
                                                                disabled={processingId === business.id}
                                                                className="text-xs bg-amber-100 text-amber-700 px-3 py-1 rounded-lg hover:bg-amber-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                Suspender
                                                            </button>
                                                        )}
                                                        {verificationStatus !== 'REJECTED' && verificationStatus !== 'SUSPENDED' && (
                                                            <button
                                                                onClick={() => void handleReviewVerification(business.id, 'REJECTED')}
                                                                disabled={processingId === business.id}
                                                                className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-lg hover:bg-orange-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                Rechazar
                                                            </button>
                                                        )}
                                                        {confirmDeleteBusinessId === business.id ? (
                                                            <div className="flex w-[320px] flex-col items-end gap-2 rounded-xl border border-red-200 bg-red-50/70 p-3">
                                                                <p className="text-[11px] text-right text-red-700">
                                                                    Accion irreversible. Escribe un motivo (min. 15 caracteres) y confirma con <strong>{DELETE_CONFIRMATION_TEXT}</strong>.
                                                                </p>
                                                                <textarea
                                                                    value={deleteBusinessReason}
                                                                    onChange={(event) => setDeleteBusinessReason(event.target.value)}
                                                                    className="input-field h-20 w-full resize-none text-xs"
                                                                    placeholder="Motivo de eliminacion"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={deleteBusinessConfirmationText}
                                                                    onChange={(event) => setDeleteBusinessConfirmationText(event.target.value)}
                                                                    className="input-field w-full text-xs"
                                                                    placeholder={`Escribe ${DELETE_CONFIRMATION_TEXT}`}
                                                                />
                                                                <div className="flex justify-end gap-2">
                                                                    <button
                                                                        onClick={() =>
                                                                            void handleDeleteBusiness(
                                                                                business.id,
                                                                                deleteBusinessReason,
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            processingId === business.id
                                                                            || deleteBusinessReason.trim().length < 15
                                                                            || deleteBusinessConfirmationText.trim().toUpperCase() !== DELETE_CONFIRMATION_TEXT
                                                                        }
                                                                        className="text-xs bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                                                                    >
                                                                        {processingId === business.id
                                                                            ? 'Procesando...'
                                                                            : 'Eliminar ahora'}
                                                                    </button>
                                                                    <button
                                                                        onClick={cancelBusinessDelete}
                                                                        disabled={processingId === business.id}
                                                                        className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() =>
                                                                    requestBusinessDelete(business.id)
                                                                }
                                                                disabled={processingId === business.id}
                                                                className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                Eliminar
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );})}
                                    </tbody>
                                </table>
                            </div>
                            {filteredBusinesses.length === 0 && (
                                <div className="p-10 text-center text-gray-400">
                                    No hay negocios que coincidan con el filtro actual
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'categories' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Crear categoría</h3>
                                <form onSubmit={handleCreateCategory} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder="Nombre"
                                        value={newCategoryForm.name}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                name: event.target.value,
                                                slug:
                                                    prev.slug.trim().length > 0
                                                        ? prev.slug
                                                        : toSlug(event.target.value),
                                            }))
                                        }
                                    />
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder="slug"
                                        value={newCategoryForm.slug}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                slug: toSlug(event.target.value),
                                            }))
                                        }
                                    />
                                    <input
                                        type="text"
                                        className="input-field text-sm"
                                        placeholder="Icono (opcional)"
                                        value={newCategoryForm.icon}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                icon: event.target.value,
                                            }))
                                        }
                                    />
                                    <select
                                        className="input-field text-sm"
                                        value={newCategoryForm.parentId}
                                        onChange={(event) =>
                                            setNewCategoryForm((prev) => ({
                                                ...prev,
                                                parentId: event.target.value,
                                            }))
                                        }
                                    >
                                        <option value="">Categoria padre (opcional)</option>
                                        {parentCategoryOptions.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm"
                                        disabled={processingId === 'create-category'}
                                    >
                                        {processingId === 'create-category' ? 'Creando...' : 'Crear'}
                                    </button>
                                </form>
                            </div>

                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Categorías actuales</h3>
                                <div className="space-y-3">
                                    {categories.map((category) => (
                                        <div
                                            key={category.id}
                                            className="p-3 rounded-xl border border-gray-100 bg-gray-50"
                                        >
                                            {editingCategoryId === category.id ? (
                                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                                    <input
                                                        type="text"
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.name}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                name: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.slug}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                slug: toSlug(event.target.value),
                                                            }))
                                                        }
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.icon}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                icon: event.target.value,
                                                            }))
                                                        }
                                                    />
                                                    <select
                                                        className="input-field text-sm"
                                                        value={editingCategoryForm.parentId}
                                                        onChange={(event) =>
                                                            setEditingCategoryForm((prev) => ({
                                                                ...prev,
                                                                parentId: event.target.value,
                                                            }))
                                                        }
                                                    >
                                                        <option value="">Sin padre</option>
                                                        {parentCategoryOptions
                                                            .filter((option) => option.id !== category.id)
                                                            .map((option) => (
                                                                <option key={option.id} value={option.id}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                    </select>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn-primary text-xs"
                                                            onClick={() =>
                                                                void saveCategoryEdit(category.id)
                                                            }
                                                            disabled={processingId === category.id}
                                                        >
                                                            Guardar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn-secondary text-xs"
                                                            onClick={cancelCategoryEdit}
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-4">
                                                    <div className="flex items-center gap-2 text-sm">
                                                        <span>{category.icon || '[icon]'}</span>
                                                         <span className="font-medium text-gray-800">
                                                             {category.name}
                                                         </span>
                                                         {category.parent?.name ? (
                                                             <span className="text-xs rounded-full bg-primary-50 px-2 py-0.5 text-primary-700">
                                                                 {category.parent.name}
                                                             </span>
                                                         ) : null}
                                                         <span className="text-gray-400">({category.slug})</span>
                                                         <span className="text-xs text-gray-500">
                                                             {category._count?.businesses || 0} negocios
                                                         </span>
                                                         {category.children && category.children.length > 0 ? (
                                                             <span className="text-xs text-gray-500">
                                                                 {category.children.length} subcategorias
                                                             </span>
                                                         ) : null}
                                                     </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn-secondary text-xs"
                                                            onClick={() => startCategoryEdit(category)}
                                                        >
                                                            Editar
                                                        </button>
                                                        {confirmDeleteCategoryId === category.id ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="text-xs bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                                                                    onClick={() => void deleteCategory(category.id)}
                                                                    disabled={processingId === category.id}
                                                                >
                                                                    {processingId === category.id
                                                                        ? 'Procesando...'
                                                                        : 'Confirmar'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn-secondary text-xs"
                                                                    onClick={() => setConfirmDeleteCategoryId(null)}
                                                                    disabled={processingId === category.id}
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                                onClick={() => requestCategoryDelete(category.id)}
                                                                disabled={processingId === category.id}
                                                            >
                                                                Eliminar
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'catalog' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-display font-semibold text-gray-900">Curacion del catalogo</h3>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Prioriza perfiles incompletos y posibles duplicados antes de seguir creciendo el catalogo.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary text-sm"
                                        onClick={() => void loadCatalogQuality()}
                                        disabled={catalogQualityLoading}
                                    >
                                        {catalogQualityLoading ? 'Actualizando...' : 'Actualizar calidad'}
                                    </button>
                                </div>

                                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                        <p className="text-xs text-gray-500">Negocios auditados</p>
                                        <p className="mt-1 text-2xl font-semibold text-gray-900">{catalogQuality?.totalBusinesses ?? 0}</p>
                                    </div>
                                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                                        <p className="text-xs text-amber-700">Perfiles incompletos</p>
                                        <p className="mt-1 text-2xl font-semibold text-amber-900">{catalogQuality?.incompleteCount ?? 0}</p>
                                    </div>
                                    <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                                        <p className="text-xs text-red-700">Clusters duplicados</p>
                                        <p className="mt-1 text-2xl font-semibold text-red-900">{catalogQuality?.duplicateClusterCount ?? 0}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="card p-5">
                                    <h3 className="font-display font-semibold mb-3">Perfiles incompletos</h3>
                                    <div className="space-y-3">
                                        {catalogQualityLoading ? (
                                            <p className="text-sm text-gray-500">Cargando perfiles...</p>
                                        ) : (catalogQuality?.incompleteBusinesses ?? []).length > 0 ? (
                                            catalogQuality?.incompleteBusinesses.map((business) => (
                                                <div key={business.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="font-medium text-gray-900">{business.name}</p>
                                                            <p className="text-xs text-gray-500">
                                                                {[business.city?.name, business.province?.name].filter(Boolean).join(', ') || 'Ubicacion pendiente'}
                                                            </p>
                                                        </div>
                                                        <span className="text-xs rounded-full bg-white px-2 py-1 text-gray-600 border border-gray-200">
                                                            {business.profileCompletenessScore}%
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {business.missingCoreFields.map((field) => (
                                                            <span key={`${business.id}-${field}`} className="text-[11px] rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                                                                {field}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-gray-500">No hay perfiles incompletos en la muestra actual.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="card p-5">
                                    <h3 className="font-display font-semibold mb-3">Posibles duplicados</h3>
                                    <div className="space-y-3">
                                        {catalogQualityLoading ? (
                                            <p className="text-sm text-gray-500">Buscando duplicados...</p>
                                        ) : (catalogQuality?.duplicateCandidates ?? []).length > 0 ? (
                                            catalogQuality?.duplicateCandidates.map((cluster) => (
                                                <div key={cluster.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {cluster.reasons.map((reason) => (
                                                            <span key={`${cluster.key}-${reason}`} className="text-[11px] rounded-full bg-red-100 px-2 py-1 text-red-800">
                                                                {reason}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <div className="space-y-2">
                                                        {cluster.businesses.map((business) => (
                                                            <div key={business.id} className="rounded-lg border border-white bg-white px-3 py-2">
                                                                <p className="text-sm font-medium text-gray-900">{business.name}</p>
                                                                <p className="text-xs text-gray-500">
                                                                    {[business.city?.name, business.province?.name].filter(Boolean).join(', ') || 'Ubicacion pendiente'}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-gray-500">No hay duplicados detectados en la muestra actual.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'verification' && (
                        <div className="space-y-4">
                            <VerificationQueueSection
                                items={moderationQueue}
                                processingId={processingId}
                                onResolvePreventiveModeration={handleResolvePreventiveModeration}
                                onReviewDocument={handleReviewDocument}
                            />

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Verificacion KYC pendiente</h3>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() => void loadVerificationData()}
                                        disabled={verificationLoading}
                                    >
                                        {verificationLoading ? 'Actualizando...' : 'Actualizar'}
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {pendingVerifications.length > 0 ? pendingVerifications.map((business) => (
                                        <div key={business.id} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="font-medium text-gray-900">{business.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {business.organization.name} - riesgo {business.riskScore}/100 - docs {business.documents.total}
                                                    </p>
                                                </div>
                                                <span className="text-xs rounded-full px-2 py-0.5 bg-yellow-100 text-yellow-700">
                                                    {business.verificationStatus}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Pendientes {business.documents.pending} - Aprobados {business.documents.approved} - Rechazados {business.documents.rejected}
                                            </p>
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    type="button"
                                                    className="btn-primary text-xs"
                                                    disabled={processingId === business.id}
                                                    onClick={() =>
                                                        void handleReviewVerification(business.id, 'VERIFIED')
                                                    }
                                                >
                                                    Aprobar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary text-xs"
                                                    disabled={processingId === business.id}
                                                    onClick={() =>
                                                        void handleReviewVerification(business.id, 'REJECTED')
                                                    }
                                                >
                                                    Rechazar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium disabled:opacity-50"
                                                    disabled={processingId === business.id}
                                                    onClick={() =>
                                                        void handleReviewVerification(business.id, 'SUSPENDED')
                                                    }
                                                >
                                                    Suspender
                                                </button>
                                            </div>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay verificaciones pendientes.</p>
                                    )}
                                </div>
                            </div>

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Moderación automática: reseñas sospechosas</h3>
                                    <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                                        {flaggedReviews.length} en cola
                                    </span>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {flaggedReviews.length > 0 ? flaggedReviews.map((review) => (
                                        <div key={review.id} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="font-medium text-gray-900">
                                                        {review.business.name} - {review.user.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Rating {review.rating}/5 - {new Date(review.flaggedAt || review.createdAt).toLocaleString('es-DO')}
                                                    </p>
                                                </div>
                                                <span className="text-xs rounded-full px-2 py-0.5 bg-yellow-100 text-yellow-700">
                                                    FLAGGED
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                                                {review.comment?.trim() || '(Sin comentario)'}
                                            </p>
                                            {review.moderationReason ? (
                                                <p className="text-xs text-red-700 mt-1">{review.moderationReason}</p>
                                            ) : null}
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <button
                                                    type="button"
                                                    className="btn-secondary text-xs"
                                                    disabled={analyzingReviewId === review.id}
                                                    onClick={() => void handleAnalyzeFlaggedReview(review.id)}
                                                >
                                                    {analyzingReviewId === review.id ? 'Analizando IA...' : 'Analizar IA'}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-primary text-xs"
                                                    disabled={processingId === review.id}
                                                    onClick={() => void handleModerateFlaggedReview(review.id, 'APPROVED')}
                                                >
                                                    Aprobar y publicar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary text-xs"
                                                    disabled={processingId === review.id}
                                                    onClick={() => void handleModerateFlaggedReview(review.id, 'FLAGGED')}
                                                >
                                                    Mantener en cola
                                                </button>
                                            </div>
                                            {reviewAiInsights[review.id] ? (
                                                <div className="mt-2 rounded-lg border border-primary-100 bg-primary-50 p-2 text-xs text-gray-700">
                                                    <p>
                                                        Sentimiento: <strong>{reviewAiInsights[review.id].sentiment}</strong>
                                                        {' '}({(reviewAiInsights[review.id].score * 100).toFixed(0)}%)
                                                    </p>
                                                    {reviewAiInsights[review.id].isNegative ? (
                                                        <p className="text-red-700 mt-1 font-medium">Alerta: reseña negativa detectada.</p>
                                                    ) : null}
                                                    {reviewAiInsights[review.id].summary ? (
                                                        <p className="mt-1">{reviewAiInsights[review.id].summary}</p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay reseñas sospechosas en este momento.</p>
                                    )}
                                </div>
                            </div>

                            <GrowthInsightsPanel
                                growthInsights={growthInsights}
                                marketTrackedBusinesses={marketInsights?.totals.trackedBusinesses ?? 0}
                                marketConversionRate={marketInsights?.totals.conversionRate ?? 0}
                                loading={insightsLoading}
                                refreshing={verificationLoading || insightsLoading}
                                onRefresh={() => void loadVerificationData()}
                            />

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Data Layer: snapshots</h3>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={generatingReport}
                                            onClick={() =>
                                                void handleGenerateMarketReport('PROVINCE_CATEGORY_DEMAND')
                                            }
                                        >
                                            Demanda
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={generatingReport}
                                            onClick={() =>
                                                void handleGenerateMarketReport('TRENDING_BUSINESSES')
                                            }
                                        >
                                            Tendencias
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={generatingReport}
                                            onClick={() =>
                                                void handleGenerateMarketReport('CONVERSION_BENCHMARK')
                                            }
                                        >
                                            Benchmark
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                    {marketReports.length > 0 ? marketReports.map((report) => (
                                        <button
                                            type="button"
                                            key={report.id}
                                            onClick={() => setSelectedMarketReportId(report.id)}
                                            className={`w-full text-left rounded-xl border p-3 transition-colors ${
                                                selectedMarketReportId === report.id
                                                    ? 'border-primary-200 bg-primary-50'
                                                    : 'border-gray-100 hover:border-primary-100'
                                            }`}
                                        >
                                            <p className="text-sm font-medium text-gray-900">{report.reportType}</p>
                                            <p className="text-xs text-gray-500">
                                                {new Date(report.generatedAt).toLocaleString('es-DO')} - {report.generatedByUser?.name || 'Sistema'}
                                            </p>
                                        </button>
                                    )) : (
                                        <p className="text-sm text-gray-500">Sin snapshots generados.</p>
                                    )}
                                </div>

                                <div className="mt-4 rounded-xl border border-gray-100 p-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <h4 className="font-medium text-gray-900">Detalle del snapshot</h4>
                                        {selectedMarketReportId ? (
                                            <button
                                                type="button"
                                                className="btn-secondary text-xs"
                                                onClick={() => void loadMarketReportDetail(selectedMarketReportId)}
                                                disabled={marketReportLoading}
                                            >
                                                {marketReportLoading ? 'Cargando...' : 'Recargar detalle'}
                                            </button>
                                        ) : null}
                                    </div>

                                    {!selectedMarketReportId ? (
                                        <p className="text-sm text-gray-500">Selecciona un snapshot para ver su detalle.</p>
                                    ) : marketReportLoading ? (
                                        <p className="text-sm text-gray-500">Cargando detalle...</p>
                                    ) : marketReportDetail ? (
                                        <div className="space-y-2">
                                            <p className="text-xs text-gray-500">
                                                {marketReportDetail.periodStart
                                                    ? `Periodo: ${new Date(marketReportDetail.periodStart).toLocaleDateString('es-DO')} al ${new Date(marketReportDetail.periodEnd || marketReportDetail.periodStart).toLocaleDateString('es-DO')}`
                                                    : `Generado: ${new Date(marketReportDetail.generatedAt).toLocaleString('es-DO')}`}
                                            </p>
                                            <pre className="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                                                {JSON.stringify(marketReportDetail.summary || {}, null, 2)}
                                            </pre>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-gray-500">No hay detalle disponible.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'observability' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                    <h3 className="font-display font-semibold text-gray-900">Centro de operaciones</h3>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() => {
                                            void loadOperationalHealth();
                                            void loadObservabilityData();
                                        }}
                                        disabled={operationalHealthLoading || observabilityLoading}
                                    >
                                        {operationalHealthLoading ? 'Actualizando...' : 'Actualizar estado'}
                                    </button>
                                </div>

                                {operationalHealth ? (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.status)}`}>
                                                Plataforma {operationalHealth.status.toUpperCase()}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.database?.status)}`}>
                                                DB {String(operationalHealth.checks?.database?.status || 'down').toUpperCase()}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.database?.pool?.status)}`}>
                                                Pool DB {String(operationalHealth.checks?.database?.pool?.status || 'down').toUpperCase()}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.ai?.status)}`}>
                                                AI {String(operationalHealth.checks?.ai?.status || 'down').toUpperCase()}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.email?.status)}`}>
                                                Email {String(operationalHealth.checks?.email?.status || 'down').toUpperCase()}
                                            </span>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.whatsapp?.status)}`}>
                                                WhatsApp {String(operationalHealth.checks?.whatsapp?.status || 'down').toUpperCase()}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">Saturacion DB</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {operationalHealth.checks?.database?.pool?.saturationPct ?? 0}%
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">Uptime</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {Math.floor((operationalHealth.uptimeSeconds || 0) / 60)} min
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">Latencia health</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {operationalHealth.responseTimeMs ?? 0} ms
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">Recovery 24h</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {operationalHealth.passwordReset?.requestsLast24h ?? 0}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Completados {operationalHealth.passwordReset?.completionsLast24h ?? 0}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">Rate reset</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {operationalHealth.passwordReset?.completionRatePct ?? 0}%
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Activos {operationalHealth.passwordReset?.activeTokens ?? 0}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                                <p className="text-xs text-gray-500">Reset expirados</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {operationalHealth.passwordReset?.expiredPendingTokens ?? 0}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    Proveedor {operationalHealth.passwordReset?.providerConfigured ? 'configurado' : 'no configurado'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">
                                        No hay datos operativos disponibles en este momento.
                                    </p>
                                )}
                            </div>

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                    <h3 className="font-display font-semibold text-gray-900">Resumen operativo</h3>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() => {
                                            void loadObservabilityData();
                                            void loadOperationalHealth();
                                        }}
                                        disabled={observabilityLoading}
                                    >
                                        {observabilityLoading ? 'Actualizando...' : 'Actualizar'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500">Requests totales</p>
                                        <p className="text-xl font-semibold text-gray-900">{observabilitySummary.totalRequests}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500">Errores 5xx</p>
                                        <p className="text-xl font-semibold text-red-700">{observabilitySummary.errors5xx}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500">Latencia promedio</p>
                                        <p className="text-xl font-semibold text-primary-700">{observabilitySummary.averageLatencyMs} ms</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500">Rate limit hits</p>
                                        <p className="text-xl font-semibold text-amber-700">{observabilitySummary.rateLimitHits}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500">Fallas externas</p>
                                        <p className="text-xl font-semibold text-purple-700">{observabilitySummary.externalFailures}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="card p-5">
                                <h3 className="font-display font-semibold text-gray-900 mb-3">Raw metrics (Prometheus)</h3>
                                <pre className="max-h-[420px] overflow-auto rounded-xl border border-gray-100 bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                                    {observabilityRaw || 'Sin datos de metricas'}
                                </pre>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

