import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import {
    analyticsApi,
    businessApi,
    businessSuggestionApi,
    categoryApi,
    healthApi,
    locationApi,
    observabilityApi,
    reviewApi,
    verificationApi,
} from '../api/endpoints';
import {
    EMPTY_FRONTEND_HEALTH_SUMMARY,
    EMPTY_OBSERVABILITY_SUMMARY,
    normalizeBusinessVerificationStatus,
    parseObservabilitySummary,
    toSlug,
    verificationStatusClass,
    verificationStatusLabel,
    type BusinessVerificationState,
    type FrontendHealthSummary,
    type ObservabilitySummary,
} from './admin-dashboard/helpers';
import type { GrowthInsightsSnapshot, ModerationQueueItem, OperationalDashboardSnapshot } from './admin-dashboard/types';
import { InlineDangerConfirm } from '../components/InlineDangerConfirm';
import { PageBlockingLoader } from '../components/PageBlockingLoader';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useTimedMessage } from '../hooks/useTimedMessage';

const GrowthInsightsPanel = lazy(async () => ({
    default: (await import('./admin-dashboard/GrowthInsightsPanel')).GrowthInsightsPanel,
}));
const VerificationQueueSection = lazy(async () => ({
    default: (await import('./admin-dashboard/VerificationQueueSection')).VerificationQueueSection,
}));
const ObservabilityWorkspace = lazy(async () => ({
    default: (await import('./admin-dashboard/ObservabilityWorkspace')).ObservabilityWorkspace,
}));

type AdminTabId = 'businesses' | 'categories' | 'catalog' | 'verification' | 'observability';

const ADMIN_TABS: Array<{ key: AdminTabId; label: string; icon: string; description: string }> = [
    {
        key: 'businesses',
        label: 'Negocios',
        icon: 'N',
        description: 'Vista general de fichas, estados y acciones administrativas.',
    },
    {
        key: 'categories',
        label: 'Categorias',
        icon: 'C',
        description: 'Taxonomia, relaciones padre-hijo y limpieza del catalogo.',
    },
    {
        key: 'catalog',
        label: 'Catalogo',
        icon: 'Q',
        description: 'Claims, duplicados, ownership y calidad operacional del directorio.',
    },
    {
        key: 'verification',
        label: 'KYC + Data Layer',
        icon: 'K',
        description: 'Colas de verificacion, moderacion y reportes de mercado.',
    },
    {
        key: 'observability',
        label: 'Observabilidad',
        icon: 'O',
        description: 'Salud del frontend, metricas operativas y visibilidad de incidentes.',
    },
];

function isAdminTabId(value: string | null): value is AdminTabId {
    return ADMIN_TABS.some((tab) => tab.key === value);
}

function readAdminTab(searchParams: URLSearchParams): AdminTabId {
    const tab = searchParams.get('tab');
    return isAdminTabId(tab) ? tab : 'businesses';
}

interface Business {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    source?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
    catalogSource?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
    lifecycleStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOFT_DELETED';
    isActive?: boolean;
    primaryManagingOrganizationId?: string | null;
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

interface Province {
    id: string;
    name: string;
}

interface CatalogQualitySnapshot {
    totalBusinesses: number;
    publishedBusinesses?: number;
    incompleteCount: number;
    duplicateClusterCount: number;
    unclaimedBusinesses?: number;
    pendingClaims?: number;
    claimedBusinesses?: number;
    weeklyCatalogGrowth?: number;
    claimCtaClicksLast30Days?: number;
    claimRequestsLast30Days?: number;
    claimRequestCompletionRatePct?: number;
    claimApprovalRatePct?: number;
    claimReviewAvgHours?: number;
    suggestionApprovalRatePct?: number;
    resolvedDuplicateCases?: number;
    duplicateDetectionRatePct?: number;
    duplicateResolutionAvgHours?: number;
    claimedBusinessesWithOrganization?: number;
    paidClaimOrganizations?: number;
    premiumFeatureUsageRatePct?: number;
    metrics?: {
        catalog?: {
            totalBusinesses: number;
            publishedBusinesses: number;
            unclaimedBusinesses: number;
            pendingClaims: number;
            claimedBusinesses: number;
            weeklyCatalogGrowth: number;
            claimedPct: number;
            unclaimedPct: number;
        };
        quality?: {
            incompleteCount: number;
            missingSector: number;
            missingCoordinates: number;
            duplicateClusterCount: number;
            duplicateInvolvedBusinessCount: number;
            duplicateDetectionRatePct: number;
            resolvedDuplicateCases: number;
            mergedDuplicateCases: number;
            conflictDuplicateCases: number;
            dismissedDuplicateCases: number;
            duplicateMergeRatePct: number;
            duplicateResolutionAvgHours: number;
        };
        claim?: {
            ctaClicksLast30Days: number;
            requestsLast30Days: number;
            requestCompletionRatePct: number;
            approvalRatePct: number;
            avgReviewHours: number;
        };
        suggestion?: {
            pending: number;
            approved: number;
            rejected: number;
            approvalRatePct: number;
        };
        saas?: {
            claimedBusinessesWithOrganization: number;
            claimedOrganizations: number;
            paidClaimOrganizations: number;
            claimedToOrganizationRatePct: number;
            organizationToPaidRatePct: number;
            paidOrganizationsUsingAnalytics: number;
            paidOrganizationsUsingPromotions: number;
            paidOrganizationsUsingAds: number;
            paidOrganizationsUsingAnyPremiumFeature: number;
            premiumFeatureUsageRatePct: number;
        };
    };
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
            claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
            publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
            source?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
            catalogSource?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
            lifecycleStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOFT_DELETED';
            city?: { name: string } | null;
            province?: { name: string } | null;
        }>;
    }>;
}

