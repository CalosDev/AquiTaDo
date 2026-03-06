import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '../api/error';
import { aiApi, analyticsApi, businessApi, categoryApi, observabilityApi, reviewApi, verificationApi } from '../api/endpoints';

interface Business {
    id: string;
    name: string;
    verified: boolean;
    createdAt: string;
    owner?: { name: string };
}

interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    _count?: { businesses: number };
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

interface ModerationQueueItem {
    id: string;
    queueType: 'BUSINESS_VERIFICATION' | 'DOCUMENT_REVIEW' | 'REVIEW_MODERATION';
    entityId: string;
    status: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    createdAt: string;
    organization: {
        id: string;
        name: string;
        slug: string;
    };
    business: {
        id: string;
        name: string;
        slug: string;
        riskScore: number;
    };
}

interface ReviewAiSentimentInsight {
    reviewId: string;
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    score: number;
    summary: string | null;
    isNegative: boolean;
}

interface ObservabilitySummary {
    totalRequests: number;
    errors5xx: number;
    averageLatencyMs: number;
    rateLimitHits: number;
    externalFailures: number;
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

interface GrowthInsightsSnapshot {
    topSearchedCategories: Array<{
        categoryId: string | null;
        categoryName: string;
        searches: number;
        supplyBusinesses: number;
        demandSupplyRatio: number;
    }>;
    demandSupplyGaps: Array<{
        provinceId: string | null;
        provinceName: string;
        categoryId: string | null;
        categoryName: string;
        demandSearches: number;
        supplyBusinesses: number;
        demandSupplyRatio: number;
    }>;
    conversionFunnels: {
        searchToWhatsApp: {
            uniqueSearchVisitors: number;
            uniqueWhatsAppVisitors: number;
            conversionRate: number;
        };
    };
    abTesting: {
        experiment: string;
        winner?: {
            variantKey: string;
            contactClicks: number;
            whatsappClicks: number;
            conversionRate: number;
        } | null;
        variants: Array<{
            variantKey: string;
            contactClicks: number;
            whatsappClicks: number;
            conversionRate: number;
        }>;
    };
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
};

const EMPTY_CATEGORY_FORM: CategoryForm = {
    name: '',
    slug: '',
    icon: '',
};
const DELETE_CONFIRMATION_TEXT = 'ELIMINAR';
const EMPTY_OBSERVABILITY_SUMMARY: ObservabilitySummary = {
    totalRequests: 0,
    errors5xx: 0,
    averageLatencyMs: 0,
    rateLimitHits: 0,
    externalFailures: 0,
};

function sumMetric(metricText: string, metricName: string): number {
    const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$`);
    return metricText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .reduce((acc, line) => {
            const match = line.match(pattern);
            if (!match) {
                return acc;
            }
            const parsed = Number.parseFloat(match[1]);
            return Number.isFinite(parsed) ? acc + parsed : acc;
        }, 0);
}

function sumMetricByLabelPattern(
    metricText: string,
    metricName: string,
    labelPattern: RegExp,
): number {
    const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}\\{([^}]*)\\}\\s+([-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$`);
    return metricText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .reduce((acc, line) => {
            const match = line.match(pattern);
            if (!match) {
                return acc;
            }
            const labels = match[1] ?? '';
            if (!labelPattern.test(labels)) {
                return acc;
            }
            const parsed = Number.parseFloat(match[2]);
            return Number.isFinite(parsed) ? acc + parsed : acc;
        }, 0);
}

function parseObservabilitySummary(metricText: string): ObservabilitySummary {
    const totalRequests = Math.round(sumMetric(metricText, 'aquita_http_requests_total'));
    const errors5xx = Math.round(
        sumMetricByLabelPattern(
            metricText,
            'aquita_http_requests_total',
            /status="5\d{2}"/,
        ),
    );
    const durationSumSeconds = sumMetric(metricText, 'aquita_http_request_duration_seconds_sum');
    const durationCount = sumMetric(metricText, 'aquita_http_request_duration_seconds_count');
    const averageLatencyMs = durationCount > 0
        ? Number(((durationSumSeconds / durationCount) * 1000).toFixed(2))
        : 0;
    const rateLimitHits = Math.round(sumMetric(metricText, 'aquita_rate_limit_hits_total'));
    const externalFailures = Math.round(
        sumMetricByLabelPattern(
            metricText,
            'aquita_external_dependency_calls_total',
            /success="false"/,
        ),
    );

    return {
        totalRequests,
        errors5xx,
        averageLatencyMs,
        rateLimitHits,
        externalFailures,
    };
}

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