interface ClaimRequestItem {
    id: string;
    status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED';
    evidenceType: 'PHONE' | 'EMAIL_DOMAIN' | 'DOCUMENT' | 'SOCIAL' | 'MANUAL';
    evidenceValue?: string | null;
    notes?: string | null;
    adminNotes?: string | null;
    createdAt: string;
    reviewedAt?: string | null;
    approvedAt?: string | null;
    rejectedAt?: string | null;
    expiredAt?: string | null;
    canceledAt?: string | null;
    business: {
        id: string;
        name: string;
        slug: string;
        claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
        publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
        source?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
        catalogSource?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
        lifecycleStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOFT_DELETED';
        primaryManagingOrganizationId?: string | null;
    };
    requesterUser?: {
        id: string;
        name: string;
        email: string;
        role: string;
    } | null;
    requesterOrganization?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    reviewedByAdmin?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface OwnershipHistoryItem {
    id: string;
    role: 'PRIMARY_OWNER' | 'MANAGER';
    isActive: boolean;
    grantedAt: string;
    revokedAt?: string | null;
    revokeReason?: string | null;
    organization: {
        id: string;
        name: string;
        slug: string;
    };
    grantedByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
    revokedByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
    claimRequest?: {
        id: string;
        status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED';
        requesterUser?: {
            id: string;
            name: string;
            email: string;
        } | null;
    } | null;
}

interface OwnershipHistorySnapshot {
    business: {
        id: string;
        name: string;
        slug: string;
        claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
        ownerId?: string | null;
        organizationId?: string | null;
        primaryManagingOrganizationId?: string | null;
    };
    data: OwnershipHistoryItem[];
}

interface BusinessSuggestionItem {
    id: string;
    name: string;
    description?: string | null;
    address: string;
    phone?: string | null;
    whatsapp?: string | null;
    website?: string | null;
    email?: string | null;
    notes?: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    reviewedAt?: string | null;
    category?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    province?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    city?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    submittedByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
    reviewedByAdmin?: {
        id: string;
        name: string;
        email: string;
    } | null;
    createdBusiness?: {
        id: string;
        name: string;
        slug: string;
        claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED' | 'SUSPENDED';
        publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    } | null;
}

interface DuplicateCaseItem {
    id: string;
    clusterKey: string;
    status: 'MERGED' | 'DISMISSED' | 'CONFLICT';
    businessIds: string[];
    reasons?: string[] | null;
    primaryBusinessId?: string | null;
    resolutionNotes?: string | null;
    resolutionMeta?: Record<string, unknown> | null;
    resolvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    primaryBusiness?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    resolvedByAdmin?: {
        id: string;
        name: string;
        email: string;
    } | null;
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

type CatalogBusinessForm = {
    source: 'ADMIN' | 'IMPORT' | 'SYSTEM';
    name: string;
    description: string;
    address: string;
    provinceId: string;
    phone: string;
    whatsapp: string;
    website: string;
    email: string;
    categoryIds: string[];
};

const EMPTY_CATEGORY_FORM: CategoryForm = {
    name: '',
    slug: '',
    icon: '',
    parentId: '',
};
const EMPTY_CATALOG_FORM: CatalogBusinessForm = {
    source: 'ADMIN',
    name: '',
    description: '',
    address: '',
    provinceId: '',
    phone: '',
    whatsapp: '',
    website: '',
    email: '',
    categoryIds: [],
};
const DELETE_CONFIRMATION_TEXT = 'ELIMINAR';

function LazyAdminPanelFallback({ label }: { label: string }) {
    return (
        <div className="card p-5">
            <div className="h-5 w-44 rounded-lg bg-slate-100 animate-pulse" />
            <p className="mt-3 text-sm text-gray-500">{label}</p>
            <div className="mt-4 space-y-3">
                <div className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
                <div className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
                <div className="h-16 rounded-2xl bg-slate-50 animate-pulse" />
            </div>
        </div>
    );
}

export function AdminDashboard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [catalogQuality, setCatalogQuality] = useState<CatalogQualitySnapshot | null>(null);
    const [catalogQualityLoading, setCatalogQualityLoading] = useState(false);
    const [claimRequests, setClaimRequests] = useState<ClaimRequestItem[]>([]);
    const [claimRequestSummary, setClaimRequestSummary] = useState<Record<string, number>>({});
    const [claimRequestStatusFilter, setClaimRequestStatusFilter] = useState<'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED'>('PENDING');
    const [claimReviewNotes, setClaimReviewNotes] = useState<Record<string, string>>({});
    const [selectedOwnershipBusinessId, setSelectedOwnershipBusinessId] = useState('');
    const [ownershipHistory, setOwnershipHistory] = useState<OwnershipHistorySnapshot | null>(null);
    const [ownershipHistoryLoading, setOwnershipHistoryLoading] = useState(false);
    const [ownershipRevokeReasons, setOwnershipRevokeReasons] = useState<Record<string, string>>({});
    const [confirmOwnershipRevokeId, setConfirmOwnershipRevokeId] = useState<string | null>(null);
    const [catalogOperationNotes, setCatalogOperationNotes] = useState('');
    const [manualClaimForm, setManualClaimForm] = useState<{
        organizationId: string;
        ownerUserId: string;
        role: 'PRIMARY_OWNER' | 'MANAGER';
        notes: string;
    }>({
        organizationId: '',
        ownerUserId: '',
        role: 'PRIMARY_OWNER',
        notes: '',
    });
    const [adminUnclaimReason, setAdminUnclaimReason] = useState('');
    const [adminUnclaimMakeClaimable, setAdminUnclaimMakeClaimable] = useState(true);
    const [businessSuggestions, setBusinessSuggestions] = useState<BusinessSuggestionItem[]>([]);
    const [suggestionSummary, setSuggestionSummary] = useState<Record<string, number>>({});
    const [suggestionStatusFilter, setSuggestionStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
    const [suggestionReviewNotes, setSuggestionReviewNotes] = useState<Record<string, string>>({});
    const [duplicateCases, setDuplicateCases] = useState<DuplicateCaseItem[]>([]);
    const [duplicateCaseSummary, setDuplicateCaseSummary] = useState<Record<string, number>>({});
    const [duplicateCaseStatusFilter, setDuplicateCaseStatusFilter] = useState<'MERGED' | 'DISMISSED' | 'CONFLICT'>('MERGED');
    const [duplicateResolutionNotes, setDuplicateResolutionNotes] = useState<Record<string, string>>({});
    const [duplicatePrimarySelection, setDuplicatePrimarySelection] = useState<Record<string, string>>({});
    const [creatingCatalogBusiness, setCreatingCatalogBusiness] = useState(false);
    const [catalogBusinessForm, setCatalogBusinessForm] = useState<CatalogBusinessForm>(EMPTY_CATALOG_FORM);
    const activeTab = readAdminTab(searchParams);
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

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);
    const [verificationLoading, setVerificationLoading] = useState(false);
    const [pendingVerifications, setPendingVerifications] = useState<PendingVerificationBusiness[]>([]);
    const [marketReports, setMarketReports] = useState<MarketReport[]>([]);
    const [marketInsights, setMarketInsights] = useState<MarketInsightsSnapshot | null>(null);
    const [growthInsights, setGrowthInsights] = useState<GrowthInsightsSnapshot | null>(null);
    const [selectedMarketReportId, setSelectedMarketReportId] = useState<string | null>(null);
    const [marketReportDetail, setMarketReportDetail] = useState<MarketReportDetail | null>(null);
    const [marketReportLoading, setMarketReportLoading] = useState(false);
    const [flaggedReviews, setFlaggedReviews] = useState<FlaggedReview[]>([]);
    const [moderationQueue, setModerationQueue] = useState<ModerationQueueItem[]>([]);
    const [generatingReport, setGeneratingReport] = useState(false);
    const [observabilityLoading, setObservabilityLoading] = useState(false);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [observabilityRaw, setObservabilityRaw] = useState('');
    const [observabilitySummary, setObservabilitySummary] = useState<ObservabilitySummary>(EMPTY_OBSERVABILITY_SUMMARY);
    const [frontendHealthSummary, setFrontendHealthSummary] = useState<FrontendHealthSummary>(EMPTY_FRONTEND_HEALTH_SUMMARY);
    const [operationalHealth, setOperationalHealth] = useState<OperationalDashboardSnapshot | null>(null);
    const [operationalHealthLoading, setOperationalHealthLoading] = useState(false);
    const [rawMetricsLoading, setRawMetricsLoading] = useState(false);
    const [rawMetricsLoaded, setRawMetricsLoaded] = useState(false);

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

    const catalogClaimSummary = useMemo(() => ({
        unclaimed: businesses.filter((business) => business.claimStatus === 'UNCLAIMED').length,
        pending: businesses.filter((business) => business.claimStatus === 'PENDING_CLAIM').length,
        claimed: businesses.filter((business) => business.claimStatus === 'CLAIMED').length,
        suspended: businesses.filter((business) => business.claimStatus === 'SUSPENDED').length,
    }), [businesses]);

    const activeClaimRequestCount = (claimRequestSummary.PENDING ?? 0) + (claimRequestSummary.UNDER_REVIEW ?? 0);

    const catalogConflictQueue = useMemo(() => {
        const duplicateConflicts = (catalogQuality?.duplicateCandidates ?? []).map((cluster) => ({
            key: `duplicate:${cluster.key}`,
            kind: 'DUPLICATE_CLUSTER' as const,
            title: 'Posible conflicto por duplicado',
            detail: `${cluster.businesses.length} fichas comparten senales similares`,
            hint: cluster.reasons.join(' | '),
        }));
        const pendingClaimConflicts = claimRequests
            .filter((claimRequest) => claimRequest.status === 'PENDING' || claimRequest.status === 'UNDER_REVIEW')
            .map((claimRequest) => ({
                key: `claim:${claimRequest.id}`,
                kind: 'PENDING_CLAIM' as const,
                title: `${claimRequest.status === 'UNDER_REVIEW' ? 'Claim en revisión' : 'Claim pendiente'} para ${claimRequest.business.name}`,
                detail: claimRequest.requesterOrganization?.name
                    ? `Solicitante: ${claimRequest.requesterUser?.name || 'Usuario'} - ${claimRequest.requesterOrganization.name}`
                    : `Solicitante: ${claimRequest.requesterUser?.name || 'Usuario'}`,
                hint: claimRequest.evidenceValue || claimRequest.notes || claimRequest.evidenceType,
            }));
        const pendingSuggestionConflicts = businessSuggestions
            .filter((suggestion) => suggestion.status === 'PENDING')
            .map((suggestion) => ({
                key: `suggestion:${suggestion.id}`,
                kind: 'PENDING_SUGGESTION' as const,
                title: `Sugerencia pendiente: ${suggestion.name}`,
                detail: suggestion.submittedByUser?.name
                    ? `Enviada por ${suggestion.submittedByUser.name}`
                    : 'Sugerencia comunitaria pendiente de revision',
                hint: suggestion.address,
            }));

        return [...pendingClaimConflicts, ...pendingSuggestionConflicts, ...duplicateConflicts].slice(0, 8);
    }, [businessSuggestions, catalogQuality, claimRequests]);
    const selectedOwnershipBusiness = useMemo(
        () => businesses.find((business) => business.id === selectedOwnershipBusinessId) || null,
        [businesses, selectedOwnershipBusinessId],
    );

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
    const catalogMetrics = catalogQuality?.metrics;
    const parentCategoryOptions = useMemo(
        () => categories.filter((category) => !category.parentId),
        [categories],
    );
    const activeTabMeta = useMemo(
        () => ADMIN_TABS.find((tab) => tab.key === activeTab) ?? ADMIN_TABS[0],
        [activeTab],
    );
    const handleActiveTabChange = useCallback((nextTab: AdminTabId) => {
        const nextSearchParams = new URLSearchParams(searchParams);
        if (nextTab === 'businesses') {
            nextSearchParams.delete('tab');
        } else {
            nextSearchParams.set('tab', nextTab);
        }
        setSearchParams(nextSearchParams, { replace: true });
    }, [searchParams, setSearchParams]);

    const loadData = useCallback(async () => {
        setErrorMessage('');

        try {
            const [businessesResponse, categoriesResponse, provincesResponse] = await Promise.all([
                businessApi.getAllAdmin({ limit: 100 }),
                categoryApi.getAll(),
                locationApi.getProvinces(),
            ]);
            setBusinesses(businessesResponse.data.data || []);
            setCategories(categoriesResponse.data);
            setProvinces(provincesResponse.data || []);
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
            const summaryResponse = await observabilityApi.getSummary();
            setFrontendHealthSummary(
                (summaryResponse.data || EMPTY_FRONTEND_HEALTH_SUMMARY) as FrontendHealthSummary,
            );
        } catch (error) {
            setFrontendHealthSummary(EMPTY_FRONTEND_HEALTH_SUMMARY);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar observabilidad'));
        } finally {
            setObservabilityLoading(false);
        }
    }, []);

    const loadRawMetrics = useCallback(async () => {
        setRawMetricsLoading(true);
        try {
            const metricsResponse = await observabilityApi.getMetrics();
            const payload = typeof metricsResponse.data === 'string'
                ? metricsResponse.data
                : String(metricsResponse.data ?? '');
            setObservabilityRaw(payload);
            setObservabilitySummary(parseObservabilitySummary(payload));
            setRawMetricsLoaded(true);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar las metricas raw'));
        } finally {
            setRawMetricsLoading(false);
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
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la calidad del catálogo'));
        } finally {
            setCatalogQualityLoading(false);
        }
    }, []);

    const loadClaimRequests = useCallback(async () => {
        try {
            const response = await businessApi.getClaimRequestsAdmin({
                status: claimRequestStatusFilter,
                limit: 20,
            });
            setClaimRequests((response.data?.data || []) as ClaimRequestItem[]);
            setClaimRequestSummary((response.data?.summary || {}) as Record<string, number>);
        } catch (error) {
            setClaimRequests([]);
            setClaimRequestSummary({});
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar las reclamaciones'));
        }
    }, [claimRequestStatusFilter]);