export function AdminDashboard() {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [activeTab, setActiveTab] = useState<'businesses' | 'categories' | 'verification' | 'observability'>('businesses');
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

    const [newCategoryForm, setNewCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingCategoryForm, setEditingCategoryForm] = useState<CategoryForm>(EMPTY_CATEGORY_FORM);

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
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar verificacion y data layer'));
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

    useEffect(() => {
        if (activeTab === 'observability') {
            void loadObservabilityData();
        }
    }, [activeTab, loadObservabilityData]);

    const handleVerifyBusiness = async (businessId: string) => {
        setProcessingId(businessId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.verify(businessId);
            await loadData();
            setSuccessMessage('Negocio aprobado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo aprobar el negocio'));
        } finally {
            setProcessingId(null);
        }
    };

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
            });
            setNewCategoryForm(EMPTY_CATEGORY_FORM);
            await loadData();
            setSuccessMessage('Categoria creada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la categoria'));
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
            });
            await loadData();
            cancelCategoryEdit();
            setSuccessMessage('Categoria actualizada correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la categoria'));
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
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la categoria'));
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
                    ? 'Verificacion aprobada por equipo admin'
                    : 'Revision administrativa',
            });
            await Promise.all([loadData(), loadVerificationData()]);
            setSuccessMessage('Revision de verificacion actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la verificacion'));
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
                    ? 'Aprobada por equipo de moderacion'
                    : 'Mantenida en cola por riesgo',
            });
            await Promise.all([loadData(), loadVerificationData()]);
            setSuccessMessage(
                status === 'APPROVED'
                    ? 'Resena aprobada y publicada'
                    : 'Resena mantenida como sospechosa',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la resena'));
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
                    ? 'Documento rechazado por moderacion administrativa'
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
            setSuccessMessage('Analisis IA generado para la resena');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo analizar la resena con IA'));
        } finally {
            setAnalyzingReviewId(null);
        }
    };

    const tabs = [
        { key: 'businesses', label: 'Negocios', icon: 'N' },
        { key: 'categories', label: 'Categorias', icon: 'C' },
        { key: 'verification', label: 'KYC + Data Layer', icon: 'K' },
        { key: 'observability', label: 'Observabilidad', icon: 'O' },
    ] as const;

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            
            <section className="role-hero role-hero-admin mb-8">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-200 font-semibold">Panel Admin</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Control de plataforma</h1>
                <p className="text-slate-200 mt-2 max-w-2xl">
                    Gestion de negocios, categorias, moderacion de contenido y salud operativa.
                </p>

                <div className="mt-5 role-kpi-grid !xl:grid-cols-4">
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Total negocios</p>
                        <p className="role-kpi-value">{businesses.length}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Verificados</p>
                        <p className="role-kpi-value">{businesses.filter((business) => business.verified).length}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Pendientes</p>
                        <p className="role-kpi-value">{businesses.filter((business) => !business.verified).length}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Categorias</p>
                        <p className="role-kpi-value">{categories.length}</p>
                    </article>
                </div>
            </section>

            <p className="text-gray-500 mb-8">
                Gestion de negocios, categorias, moderacion y observabilidad en un solo panel.
            </p>

            {errorMessage && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                    {errorMessage}
                </div>
            )}

            {successMessage && (
                <div
                    role="status"
                    aria-live="polite"
                    className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
                >
                    {successMessage}
                </div>
            )}

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
                                        {businesses.map((business) => (
                                            <tr key={business.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="p-4 font-medium text-gray-900">{business.name}</td>
                                                <td className="p-4 text-sm text-gray-500">
                                                    {business.owner?.name || '-'}
                                                </td>
                                                <td className="p-4">
                                                    <span
                                                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            business.verified
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}
                                                    >
                                                        {business.verified ? 'Verificado' : 'Pendiente'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-sm text-gray-400">
                                                    {new Date(business.createdAt).toLocaleDateString('es-DO')}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {!business.verified && (
                                                            <button
                                                                onClick={() =>
                                                                    void handleVerifyBusiness(business.id)
                                                                }
                                                                disabled={processingId === business.id}
                                                                className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200 transition-colors font-medium disabled:opacity-50"
                                                            >
                                                                {processingId === business.id
                                                                    ? 'Procesando...'
                                                                    : 'Aprobar'}
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
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {businesses.length === 0 && (
                                <div className="p-10 text-center text-gray-400">
                                    No hay negocios registrados
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'categories' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Crear categoria</h3>
                                <form onSubmit={handleCreateCategory} className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                                <h3 className="font-display font-semibold mb-3">Categorias actuales</h3>
                                <div className="space-y-3">
                                    {categories.map((category) => (
                                        <div
                                            key={category.id}
                                            className="p-3 rounded-xl border border-gray-100 bg-gray-50"
                                        >
                                            {editingCategoryId === category.id ? (
                                                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
                                                        <span className="text-gray-400">({category.slug})</span>
                                                        <span className="text-xs text-gray-500">
                                                            {category._count?.businesses || 0} negocios
                                                        </span>
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

                    {activeTab === 'verification' && (
                        <div className="space-y-4">
                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Cola unificada de moderacion</h3>
                                    <span className="text-xs rounded-full px-2 py-0.5 bg-primary-50 text-primary-700">
                                        {moderationQueue.length} items
                                    </span>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {moderationQueue.length > 0 ? moderationQueue.map((item) => (
                                        <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="font-medium text-gray-900">
                                                        {item.business.name} - {item.organization.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {item.queueType} - {new Date(item.createdAt).toLocaleString('es-DO')}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs rounded-full px-2 py-0.5 ${
                                                        item.priority === 'HIGH'
                                                            ? 'bg-red-100 text-red-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {item.priority}
                                                    </span>
                                                    <span className="text-xs rounded-full px-2 py-0.5 bg-gray-100 text-gray-700">
                                                        {item.status}
                                                    </span>
                                                </div>
                                            </div>
                                            {item.queueType === 'DOCUMENT_REVIEW' ? (
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <button
                                                        type="button"
                                                        className="btn-primary text-xs"
                                                        disabled={processingId === item.entityId}
                                                        onClick={() => void handleReviewDocument(item.entityId, 'APPROVED')}
                                                    >
                                                        Aprobar documento
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-secondary text-xs"
                                                        disabled={processingId === item.entityId}
                                                        onClick={() => void handleReviewDocument(item.entityId, 'REJECTED')}
                                                    >
                                                        Rechazar documento
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay items en la cola unificada.</p>
                                    )}
                                </div>
                            </div>

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
                                    <h3 className="font-display font-semibold">Moderacion automatica: resenas sospechosas</h3>
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
                                                        <p className="text-red-700 mt-1 font-medium">Alerta: resena negativa detectada.</p>
                                                    ) : null}
                                                    {reviewAiInsights[review.id].summary ? (
                                                        <p className="mt-1">{reviewAiInsights[review.id].summary}</p>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay resenas sospechosas en este momento.</p>
                                    )}
                                </div>
                            </div>

                            <div className="card p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                    <h3 className="font-display font-semibold">Insights de mercado y growth</h3>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() => void loadVerificationData()}
                                        disabled={verificationLoading || insightsLoading}
                                    >
                                        {verificationLoading || insightsLoading ? 'Actualizando...' : 'Refrescar insights'}
                                    </button>
                                </div>

                                {insightsLoading ? (
                                    <p className="text-sm text-gray-500">Cargando insights...</p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="rounded-xl border border-gray-100 p-3">
                                                <p className="text-xs text-gray-500">Negocios trackeados</p>
                                                <p className="text-xl font-semibold text-gray-900">
                                                    {marketInsights?.totals.trackedBusinesses ?? 0}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 p-3">
                                                <p className="text-xs text-gray-500">Conversion global</p>
                                                <p className="text-xl font-semibold text-primary-700">
                                                    {marketInsights?.totals.conversionRate ?? 0}%
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-gray-100 p-3">
                                                <p className="text-xs text-gray-500">Search a WhatsApp</p>
                                                <p className="text-xl font-semibold text-emerald-700">
                                                    {growthInsights?.conversionFunnels.searchToWhatsApp.conversionRate ?? 0}%
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                            <div className="rounded-xl border border-gray-100 p-3">
                                                <h4 className="font-medium text-gray-900 mb-2">Top categorias buscadas</h4>
                                                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                                    {growthInsights?.topSearchedCategories?.length ? growthInsights.topSearchedCategories.slice(0, 8).map((item) => (
                                                        <div key={`${item.categoryId || 'none'}-${item.categoryName}`} className="flex items-center justify-between text-sm">
                                                            <span className="text-gray-700 truncate pr-2">{item.categoryName}</span>
                                                            <span className="text-gray-900 font-medium">{item.searches}</span>
                                                        </div>
                                                    )) : (
                                                        <p className="text-sm text-gray-500">Sin datos de categorias.</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-gray-100 p-3">
                                                <h4 className="font-medium text-gray-900 mb-2">Brechas oferta-demanda</h4>
                                                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                                    {growthInsights?.demandSupplyGaps?.length ? growthInsights.demandSupplyGaps.slice(0, 8).map((gap) => (
                                                        <div key={`${gap.provinceId || 'all'}-${gap.categoryId || 'all'}`} className="rounded-lg bg-gray-50 px-2 py-1.5">
                                                            <p className="text-sm text-gray-900">
                                                                {gap.provinceName} · {gap.categoryName}
                                                            </p>
                                                            <p className="text-xs text-gray-500">
                                                                Demanda {gap.demandSearches} · Oferta {gap.supplyBusinesses} · Ratio {gap.demandSupplyRatio}
                                                            </p>
                                                        </div>
                                                    )) : (
                                                        <p className="text-sm text-gray-500">Sin brechas registradas.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-gray-100 p-3">
                                            <h4 className="font-medium text-gray-900 mb-2">A/B test contacto a WhatsApp</h4>
                                            <div className="space-y-2">
                                                {growthInsights?.abTesting?.variants?.length ? growthInsights.abTesting.variants.map((variant) => (
                                                    <div key={variant.variantKey} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                                                        <span className="text-sm text-gray-700">{variant.variantKey}</span>
                                                        <span className="text-sm text-gray-900">
                                                            {variant.conversionRate}% ({variant.whatsappClicks}/{variant.contactClicks})
                                                        </span>
                                                    </div>
                                                )) : (
                                                    <p className="text-sm text-gray-500">Sin variantes activas.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

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
                                    <h3 className="font-display font-semibold text-gray-900">Resumen operativo</h3>
                                    <button
                                        type="button"
                                        className="btn-secondary text-xs"
                                        onClick={() => void loadObservabilityData()}
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