    const loadOwnershipHistory = useCallback(async (businessId: string) => {
        if (!businessId) {
            setOwnershipHistory(null);
            return;
        }

        setOwnershipHistoryLoading(true);
        try {
            const response = await businessApi.getOwnershipHistoryAdmin(businessId, { limit: 20 });
            setOwnershipHistory((response.data || null) as OwnershipHistorySnapshot | null);
        } catch (error) {
            setOwnershipHistory(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el historial de ownership'));
        } finally {
            setOwnershipHistoryLoading(false);
        }
    }, []);

    const loadBusinessSuggestions = useCallback(async () => {
        try {
            const response = await businessSuggestionApi.getAdmin({
                status: suggestionStatusFilter,
                limit: 20,
            });
            setBusinessSuggestions((response.data?.data || []) as BusinessSuggestionItem[]);
            setSuggestionSummary((response.data?.summary || {}) as Record<string, number>);
        } catch (error) {
            setBusinessSuggestions([]);
            setSuggestionSummary({});
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar las sugerencias'));
        }
    }, [suggestionStatusFilter]);

    const loadDuplicateCases = useCallback(async () => {
        try {
            const response = await businessApi.getDuplicateCasesAdmin({
                status: duplicateCaseStatusFilter,
                limit: 20,
            });
            setDuplicateCases((response.data?.data || []) as DuplicateCaseItem[]);
            setDuplicateCaseSummary((response.data?.summary || {}) as Record<string, number>);
        } catch (error) {
            setDuplicateCases([]);
            setDuplicateCaseSummary({});
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar las resoluciones de duplicados'));
        }
    }, [duplicateCaseStatusFilter]);

    useEffect(() => {
        if (activeTab === 'catalog') {
            void loadCatalogQuality();
            void loadClaimRequests();
            void loadBusinessSuggestions();
            void loadDuplicateCases();
        }
    }, [activeTab, loadBusinessSuggestions, loadCatalogQuality, loadClaimRequests, loadDuplicateCases]);

    useEffect(() => {
        if (activeTab === 'catalog' && selectedOwnershipBusinessId) {
            void loadOwnershipHistory(selectedOwnershipBusinessId);
        }
    }, [activeTab, selectedOwnershipBusinessId, loadOwnershipHistory]);

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

    const handleReviewClaimRequest = async (
        claimRequestId: string,
        status: 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED',
    ) => {
        setProcessingId(claimRequestId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.reviewClaimRequestAdmin(claimRequestId, {
                status,
                notes: claimReviewNotes[claimRequestId]?.trim() || undefined,
            });
            await Promise.all([loadClaimRequests(), loadCatalogQuality(), loadData()]);
            setClaimReviewNotes((current) => {
                const next = { ...current };
                delete next[claimRequestId];
                return next;
            });
            setSuccessMessage(
                status === 'APPROVED'
                    ? 'Reclamacion aprobada y negocio asignado al solicitante'
                    : status === 'UNDER_REVIEW'
                        ? 'Reclamacion movida a revision administrativa'
                    : 'Reclamacion rechazada y negocio devuelto a estado no reclamado',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo revisar la reclamacion'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleSelectOwnershipBusiness = (businessId: string) => {
        setSelectedOwnershipBusinessId(businessId);
        setConfirmOwnershipRevokeId(null);
        const selectedBusiness = businesses.find((business) => business.id === businessId);
        if (selectedBusiness) {
            setManualClaimForm({
                organizationId: selectedBusiness.primaryManagingOrganizationId || selectedBusiness.organization?.id || '',
                ownerUserId: '',
                role: 'PRIMARY_OWNER',
                notes: '',
            });
            setAdminUnclaimMakeClaimable(true);
            setCatalogOperationNotes('');
            setAdminUnclaimReason('');
        }
        if (!businessId) {
            setOwnershipHistory(null);
            setManualClaimForm({
                organizationId: '',
                ownerUserId: '',
                role: 'PRIMARY_OWNER',
                notes: '',
            });
            setCatalogOperationNotes('');
            setAdminUnclaimReason('');
        }
    };

    const handleRevokeOwnership = async (businessId: string, ownershipId: string) => {
        const reason = ownershipRevokeReasons[ownershipId]?.trim() || '';
        if (reason.length < 8) {
            setErrorMessage('Agrega un motivo claro para suspender el ownership');
            return;
        }

        setProcessingId(ownershipId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.revokeOwnershipAdmin(businessId, ownershipId, { reason });
            await Promise.all([
                loadOwnershipHistory(businessId),
                loadClaimRequests(),
                loadCatalogQuality(),
                loadData(),
            ]);
            setOwnershipRevokeReasons((current) => {
                const next = { ...current };
                delete next[ownershipId];
                return next;
            });
            setConfirmOwnershipRevokeId(null);
            setSuccessMessage('Ownership suspendido y historial actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo suspender el ownership'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleUpdatePublicationState = async (businessId: string, shouldPublish: boolean) => {
        setProcessingId(`publication:${businessId}:${shouldPublish ? 'publish' : 'unpublish'}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            if (shouldPublish) {
                await businessApi.publishAdmin(businessId, {
                    notes: catalogOperationNotes.trim() || undefined,
                });
            } else {
                await businessApi.unpublishAdmin(businessId, {
                    notes: catalogOperationNotes.trim() || undefined,
                });
            }

            await Promise.all([
                loadData(),
                loadCatalogQuality(),
                selectedOwnershipBusinessId === businessId ? loadOwnershipHistory(businessId) : Promise.resolve(),
            ]);

            setSuccessMessage(shouldPublish ? 'Ficha publicada nuevamente en el catalogo' : 'Ficha retirada del catalogo publico');
            setCatalogOperationNotes('');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el estado publico del negocio'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleMarkClaimedBusiness = async (businessId: string) => {
        if (!manualClaimForm.organizationId.trim() || !manualClaimForm.ownerUserId.trim()) {
            setErrorMessage('Debes indicar organizationId y ownerUserId para marcar el negocio como reclamado');
            return;
        }

        setProcessingId(`mark-claimed:${businessId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.markClaimedAdmin(businessId, {
                organizationId: manualClaimForm.organizationId.trim(),
                ownerUserId: manualClaimForm.ownerUserId.trim(),
                role: manualClaimForm.role,
                notes: manualClaimForm.notes.trim() || undefined,
            });

            await Promise.all([
                loadData(),
                loadCatalogQuality(),
                loadClaimRequests(),
                loadOwnershipHistory(businessId),
            ]);

            setSuccessMessage('Negocio marcado como reclamado y ownership sincronizado');
            setManualClaimForm((current) => ({
                ...current,
                ownerUserId: '',
                notes: '',
            }));
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo marcar la ficha como reclamada'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleUnclaimBusiness = async (businessId: string) => {
        if (adminUnclaimReason.trim().length < 8) {
            setErrorMessage('Agrega un motivo claro para quitar el claim');
            return;
        }

        setProcessingId(`unclaim:${businessId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.unclaimAdmin(businessId, {
                reason: adminUnclaimReason.trim(),
                makeClaimable: adminUnclaimMakeClaimable,
            });

            await Promise.all([
                loadData(),
                loadCatalogQuality(),
                loadClaimRequests(),
                loadOwnershipHistory(businessId),
            ]);

            setSuccessMessage('Claim removido y ficha devuelta al flujo de catalogo');
            setAdminUnclaimReason('');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo quitar el claim del negocio'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleReviewSuggestion = async (
        suggestionId: string,
        status: 'APPROVED' | 'REJECTED',
    ) => {
        setProcessingId(suggestionId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessSuggestionApi.reviewAdmin(suggestionId, {
                status,
                notes: suggestionReviewNotes[suggestionId]?.trim() || undefined,
                publicStatus: status === 'APPROVED' ? 'PUBLISHED' : undefined,
            });
            await Promise.all([loadBusinessSuggestions(), loadCatalogQuality(), loadData()]);
            setSuggestionReviewNotes((current) => {
                const next = { ...current };
                delete next[suggestionId];
                return next;
            });
            setSuccessMessage(
                status === 'APPROVED'
                    ? 'Sugerencia aprobada y ficha publicada en el catalogo'
                    : 'Sugerencia rechazada correctamente',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo revisar la sugerencia'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleResolveDuplicateCluster = async (
        cluster: CatalogQualitySnapshot['duplicateCandidates'][number],
        status: 'MERGED' | 'DISMISSED' | 'CONFLICT',
    ) => {
        const businessIds = cluster.businesses.map((business) => business.id);
        const primaryBusinessId = duplicatePrimarySelection[cluster.key];

        if (status === 'MERGED' && !primaryBusinessId) {
            setErrorMessage('Selecciona una ficha primaria antes de fusionar el cluster');
            return;
        }

        setProcessingId(`duplicate:${cluster.key}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.resolveDuplicateCaseAdmin({
                status,
                businessIds,
                primaryBusinessId: status === 'MERGED' ? primaryBusinessId : undefined,
                reasons: cluster.reasons,
                notes: duplicateResolutionNotes[cluster.key]?.trim() || undefined,
            });
            await Promise.all([loadCatalogQuality(), loadDuplicateCases(), loadData()]);
            setDuplicateResolutionNotes((current) => {
                const next = { ...current };
                delete next[cluster.key];
                return next;
            });
            setDuplicatePrimarySelection((current) => {
                const next = { ...current };
                delete next[cluster.key];
                return next;
            });
            setSuccessMessage(
                status === 'MERGED'
                    ? 'Cluster fusionado y auditado correctamente'
                    : status === 'CONFLICT'
                        ? 'Cluster marcado como conflicto para seguimiento manual'
                        : 'Cluster descartado como duplicado',
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo resolver el cluster duplicado'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleCreateCatalogBusiness = async (event: React.FormEvent) => {
        event.preventDefault();
        setCreatingCatalogBusiness(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await businessApi.createAdminCatalog({
                source: catalogBusinessForm.source,
                name: catalogBusinessForm.name.trim(),
                description: catalogBusinessForm.description.trim(),
                address: catalogBusinessForm.address.trim(),
                provinceId: catalogBusinessForm.provinceId,
                categoryIds: catalogBusinessForm.categoryIds,
                phone: catalogBusinessForm.phone.trim() || undefined,
                whatsapp: catalogBusinessForm.whatsapp.trim() || undefined,
                website: catalogBusinessForm.website.trim() || undefined,
                email: catalogBusinessForm.email.trim() || undefined,
            });
            setCatalogBusinessForm(EMPTY_CATALOG_FORM);
            await Promise.all([loadData(), loadCatalogQuality()]);
            setSuccessMessage('Negocio de catalogo creado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear el negocio de catalogo'));
        } finally {
            setCreatingCatalogBusiness(false);
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
    const tabs = [
        { key: 'businesses', label: 'Negocios', icon: 'N' },
        { key: 'categories', label: 'Categorías', icon: 'C' },
        { key: 'catalog', label: 'Catalogo', icon: 'Q' },
        { key: 'verification', label: 'KYC + Data Layer', icon: 'K' },
        { key: 'observability', label: 'Observabilidad', icon: 'O' },
    ] as const;

    return (
        <div className="app-page-inner animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'admin-dashboard-error', tone: 'danger', text: errorMessage },
                    { id: 'admin-dashboard-success', tone: 'info', text: successMessage },
                ]}
            />
            
            <section className="console-section console-section--dark" aria-label={activeTabMeta.description}>
                <p className="text-xs uppercase tracking-[0.16em] text-slate-200 font-semibold">Panel Admin</p>
                <h1 className="font-display text-3xl font-bold text-white mt-2">Control de plataforma</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
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

            <div className="workspace-strip border border-slate-800 bg-slate-950/70 p-2 shadow-none">
                {tabs.map((tab) => (
                    <button
                        type="button"
                        key={tab.key}
                        onClick={() => handleActiveTabChange(tab.key)}
                        aria-current={activeTab === tab.key ? 'page' : undefined}
                        className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-medium transition-all ${
                            activeTab === tab.key
                                ? 'bg-slate-100 text-slate-950'
                                : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                        }`}
                    >
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-semibold ${
                            activeTab === tab.key ? 'bg-slate-900/10' : 'bg-white/10'
                        }`}>
                            {tab.icon}
                        </span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <PageBlockingLoader
                    label="Cargando operacion de plataforma"
                    hint="Traemos negocios, moderacion, catalogo y observabilidad para que el panel entre ya consolidado."
                    className="py-12"
                />
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
                                                            <InlineDangerConfirm
                                                                className="w-[340px]"
                                                                title="Eliminar negocio del catalogo"
                                                                description={`Esta accion es irreversible para ${business.name}. Agrega un motivo util (min. 15 caracteres) y confirma con ${DELETE_CONFIRMATION_TEXT}.`}
                                                                confirmLabel="Eliminar ahora"
                                                                busyLabel="Eliminando..."
                                                                busy={processingId === business.id}
                                                                confirmDisabled={
                                                                    deleteBusinessReason.trim().length < 15
                                                                    || deleteBusinessConfirmationText.trim().toUpperCase() !== DELETE_CONFIRMATION_TEXT
                                                                }
                                                                onConfirm={() =>
                                                                    void handleDeleteBusiness(
                                                                        business.id,
                                                                        deleteBusinessReason,
                                                                    )
                                                                }
                                                                onCancel={cancelBusinessDelete}
                                                            >
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
                                                            </InlineDangerConfirm>
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
                                                            <InlineDangerConfirm
                                                                className="w-[320px]"
                                                                title="Eliminar categoria"
                                                                description={`La categoria ${category.name} dejara de estar disponible para futuros negocios. Solo continua si ya no forma parte del catalogo activo.`}
                                                                confirmLabel="Confirmar eliminacion"
                                                                busyLabel="Eliminando..."
                                                                busy={processingId === category.id}
                                                                onConfirm={() => void deleteCategory(category.id)}
                                                                onCancel={() => setConfirmDeleteCategoryId(null)}
                                                            />
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
                                        <h3 className="font-display font-semibold text-gray-900">Curación del catálogo</h3>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Prioriza perfiles incompletos y posibles duplicados antes de seguir creciendo el catálogo.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void loadClaimRequests()}
                                            disabled={catalogQualityLoading}
                                        >
                                            Reclamaciones
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => {
                                                void loadCatalogQuality();
                                                void loadClaimRequests();
                                                void loadData();
                                            }}
                                            disabled={catalogQualityLoading}
                                        >
                                            {catalogQualityLoading ? 'Actualizando...' : 'Actualizar catalogo'}
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
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
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs text-slate-600">No reclamados</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900">
                                            {catalogQuality?.unclaimedBusinesses ?? catalogClaimSummary.unclaimed}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-primary-100 bg-primary-50 p-4">
                                        <p className="text-xs text-primary-700">Claims pendientes</p>
                                        <p className="mt-1 text-2xl font-semibold text-primary-900">
                                            {activeClaimRequestCount || catalogQuality?.pendingClaims || catalogClaimSummary.pending}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
                                    <div className="rounded-xl border border-primary-100 bg-primary-50 p-4">
                                        <p className="text-xs text-primary-700">Crecimiento semanal</p>
                                        <p className="mt-1 text-2xl font-semibold text-primary-900">
                                            {catalogMetrics?.catalog?.weeklyCatalogGrowth ?? catalogQuality?.weeklyCatalogGrowth ?? 0}
                                        </p>
                                        <p className="mt-2 text-xs text-primary-700">
                                            Publicados: {catalogMetrics?.catalog?.publishedBusinesses ?? catalogQuality?.publishedBusinesses ?? 0}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                                        <p className="text-xs text-amber-700">Embudo de claim 30d</p>
                                        <p className="mt-1 text-2xl font-semibold text-amber-900">
                                            {catalogMetrics?.claim?.requestCompletionRatePct ?? catalogQuality?.claimRequestCompletionRatePct ?? 0}%
                                        </p>
                                        <p className="mt-2 text-xs text-amber-700">
                                            CTA: {catalogMetrics?.claim?.ctaClicksLast30Days ?? catalogQuality?.claimCtaClicksLast30Days ?? 0} | Solicitudes: {catalogMetrics?.claim?.requestsLast30Days ?? catalogQuality?.claimRequestsLast30Days ?? 0}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                                        <p className="text-xs text-red-700">Calidad y duplicados</p>
                                        <p className="mt-1 text-2xl font-semibold text-red-900">
                                            {catalogMetrics?.quality?.duplicateDetectionRatePct ?? catalogQuality?.duplicateDetectionRatePct ?? 0}%
                                        </p>
                                        <p className="mt-2 text-xs text-red-700">
                                            Merge: {catalogMetrics?.quality?.duplicateMergeRatePct ?? 0}% | TMR: {catalogMetrics?.quality?.duplicateResolutionAvgHours ?? catalogQuality?.duplicateResolutionAvgHours ?? 0}h
                                        </p>
                                        <p className="mt-1 text-xs text-red-700">
                                            Clusters: {catalogMetrics?.quality?.duplicateClusterCount ?? catalogQuality?.duplicateClusterCount ?? 0} | Fichas involucradas: {catalogMetrics?.quality?.duplicateInvolvedBusinessCount ?? 0}
                                        </p>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <p className="text-xs text-slate-600">SaaS y moderacion</p>
                                        <p className="mt-1 text-2xl font-semibold text-slate-900">
                                            {catalogMetrics?.saas?.premiumFeatureUsageRatePct ?? catalogQuality?.premiumFeatureUsageRatePct ?? 0}%
                                        </p>
                                        <p className="mt-2 text-xs text-slate-600">
                                            Pago: {catalogMetrics?.saas?.organizationToPaidRatePct ?? 0}% | Premium activo: {catalogMetrics?.saas?.paidOrganizationsUsingAnyPremiumFeature ?? 0}/{catalogMetrics?.saas?.paidClaimOrganizations ?? catalogQuality?.paidClaimOrganizations ?? 0}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                            Analytics: {catalogMetrics?.saas?.paidOrganizationsUsingAnalytics ?? 0} | Promos: {catalogMetrics?.saas?.paidOrganizationsUsingPromotions ?? 0} | Ads: {catalogMetrics?.saas?.paidOrganizationsUsingAds ?? 0}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="card p-5">
                                    <h3 className="font-display font-semibold mb-3">Crear negocio de catalogo</h3>
                                    <form onSubmit={handleCreateCatalogBusiness} className="space-y-3">
                                        <select
                                            className="input-field text-sm"
                                            value={catalogBusinessForm.source}
                                            onChange={(event) => setCatalogBusinessForm((current) => ({
                                                ...current,
                                                source: event.target.value as CatalogBusinessForm['source'],
                                            }))}
                                        >
                                            <option value="ADMIN">Alta manual admin</option>
                                            <option value="IMPORT">Importacion curada</option>
                                            <option value="SYSTEM">Ingestion operativa</option>
                                        </select>
                                        <input
                                            type="text"
                                            className="input-field text-sm"
                                            placeholder="Nombre del negocio"
                                            value={catalogBusinessForm.name}
                                            onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, name: event.target.value }))}
                                        />
                                        <textarea
                                            className="input-field min-h-[110px] text-sm"
                                            placeholder="Descripcion publica"
                                            value={catalogBusinessForm.description}
                                            onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, description: event.target.value }))}
                                        />
                                        <input
                                            type="text"
                                            className="input-field text-sm"
                                            placeholder="Direccion"
                                            value={catalogBusinessForm.address}
                                            onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, address: event.target.value }))}
                                        />
                                        <select
                                            className="input-field text-sm"
                                            value={catalogBusinessForm.provinceId}
                                            onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, provinceId: event.target.value }))}
                                        >
                                            <option value="">Selecciona provincia</option>
                                            {provinces.map((province) => (
                                                <option key={province.id} value={province.id}>
                                                    {province.name}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <input
                                                type="text"
                                                className="input-field text-sm"
                                                placeholder="Telefono"
                                                value={catalogBusinessForm.phone}
                                                onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, phone: event.target.value }))}
                                            />
                                            <input
                                                type="text"
                                                className="input-field text-sm"
                                                placeholder="WhatsApp"
                                                value={catalogBusinessForm.whatsapp}
                                                onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, whatsapp: event.target.value }))}
                                            />
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <input
                                                type="url"
                                                className="input-field text-sm"
                                                placeholder="Sitio web"
                                                value={catalogBusinessForm.website}
                                                onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, website: event.target.value }))}
                                            />
                                            <input
                                                type="email"
                                                className="input-field text-sm"
                                                placeholder="Email"
                                                value={catalogBusinessForm.email}
                                                onChange={(event) => setCatalogBusinessForm((current) => ({ ...current, email: event.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Categorias
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                {categories.map((category) => {
                                                    const selected = catalogBusinessForm.categoryIds.includes(category.id);
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={category.id}
                                                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                                                selected
                                                                    ? 'bg-primary-600 text-white'
                                                                    : 'border border-gray-200 bg-white text-slate-700 hover:border-primary-300'
                                                            }`}
                                                            onClick={() => setCatalogBusinessForm((current) => ({
                                                                ...current,
                                                                categoryIds: selected
                                                                    ? current.categoryIds.filter((categoryId) => categoryId !== category.id)
                                                                    : [...current.categoryIds, category.id],
                                                            }))}
                                                        >
                                                            {category.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                type="submit"
                                                className="btn-primary text-sm"
                                                disabled={creatingCatalogBusiness}
                                            >
                                                {creatingCatalogBusiness ? 'Creando...' : 'Crear ficha de catalogo'}
                                            </button>
                                            <p className="text-sm text-slate-600">
                                                Se crea como negocio no reclamado y listo para el flujo formal de claim.
                                            </p>
                                        </div>
                                    </form>
                                </div>

                                <div className="space-y-4">
                                    <div className="card p-5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="font-display font-semibold text-gray-900">Reclamaciones del catalogo</h3>
                                            <p className="mt-1 text-sm text-gray-600">
                                                Aprueba, rechaza o mueve a revisión antes de activar herramientas tenant.
                                            </p>
                                        </div>
                                        <select
                                            className="input-field text-sm"
                                            value={claimRequestStatusFilter}
                                            onChange={(event) => setClaimRequestStatusFilter(event.target.value as 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED')}
                                        >
                                            <option value="PENDING">Pendientes</option>
                                            <option value="UNDER_REVIEW">En revisión</option>
                                            <option value="APPROVED">Aprobadas</option>
                                            <option value="REJECTED">Rechazadas</option>
                                            <option value="EXPIRED">Expiradas</option>
                                            <option value="CANCELED">Canceladas</option>
                                        </select>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {(['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED'] as const).map((status) => (
                                            <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                {status}: {claimRequestSummary[status] ?? 0}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {claimRequests.length > 0 ? claimRequests.map((claimRequest) => (
                                            <div key={claimRequest.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-medium text-gray-900">{claimRequest.business.name}</p>
                                                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                                                                {claimRequest.evidenceType}
                                                            </span>
                                                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                                                                {claimRequest.status}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-600">
                                                            Solicitante: {claimRequest.requesterUser?.name || 'Usuario no disponible'}
                                                            {claimRequest.requesterOrganization?.name ? ` - ${claimRequest.requesterOrganization.name}` : ''}
                                                        </p>
                                                        {claimRequest.evidenceValue ? (
                                                            <p className="mt-1 text-sm text-slate-700">Evidencia: {claimRequest.evidenceValue}</p>
                                                        ) : null}
                                                        {claimRequest.notes ? (
                                                            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{claimRequest.notes}</p>
                                                        ) : null}
                                                    </div>
                                                    <a
                                                        href={`/businesses/${claimRequest.business.slug}`}
                                                        className="btn-secondary text-sm"
                                                    >
                                                        Ver ficha
                                                    </a>
                                                    <button
                                                        type="button"
                                                        className="btn-secondary text-sm"
                                                        onClick={() => void handleSelectOwnershipBusiness(claimRequest.business.id)}
                                                    >
                                                        Ver ownership
                                                    </button>
                                                </div>

                                                {(claimRequest.status === 'PENDING' || claimRequest.status === 'UNDER_REVIEW') ? (
                                                    <div className="mt-3 space-y-3">
                                                        {claimRequest.adminNotes ? (
                                                            <p className="text-sm text-slate-600 whitespace-pre-wrap">
                                                                Ultima nota admin: {claimRequest.adminNotes}
                                                            </p>
                                                        ) : null}
                                                        <textarea
                                                            className="input-field h-24 w-full resize-none text-sm"
                                                            placeholder="Notas administrativas para la decision"
                                                            value={claimReviewNotes[claimRequest.id] || ''}
                                                            onChange={(event) => setClaimReviewNotes((current) => ({
                                                                ...current,
                                                                [claimRequest.id]: event.target.value,
                                                            }))}
                                                        />
                                                        <div className="flex flex-wrap gap-2">
                                                            {claimRequest.status === 'PENDING' ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn-secondary text-sm"
                                                                    disabled={processingId === claimRequest.id}
                                                                    onClick={() => void handleReviewClaimRequest(claimRequest.id, 'UNDER_REVIEW')}
                                                                >
                                                                    Marcar en revisión
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                className="btn-primary text-sm"
                                                                disabled={processingId === claimRequest.id}
                                                                onClick={() => void handleReviewClaimRequest(claimRequest.id, 'APPROVED')}
                                                            >
                                                                Aprobar claim
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-secondary text-sm"
                                                                disabled={processingId === claimRequest.id}
                                                                onClick={() => void handleReviewClaimRequest(claimRequest.id, 'REJECTED')}
                                                            >
                                                                Rechazar claim
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-slate-500">
                                                            Actualizada {(
                                                                claimRequest.approvedAt
                                                                || claimRequest.rejectedAt
                                                                || claimRequest.expiredAt
                                                                || claimRequest.canceledAt
                                                                || claimRequest.reviewedAt
                                                            ) ? new Date(
                                                                claimRequest.approvedAt
                                                                || claimRequest.rejectedAt
                                                                || claimRequest.expiredAt
                                                                || claimRequest.canceledAt
                                                                || claimRequest.reviewedAt!,
                                                            ).toLocaleString('es-DO') : 'sin fecha'} por {claimRequest.reviewedByAdmin?.name || 'sistema'}
                                                        </p>
                                                        {claimRequest.adminNotes ? (
                                                            <p className="text-sm text-slate-600 whitespace-pre-wrap">{claimRequest.adminNotes}</p>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay reclamaciones para este filtro.</p>
                                        )}
                                    </div>
                                </div>

                                    <div className="card p-5">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <h3 className="font-display font-semibold text-gray-900">Historial de ownership</h3>
                                                <p className="mt-1 text-sm text-gray-600">
                                                    Revisa control histórico del negocio y suspende ownerships activos cuando corresponda.
                                                </p>
                                            </div>
                                            <select
                                                className="input-field text-sm"
                                                value={selectedOwnershipBusinessId}
                                                onChange={(event) => void handleSelectOwnershipBusiness(event.target.value)}
                                            >
                                                <option value="">Selecciona un negocio</option>
                                                {businesses.map((business) => (
                                                    <option key={business.id} value={business.id}>
                                                        {business.name} · {business.claimStatus || 'SIN_ESTADO'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {selectedOwnershipBusinessId ? (
                                            ownershipHistoryLoading ? (
                                                <p className="mt-4 text-sm text-gray-500">Cargando historial...</p>
                                            ) : ownershipHistory ? (
                                                <div className="mt-4 space-y-3">
                                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <p className="font-medium text-slate-900">{ownershipHistory.business.name}</p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    Estado claim: {ownershipHistory.business.claimStatus || 'UNCLAIMED'}
                                                                </p>
                                                            </div>
                                                            <a
                                                                href={`/businesses/${ownershipHistory.business.slug}`}
                                                                className="btn-secondary text-sm"
                                                            >
                                                                Abrir ficha
                                                            </a>
                                                        </div>
                                                    </div>

                                                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Operaciones de catálogo</p>
                                                                <h4 className="mt-2 font-display text-lg font-semibold text-slate-900">Publicación y estado del claim</h4>
                                                                <p className="mt-2 text-sm text-slate-600">
                                                                    Ajusta publicación, desactiva claims erróneos o asigna manualmente ownership cuando haga falta.
                                                                </p>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                                    Público: {selectedOwnershipBusiness?.publicStatus || 'PUBLISHED'}
                                                                </span>
                                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                                    Claim: {selectedOwnershipBusiness?.claimStatus || ownershipHistory.business.claimStatus || 'UNCLAIMED'}
                                                                </span>
                                                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                                    Source: {selectedOwnershipBusiness?.catalogSource || selectedOwnershipBusiness?.source || 'SYSTEM'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 grid gap-4 xl:grid-cols-3">
                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                                <p className="text-sm font-semibold text-slate-900">Publicar o retirar</p>
                                                                <textarea
                                                                    className="input-field mt-3 h-24 w-full resize-none text-sm"
                                                                    placeholder="Nota opcional para auditoría de publicación"
                                                                    value={catalogOperationNotes}
                                                                    onChange={(event) => setCatalogOperationNotes(event.target.value)}
                                                                />
                                                                <div className="mt-3 flex flex-wrap gap-2">
                                                                    <button
                                                                        type="button"
                                                                        className="btn-primary text-sm"
                                                                        disabled={processingId === `publication:${ownershipHistory.business.id}:publish`}
                                                                        onClick={() => void handleUpdatePublicationState(ownershipHistory.business.id, true)}
                                                                    >
                                                                        Publicar
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn-secondary text-sm"
                                                                        disabled={processingId === `publication:${ownershipHistory.business.id}:unpublish`}
                                                                        onClick={() => void handleUpdatePublicationState(ownershipHistory.business.id, false)}
                                                                    >
                                                                        Despublicar
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                                                <p className="text-sm font-semibold text-slate-900">Marcar como reclamado</p>
                                                                <div className="mt-3 space-y-3">
                                                                    <input
                                                                        className="input-field text-sm"
                                                                        placeholder="organizationId"
                                                                        value={manualClaimForm.organizationId}
                                                                        onChange={(event) => setManualClaimForm((current) => ({
                                                                            ...current,
                                                                            organizationId: event.target.value,
                                                                        }))}
                                                                    />
                                                                    <input
                                                                        className="input-field text-sm"
                                                                        placeholder="ownerUserId"
                                                                        value={manualClaimForm.ownerUserId}
                                                                        onChange={(event) => setManualClaimForm((current) => ({
                                                                            ...current,
                                                                            ownerUserId: event.target.value,
                                                                        }))}
                                                                    />
                                                                    <select
                                                                        className="input-field text-sm"
                                                                        value={manualClaimForm.role}
                                                                        onChange={(event) => setManualClaimForm((current) => ({
                                                                            ...current,
                                                                            role: event.target.value as 'PRIMARY_OWNER' | 'MANAGER',
                                                                        }))}
                                                                    >
                                                                        <option value="PRIMARY_OWNER">PRIMARY_OWNER</option>
                                                                        <option value="MANAGER">MANAGER</option>
                                                                    </select>
                                                                    <textarea
                                                                        className="input-field h-20 w-full resize-none text-sm"
                                                                        placeholder="Notas para auditoría del mark-claimed"
                                                                        value={manualClaimForm.notes}
                                                                        onChange={(event) => setManualClaimForm((current) => ({
                                                                            ...current,
                                                                            notes: event.target.value,
                                                                        }))}
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="btn-primary mt-3 text-sm"
                                                                    disabled={processingId === `mark-claimed:${ownershipHistory.business.id}`}
                                                                    onClick={() => void handleMarkClaimedBusiness(ownershipHistory.business.id)}
                                                                >
                                                                    Marcar reclamado
                                                                </button>
                                                            </div>

                                                            <div className="rounded-xl border border-red-100 bg-red-50/70 p-4">
                                                                <p className="text-sm font-semibold text-slate-900">Quitar claim</p>
                                                                <textarea
                                                                    className="input-field mt-3 h-24 w-full resize-none text-sm"
                                                                    placeholder="Motivo administrativo para quitar el claim"
                                                                    value={adminUnclaimReason}
                                                                    onChange={(event) => setAdminUnclaimReason(event.target.value)}
                                                                />
                                                                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={adminUnclaimMakeClaimable}
                                                                        onChange={(event) => setAdminUnclaimMakeClaimable(event.target.checked)}
                                                                    />
                                                                    Dejar la ficha disponible para un nuevo claim
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    className="btn-secondary mt-3 text-sm"
                                                                    disabled={processingId === `unclaim:${ownershipHistory.business.id}`}
                                                                    onClick={() => void handleUnclaimBusiness(ownershipHistory.business.id)}
                                                                >
                                                                    Quitar claim
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {ownershipHistory.data.length > 0 ? ownershipHistory.data.map((ownership) => (
                                                        <div key={ownership.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <p className="font-medium text-gray-900">{ownership.organization.name}</p>
                                                                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 border border-slate-200">
                                                                            {ownership.role}
                                                                        </span>
                                                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                                                                            ownership.isActive
                                                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                                : 'border-slate-200 bg-white text-slate-600'
                                                                        }`}>
                                                                            {ownership.isActive ? 'ACTIVO' : 'REVOCADO'}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-2 text-sm text-slate-600">
                                                                        Otorgado {new Date(ownership.grantedAt).toLocaleString('es-DO')}
                                                                        {ownership.grantedByUser?.name ? ` por ${ownership.grantedByUser.name}` : ''}
                                                                    </p>
                                                                    {ownership.claimRequest?.requesterUser?.name ? (
                                                                        <p className="mt-1 text-sm text-slate-600">
                                                                            Claim origen: {ownership.claimRequest.requesterUser.name} · {ownership.claimRequest.status}
                                                                        </p>
                                                                    ) : null}
                                                                    {ownership.revokedAt ? (
                                                                        <p className="mt-1 text-sm text-slate-600">
                                                                            Revocado {new Date(ownership.revokedAt).toLocaleString('es-DO')}
                                                                            {ownership.revokedByUser?.name ? ` por ${ownership.revokedByUser.name}` : ''}
                                                                        </p>
                                                                    ) : null}
                                                                    {ownership.revokeReason ? (
                                                                        <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{ownership.revokeReason}</p>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            {ownership.isActive ? (
                                                                confirmOwnershipRevokeId === ownership.id ? (
                                                                    <InlineDangerConfirm
                                                                        className="mt-4"
                                                                        title="Suspender ownership activo"
                                                                        description="Esto revoca el control operativo del negocio para esta organización. Agrega un motivo claro antes de confirmar."
                                                                        confirmLabel="Suspender ownership"
                                                                        busyLabel="Suspendiendo..."
                                                                        busy={processingId === ownership.id}
                                                                        confirmDisabled={(ownershipRevokeReasons[ownership.id] || '').trim().length < 8}
                                                                        onConfirm={() => void handleRevokeOwnership(ownershipHistory.business.id, ownership.id)}
                                                                        onCancel={() => setConfirmOwnershipRevokeId(null)}
                                                                    >
                                                                        <textarea
                                                                            className="input-field h-24 w-full resize-none text-sm"
                                                                            placeholder="Motivo administrativo de la suspensión"
                                                                            value={ownershipRevokeReasons[ownership.id] || ''}
                                                                            onChange={(event) => setOwnershipRevokeReasons((current) => ({
                                                                                ...current,
                                                                                [ownership.id]: event.target.value,
                                                                            }))}
                                                                        />
                                                                    </InlineDangerConfirm>
                                                                ) : (
                                                                    <div className="mt-4">
                                                                        <button
                                                                            type="button"
                                                                            className="btn-secondary text-sm"
                                                                            onClick={() => setConfirmOwnershipRevokeId(ownership.id)}
                                                                        >
                                                                            Suspender ownership
                                                                        </button>
                                                                    </div>
                                                                )
                                                            ) : null}
                                                        </div>
                                                    )) : (
                                                        <p className="text-sm text-gray-500">Este negocio todavía no tiene ownerships históricos registrados.</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="mt-4 text-sm text-gray-500">No se pudo cargar el historial del negocio seleccionado.</p>
                                            )
                                        ) : (
                                            <p className="mt-4 text-sm text-gray-500">Selecciona un negocio para ver el ownership histórico y gestionar revocaciones.</p>
                                        )}
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
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <div>
                                                                        <p className="text-sm font-medium text-gray-900">{business.name}</p>
                                                                        <p className="text-xs text-gray-500">
                                                                            {[business.city?.name, business.province?.name].filter(Boolean).join(', ') || 'Ubicacion pendiente'}
                                                                        </p>
                                                                    </div>
                                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                                                        {business.claimStatus || 'UNCLAIMED'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                                                        <div className="space-y-3">
                                                            <select
                                                                className="input-field text-sm"
                                                                value={duplicatePrimarySelection[cluster.key] || ''}
                                                                onChange={(event) => setDuplicatePrimarySelection((current) => ({
                                                                    ...current,
                                                                    [cluster.key]: event.target.value,
                                                                }))}
                                                            >
                                                                <option value="">Selecciona ficha primaria para fusion</option>
                                                                {cluster.businesses.map((business) => (
                                                                    <option key={`${cluster.key}-${business.id}`} value={business.id}>
                                                                        {business.name}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <textarea
                                                                className="input-field h-24 w-full resize-none text-sm"
                                                                placeholder="Notas para fusionar, descartar o marcar conflicto"
                                                                value={duplicateResolutionNotes[cluster.key] || ''}
                                                                onChange={(event) => setDuplicateResolutionNotes((current) => ({
                                                                    ...current,
                                                                    [cluster.key]: event.target.value,
                                                                }))}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col gap-2">
                                                            <button
                                                                type="button"
                                                                className="btn-primary text-sm"
                                                                disabled={processingId === `duplicate:${cluster.key}`}
                                                                onClick={() => void handleResolveDuplicateCluster(cluster, 'MERGED')}
                                                            >
                                                                Fusionar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-secondary text-sm"
                                                                disabled={processingId === `duplicate:${cluster.key}`}
                                                                onClick={() => void handleResolveDuplicateCluster(cluster, 'CONFLICT')}
                                                            >
                                                                Marcar conflicto
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-secondary text-sm"
                                                                disabled={processingId === `duplicate:${cluster.key}`}
                                                                onClick={() => void handleResolveDuplicateCluster(cluster, 'DISMISSED')}
                                                            >
                                                                Descartar
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-gray-500">No hay duplicados detectados en la muestra actual.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="card p-5">
                                <h3 className="font-display font-semibold mb-3">Negocios no reclamados detectados</h3>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {businesses.filter((business) => business.claimStatus === 'UNCLAIMED').slice(0, 9).map((business) => (
                                        <div key={business.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-gray-900">{business.name}</p>
                                                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                                    {business.catalogSource || business.source || 'SIN SOURCE'}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-sm text-slate-600">
                                                {business.province?.name || 'Provincia pendiente'}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Estado publico: {business.publicStatus || 'PUBLISHED'}
                                            </p>
                                        </div>
                                    ))}
                                    {businesses.filter((business) => business.claimStatus === 'UNCLAIMED').length === 0 ? (
                                        <p className="text-sm text-gray-500">No hay negocios no reclamados en la muestra cargada.</p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                <div className="card p-5">
                                    <h3 className="font-display font-semibold mb-3">Sugerencias de usuarios</h3>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap gap-2">
                                            {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                                                <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                    {status}: {suggestionSummary[status] ?? 0}
                                                </span>
                                            ))}
                                        </div>
                                        <select
                                            className="input-field text-sm"
                                            value={suggestionStatusFilter}
                                            onChange={(event) => setSuggestionStatusFilter(event.target.value as 'PENDING' | 'APPROVED' | 'REJECTED')}
                                        >
                                            <option value="PENDING">Pendientes</option>
                                            <option value="APPROVED">Aprobadas</option>
                                            <option value="REJECTED">Rechazadas</option>
                                        </select>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {businessSuggestions.length > 0 ? businessSuggestions.map((suggestion) => (
                                            <div key={suggestion.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="font-medium text-gray-900">{suggestion.name}</p>
                                                            <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700">
                                                                {suggestion.status}
                                                            </span>
                                                        </div>
                                                        <p className="mt-2 text-sm text-slate-600">
                                                            {[suggestion.city?.name, suggestion.province?.name].filter(Boolean).join(', ') || suggestion.address}
                                                        </p>
                                                        <p className="mt-1 text-xs text-slate-500">
                                                            Enviada por {suggestion.submittedByUser?.name || 'usuario'} el {new Date(suggestion.createdAt).toLocaleDateString('es-DO')}
                                                        </p>
                                                        {suggestion.notes ? (
                                                            <p className="mt-2 text-sm whitespace-pre-wrap text-slate-700">{suggestion.notes}</p>
                                                        ) : null}
                                                    </div>
                                                    {suggestion.createdBusiness ? (
                                                        <a
                                                            href={`/businesses/${suggestion.createdBusiness.slug}`}
                                                            className="btn-secondary text-sm"
                                                        >
                                                            Ver ficha
                                                        </a>
                                                    ) : null}
                                                </div>

                                                {suggestion.status === 'PENDING' ? (
                                                    <div className="mt-3 space-y-3">
                                                        <textarea
                                                            className="input-field h-24 w-full resize-none text-sm"
                                                            placeholder="Notas administrativas para aprobar o rechazar la sugerencia"
                                                            value={suggestionReviewNotes[suggestion.id] || ''}
                                                            onChange={(event) => setSuggestionReviewNotes((current) => ({
                                                                ...current,
                                                                [suggestion.id]: event.target.value,
                                                            }))}
                                                        />
                                                        <div className="flex flex-wrap gap-2">
                                                            <button
                                                                type="button"
                                                                className="btn-primary text-sm"
                                                                disabled={processingId === suggestion.id}
                                                                onClick={() => void handleReviewSuggestion(suggestion.id, 'APPROVED')}
                                                            >
                                                                Aprobar y publicar
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-secondary text-sm"
                                                                disabled={processingId === suggestion.id}
                                                                onClick={() => void handleReviewSuggestion(suggestion.id, 'REJECTED')}
                                                            >
                                                                Rechazar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-xs text-slate-500">
                                                        Revisada {suggestion.reviewedAt ? new Date(suggestion.reviewedAt).toLocaleString('es-DO') : 'sin fecha'} por {suggestion.reviewedByAdmin?.name || 'sistema'}
                                                    </p>
                                                )}
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay sugerencias para este filtro.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="card p-5">
                                    <h3 className="font-display font-semibold mb-3">Resolucion de conflictos</h3>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap gap-2">
                                            {(['MERGED', 'DISMISSED', 'CONFLICT'] as const).map((status) => (
                                                <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                                                    {status}: {duplicateCaseSummary[status] ?? 0}
                                                </span>
                                            ))}
                                        </div>
                                        <select
                                            className="input-field text-sm"
                                            value={duplicateCaseStatusFilter}
                                            onChange={(event) => setDuplicateCaseStatusFilter(event.target.value as 'MERGED' | 'DISMISSED' | 'CONFLICT')}
                                        >
                                            <option value="MERGED">Fusionados</option>
                                            <option value="CONFLICT">Conflictos</option>
                                            <option value="DISMISSED">Descartados</option>
                                        </select>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        {catalogConflictQueue.length > 0 ? catalogConflictQueue.map((item) => (
                                            <div key={item.key} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-medium text-gray-900">{item.title}</p>
                                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                                        item.kind === 'PENDING_CLAIM'
                                                            ? 'border border-amber-200 bg-amber-50 text-amber-800'
                                                            : item.kind === 'PENDING_SUGGESTION'
                                                                ? 'border border-primary-200 bg-primary-50 text-primary-700'
                                                                : 'border border-red-200 bg-red-50 text-red-800'
                                                    }`}>
                                                        {item.kind === 'PENDING_CLAIM'
                                                            ? 'Claim pendiente'
                                                            : item.kind === 'PENDING_SUGGESTION'
                                                                ? 'Sugerencia pendiente'
                                                                : 'Duplicado probable'}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm text-slate-700">{item.detail}</p>
                                                <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay conflictos priorizados con la data actualmente cargada.</p>
                                        )}

                                        <div className="border-t border-gray-100 pt-3">
                                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Historial auditado
                                            </p>
                                            <div className="space-y-3">
                                                {duplicateCases.length > 0 ? duplicateCases.map((duplicateCase) => (
                                                    <div key={duplicateCase.id} className="rounded-xl border border-gray-100 bg-white p-4">
                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <p className="font-medium text-gray-900">{duplicateCase.status}</p>
                                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                                                    {duplicateCase.businessIds.length} fichas
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-slate-500">
                                                                {duplicateCase.resolvedAt ? new Date(duplicateCase.resolvedAt).toLocaleString('es-DO') : 'Sin fecha'}
                                                            </p>
                                                        </div>
                                                        {duplicateCase.primaryBusiness ? (
                                                            <p className="mt-2 text-sm text-slate-700">
                                                                Ficha primaria: {duplicateCase.primaryBusiness.name}
                                                            </p>
                                                        ) : null}
                                                        {duplicateCase.reasons && duplicateCase.reasons.length > 0 ? (
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {duplicateCase.reasons.map((reason) => (
                                                                    <span key={`${duplicateCase.id}-${reason}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                                                        {reason}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                        {duplicateCase.resolutionNotes ? (
                                                            <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{duplicateCase.resolutionNotes}</p>
                                                        ) : null}
                                                    </div>
                                                )) : (
                                                    <p className="text-sm text-gray-500">No hay resoluciones auditadas para este filtro.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'verification' && (
                        <div className="space-y-4">
                            <Suspense fallback={<LazyAdminPanelFallback label="Cargando cola de verificacion y moderacion..." />}>
                                <VerificationQueueSection
                                    items={moderationQueue}
                                    processingId={processingId}
                                    onResolvePreventiveModeration={handleResolvePreventiveModeration}
                                    onReviewDocument={handleReviewDocument}
                                />
                            </Suspense>

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
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">No hay reseñas sospechosas en este momento.</p>
                                    )}
                                </div>
                            </div>

                            <Suspense fallback={<LazyAdminPanelFallback label="Cargando tendencias y growth insights..." />}>
                                <GrowthInsightsPanel
                                    growthInsights={growthInsights}
                                    marketTrackedBusinesses={marketInsights?.totals.trackedBusinesses ?? 0}
                                    marketConversionRate={marketInsights?.totals.conversionRate ?? 0}
                                    loading={insightsLoading}
                                    refreshing={verificationLoading || insightsLoading}
                                    onRefresh={() => void loadVerificationData()}
                                />
                            </Suspense>

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
                        <Suspense fallback={<LazyAdminPanelFallback label="Cargando centro de operaciones..." />}>
                            <ObservabilityWorkspace
                                frontendHealthSummary={frontendHealthSummary}
                                observabilityLoading={observabilityLoading}
                                observabilityRaw={observabilityRaw}
                                observabilitySummary={observabilitySummary}
                                operationalHealth={operationalHealth}
                                operationalHealthLoading={operationalHealthLoading}
                                rawMetricsLoaded={rawMetricsLoaded}
                                rawMetricsLoading={rawMetricsLoading}
                                onRefreshHealth={loadObservabilityData}
                                onRefreshOperationalHealth={loadOperationalHealth}
                                onLoadRawMetrics={loadRawMetrics}
                            />
                        </Suspense>
                    )}
                </>
            )}
        </div>
    );
}


