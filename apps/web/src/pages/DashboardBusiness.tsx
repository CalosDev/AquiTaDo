import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    adsApi,
    aiApi,
    analyticsApi,
    bookingsApi,
    businessApi,
    crmApi,
    marketDataApi,
    messagingApi,
    paymentsApi,
    promotionsApi,
    uploadApi,
    verificationApi,
    whatsappApi,
} from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useOrganization } from '../context/useOrganization';
import { formatCurrencyDo, formatDateDo, formatDateTimeDo, MARKET_CONFIG } from '../lib/market';
import { pageLoaders } from '../routes/preload';

interface Business {
    id: string;
    name: string;
    verified: boolean;
    _count?: { reviews: number };
}

interface Promotion {
    id: string;
    title: string;
    couponCode?: string;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: string | number;
    isActive?: boolean;
    startsAt?: string;
    endsAt?: string;
    business: { id: string; name: string };
}

interface Booking {
    id: string;
    status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
    scheduledFor: string;
    quotedAmount?: string | number | null;
    currency?: string;
    business: { id: string; name: string };
    user?: { name: string } | null;
    transactions?: Array<{
        id: string;
        status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELED';
        paymentId?: string | null;
        paidAt?: string | null;
    }>;
}

interface DashboardPayload {
    totals: {
        views: number;
        clicks: number;
        conversions: number;
        grossRevenue: number;
        conversionRate: number;
    };
    marketplace: {
        activePromotions: number;
        pendingBookings: number;
        confirmedBookings: number;
    };
    funnel: {
        searchQueries: number;
        contactClicks: number;
        whatsappClicks: number;
        bookingIntents: number;
        bookingsCreated: number;
        searchToContactRate: number;
        contactToWhatsappRate: number;
        whatsappToBookingRate: number;
        bookingIntentToBookingRate: number;
    };
    roi: {
        periodRevenue: number;
        transactionFees: number;
        adSpend: number;
        subscriptionCost: number;
        totalCosts: number;
        netRevenue: number;
        roiPercent: number;
    };
    subscription: {
        status: string;
        currentPeriodEnd: string | null;
        plan: {
            name: string;
            priceMonthly: string;
            currency: string;
            transactionFeeBps: number;
        };
    } | null;
}

type ConversationStatus = 'OPEN' | 'CLOSED' | 'CONVERTED';

type DashboardTab = 'overview' | 'inbox' | 'crm' | 'billing' | 'ads' | 'verification';

interface ConversationSummary {
    id: string;
    subject?: string | null;
    status: ConversationStatus;
    lastMessageAt: string;
    customerUser: { id: string; name: string; email: string };
    business: { id: string; name: string };
    messages: Array<{ id: string; content: string; senderRole: 'CUSTOMER' | 'BUSINESS_STAFF' | 'SYSTEM'; createdAt: string }>;
    convertedBooking?: { id: string; status: string; scheduledFor: string } | null;
}

interface ConversationThread extends Omit<ConversationSummary, 'messages'> {
    messages: Array<{
        id: string;
        content: string;
        senderRole: 'CUSTOMER' | 'BUSINESS_STAFF' | 'SYSTEM';
        createdAt: string;
        senderUser?: { id: string; name: string } | null;
    }>;
}

interface CrmCustomer {
    user: { id: string; name: string; email: string; createdAt: string };
    segment: 'NUEVO' | 'FRECUENTE' | 'VIP';
    stats: {
        totalBookings: number;
        totalSpent: number;
        totalConversations: number;
        lastActivityAt: string | null;
    };
}

interface CrmCustomerHistory {
    customer: { id: string; name: string; email: string };
    segment: 'NUEVO' | 'FRECUENTE' | 'VIP';
    summary: {
        totalBookings: number;
        totalTransactions: number;
        totalConversations: number;
        totalSpent: number;
    };
    bookings: Array<{
        id: string;
        status: string;
        scheduledFor: string;
        business: { id: string; name: string };
    }>;
}

interface SalesLead {
    id: string;
    stage: 'LEAD' | 'QUOTED' | 'BOOKED' | 'PAID' | 'LOST';
    title: string;
    notes?: string | null;
    estimatedValue?: number | string | null;
    expectedCloseAt?: string | null;
    closedAt?: string | null;
    lostReason?: string | null;
    createdAt: string;
    metadata?: {
        source?: string;
        contactName?: string;
        contactPhone?: string;
        contactEmail?: string;
        preferredChannel?: string;
    } | null;
    business: { id: string; name: string; slug: string };
    customerUser?: { id: string; name: string; email: string } | null;
}

interface BillingSummary {
    invoices: {
        byStatus: Record<string, { count: number; total: number }>;
        total: number;
    };
    payments: {
        byStatus: Record<string, { count: number; total: number }>;
        totalCollected: number;
        totalFailed: number;
    };
    marketplace: {
        successfulTransactions: number;
        grossAmount: number;
        platformFeeAmount: number;
        netAmount: number;
    };
}

interface FiscalSummary {
    totals: {
        invoicesIssued: number;
        invoicesPaid: number;
        subtotal: number;
        tax: number;
        total: number;
        paidTotal: number;
        pendingTotal: number;
    };
    monthly: Array<{
        period: string;
        invoicesIssued: number;
        invoicesPaid: number;
        subtotal: number;
        tax: number;
        total: number;
        paidTotal: number;
    }>;
}

interface AdCampaign {
    id: string;
    name: string;
    status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED';
    dailyBudget: number;
    totalBudget: number;
    bidAmount: number;
    spentAmount: number;
    impressions: number;
    clicks: number;
    ctr: number;
    startsAt: string;
    endsAt: string;
    business: { id: string; name: string };
}

interface AdWalletTopup {
    id: string;
    amount: number;
    currency: string;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
    paidAt?: string | null;
    createdAt: string;
    failureReason?: string | null;
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

interface BusinessAssistantConfig {
    id: string;
    aiAutoResponderEnabled: boolean;
    aiAutoResponderPrompt?: string | null;
    aiLastEmbeddedAt?: string | null;
}

interface BusinessAutoReplyResponse {
    reply: string;
    businessName: string;
    organizationId: string;
}

interface BusinessAnalyticsSnapshot {
    business: {
        id: string;
        name: string;
        slug: string;
    };
    totals: {
        views: number;
        clicks: number;
        conversions: number;
        reservationRequests: number;
        grossRevenue: number;
        conversionRate: number;
        clickThroughRate: number;
    };
}

interface PaymentRow {
    id: string;
    provider: string;
    amount: string | number;
    currency: string;
    status: string;
    paidAt?: string | null;
    createdAt: string;
}

interface InvoiceRow {
    id: string;
    number?: string | null;
    amountTotal: string | number;
    currency: string;
    status: string;
    issuedAt: string;
    dueAt?: string | null;
    paidAt?: string | null;
}

interface TransactionRow {
    id: string;
    status: string;
    grossAmount: string | number;
    platformFeeAmount: string | number;
    netAmount: string | number;
    currency: string;
    createdAt: string;
    paidAt?: string | null;
    business: { id: string; name: string; slug: string };
    booking?: { id: string; scheduledFor: string; status: string } | null;
    buyerUser?: { id: string; name: string; email: string } | null;
}

interface WhatsAppConversationSummary {
    id: string;
    status: 'OPEN' | 'CLOSED' | 'ESCALATED';
    customerPhone: string;
    customerName?: string | null;
    autoResponderActive?: boolean;
    lastMessageAt: string;
    business: { id: string; name: string; slug: string };
    messages?: Array<{
        id: string;
        content?: string | null;
        createdAt: string;
    }>;
}

interface ManagedBusinessDetail {
    id: string;
    name: string;
    slug: string;
    description: string;
    phone?: string | null;
    whatsapp?: string | null;
    address: string;
    images?: Array<{ id: string; url: string }>;
}

interface CommercialAgendaItem {
    id: string;
    holidayDate: string;
    holidayName: string;
    daysUntil: number;
    campaignWindow: {
        start: string;
        end: string;
    };
    suggestedCategories: string[];
    recommendation: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
}

type PromotionForm = {
    businessId: string;
    title: string;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: string;
    couponCode: string;
    startsAt: string;
    endsAt: string;
};

const EMPTY_PROMOTION_FORM: PromotionForm = {
    businessId: '',
    title: '',
    discountType: 'PERCENTAGE',
    discountValue: '10',
    couponCode: '',
    startsAt: '',
    endsAt: '',
};

const TABS: Array<{ key: DashboardTab; label: string }> = [
    { key: 'overview', label: 'OperaciÃ³n' },
    { key: 'inbox', label: 'Inbox' },
    { key: 'crm', label: 'CRM' },
    { key: 'billing', label: 'FacturaciÃ³n' },
    { key: 'ads', label: 'Ads' },
    { key: 'verification', label: 'VerificaciÃ³n' },
];
const DashboardBillingTab = lazy(async () => ({
    default: (await pageLoaders.dashboardBillingTab()).DashboardBillingTab,
}));
const DashboardAdsTab = lazy(async () => ({
    default: (await pageLoaders.dashboardAdsTab()).DashboardAdsTab,
}));
const DashboardVerificationTab = lazy(async () => ({
    default: (await pageLoaders.dashboardVerificationTab()).DashboardVerificationTab,
}));

function asNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCurrency(value: string | number | null | undefined): string {
    return formatCurrencyDo(asNumber(value), MARKET_CONFIG.currency);
}

function formatDateTime(value?: string | null): string {
    if (!value) {
        return 'N/D';
    }
    return formatDateTimeDo(value);
}

function resolveAdsWalletTopupStatus(status: AdWalletTopup['status']) {
    switch (status) {
        case 'SUCCEEDED':
            return {
                label: 'Aprobada',
                className: 'bg-emerald-100 text-emerald-700',
            };
        case 'FAILED':
            return {
                label: 'Fallida',
                className: 'bg-red-100 text-red-700',
            };
        case 'CANCELED':
            return {
                label: 'Cancelada',
                className: 'bg-amber-100 text-amber-700',
            };
        default:
            return {
                label: 'Pendiente',
                className: 'bg-gray-100 text-gray-700',
            };
    }
}

function resolveCsvFileName(contentDisposition: string | undefined, fallback: string): string {
    if (!contentDisposition) {
        return fallback;
    }

    const match = contentDisposition.match(/filename="?([^"]+)"?/i);
    return match?.[1] ?? fallback;
}

function formatDaysUntilLabel(daysUntil: number): string {
    if (daysUntil <= 0) return 'Hoy';
    if (daysUntil === 1) return 'Manana';
    return `En ${daysUntil} dias`;
}

export function DashboardBusiness() {
    const { activeOrganizationId } = useOrganization();

    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [loading, setLoading] = useState(true);

    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [metrics, setMetrics] = useState<DashboardPayload | null>(null);
    const [commercialAgenda, setCommercialAgenda] = useState<CommercialAgendaItem[]>([]);
    const [commercialAgendaLoading, setCommercialAgendaLoading] = useState(false);

    const [promotionForm, setPromotionForm] = useState<PromotionForm>(EMPTY_PROMOTION_FORM);
    const [creatingPromotion, setCreatingPromotion] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
    const [chargingBookingId, setChargingBookingId] = useState<string | null>(null);

    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [conversationFilter, setConversationFilter] = useState<ConversationStatus | 'ALL'>('OPEN');
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
    const [threadLoading, setThreadLoading] = useState(false);
    const [replyContent, setReplyContent] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    const [convertingConversation, setConvertingConversation] = useState(false);
    const [convertForm, setConvertForm] = useState({
        scheduledFor: '',
        partySize: '2',
        quotedAmount: '',
        depositAmount: '',
        notes: '',
    });

    const [customers, setCustomers] = useState<CrmCustomer[]>([]);
    const [crmLoading, setCrmLoading] = useState(false);
    const [crmSearch, setCrmSearch] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [customerHistoryLoading, setCustomerHistoryLoading] = useState(false);
    const [customerHistory, setCustomerHistory] = useState<CrmCustomerHistory | null>(null);
    const [pipelineLeads, setPipelineLeads] = useState<SalesLead[]>([]);
    const [pipelineLoading, setPipelineLoading] = useState(false);
    const [creatingLead, setCreatingLead] = useState(false);
    const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
    const [leadForm, setLeadForm] = useState({
        businessId: '',
        title: '',
        notes: '',
        estimatedValue: '',
        expectedCloseAt: '',
    });

    const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
    const [fiscalSummary, setFiscalSummary] = useState<FiscalSummary | null>(null);
    const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
    const [recentInvoices, setRecentInvoices] = useState<InvoiceRow[]>([]);
    const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingRange, setBillingRange] = useState({ from: '', to: '' });
    const [exportingCsv, setExportingCsv] = useState<'invoices' | 'payments' | 'fiscal' | null>(null);

    const [businessAnalytics, setBusinessAnalytics] = useState<BusinessAnalyticsSnapshot | null>(null);
    const [businessAnalyticsLoading, setBusinessAnalyticsLoading] = useState(false);
    const [selectedManagedBusinessId, setSelectedManagedBusinessId] = useState<string>('');
    const [managedBusinessDetail, setManagedBusinessDetail] = useState<ManagedBusinessDetail | null>(null);
    const [managedBusinessLoading, setManagedBusinessLoading] = useState(false);
    const [managedBusinessSaving, setManagedBusinessSaving] = useState(false);
    const [managedBusinessDeletingImageId, setManagedBusinessDeletingImageId] = useState<string | null>(null);
    const [managedBusinessForm, setManagedBusinessForm] = useState({
        name: '',
        description: '',
        phone: '',
        whatsapp: '',
        address: '',
    });

    const [adsLoading, setAdsLoading] = useState(false);
    const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
    const [adsWalletBalance, setAdsWalletBalance] = useState(0);
    const [adsWalletTopups, setAdsWalletTopups] = useState<AdWalletTopup[]>([]);
    const [adsWalletTopupAmount, setAdsWalletTopupAmount] = useState('1000');
    const [creatingAdsWalletTopup, setCreatingAdsWalletTopup] = useState(false);
    const [creatingCampaign, setCreatingCampaign] = useState(false);
    const [campaignForm, setCampaignForm] = useState({
        businessId: '',
        name: '',
        dailyBudget: '300',
        totalBudget: '3000',
        bidAmount: '15',
        startsAt: '',
        endsAt: '',
        status: 'DRAFT' as 'DRAFT' | 'ACTIVE',
    });
    const [updatingCampaignId, setUpdatingCampaignId] = useState<string | null>(null);

    const [verificationLoading, setVerificationLoading] = useState(false);
    const [verificationDocuments, setVerificationDocuments] = useState<VerificationDocument[]>([]);
    const [selectedVerificationBusinessId, setSelectedVerificationBusinessId] = useState<string>('');
    const [verificationStatus, setVerificationStatus] = useState<BusinessVerificationStatusPayload | null>(null);
    const [uploadingVerificationDocument, setUploadingVerificationDocument] = useState(false);
    const [submittingBusinessVerification, setSubmittingBusinessVerification] = useState(false);
    const [verificationForm, setVerificationForm] = useState({
        documentType: 'ID_CARD' as VerificationDocument['documentType'],
        notes: '',
    });
    const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);

    const [selectedAiBusinessId, setSelectedAiBusinessId] = useState<string>('');
    const [assistantConfigLoading, setAssistantConfigLoading] = useState(false);
    const [assistantConfigSaving, setAssistantConfigSaving] = useState(false);
    const [assistantReindexing, setAssistantReindexing] = useState(false);
    const [assistantConfigForm, setAssistantConfigForm] = useState({
        enabled: false,
        customPrompt: '',
    });
    const [assistantLastEmbeddedAt, setAssistantLastEmbeddedAt] = useState<string | null>(null);
    const [assistantPreviewMessage, setAssistantPreviewMessage] = useState('');
    const [assistantPreviewCustomerName, setAssistantPreviewCustomerName] = useState('');
    const [assistantPreviewReply, setAssistantPreviewReply] = useState('');
    const [assistantPreviewLoading, setAssistantPreviewLoading] = useState(false);

    const [whatsAppConversations, setWhatsAppConversations] = useState<WhatsAppConversationSummary[]>([]);
    const [whatsAppLoading, setWhatsAppLoading] = useState(false);
    const [updatingWhatsAppConversationId, setUpdatingWhatsAppConversationId] = useState<string | null>(null);

    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const hydratedTabsRef = useRef<Record<DashboardTab, boolean>>({
        overview: true,
        inbox: false,
        crm: false,
        billing: false,
        ads: false,
        verification: false,
    });
    const lastConversationFilterRef = useRef<ConversationStatus | 'ALL' | null>(null);
    const lastCrmSearchRef = useRef('');
    const billingRangeRef = useRef(billingRange);

    useEffect(() => {
        billingRangeRef.current = billingRange;
    }, [billingRange]);

    useEffect(() => {
        hydratedTabsRef.current = {
            overview: true,
            inbox: false,
            crm: false,
            billing: false,
            ads: false,
            verification: false,
        };
        lastConversationFilterRef.current = null;
        lastCrmSearchRef.current = '';
    }, [activeOrganizationId]);

    const loadDashboard = useCallback(async () => {
        if (!activeOrganizationId) {
            setLoading(false);
            setBusinesses([]);
            setPromotions([]);
            setBookings([]);
            setMetrics(null);
            setCommercialAgenda([]);
            setCommercialAgendaLoading(false);
            setSelectedAiBusinessId('');
            setSelectedManagedBusinessId('');
            setAssistantPreviewReply('');
            setBusinessAnalytics(null);
            setManagedBusinessDetail(null);
            setErrorMessage('Selecciona una organizaciÃ³n para usar el dashboard');
            return;
        }

        setLoading(true);
        setCommercialAgendaLoading(true);
        setErrorMessage('');

        try {
            const [businessesRes, promotionsRes, bookingsRes, metricsRes, agendaRes] = await Promise.all([
                businessApi.getMine(),
                promotionsApi.getMine({ limit: 10 }),
                bookingsApi.getMineAsOrganization({ limit: 10 }),
                analyticsApi.getMyDashboard({ days: 30 }),
                marketDataApi.getDominicanCommercialAgenda({ limit: 4, horizonDays: 90 }),
            ]);

            const loadedBusinesses = businessesRes.data || [];
            setBusinesses(loadedBusinesses);
            setPromotions(promotionsRes.data?.data || []);
            setBookings(bookingsRes.data?.data || []);
            setMetrics(metricsRes.data || null);
            setCommercialAgenda(agendaRes.data?.items || []);
            setPromotionForm((previous) => ({
                ...previous,
                businessId: previous.businessId || loadedBusinesses[0]?.id || '',
            }));
            setCampaignForm((previous) => ({
                ...previous,
                businessId: previous.businessId || loadedBusinesses[0]?.id || '',
            }));
            setLeadForm((previous) => ({
                ...previous,
                businessId: previous.businessId || loadedBusinesses[0]?.id || '',
            }));
            setSelectedVerificationBusinessId((previous) => previous || loadedBusinesses[0]?.id || '');
            setSelectedAiBusinessId((previous) => previous || loadedBusinesses[0]?.id || '');
            setSelectedManagedBusinessId((previous) => previous || loadedBusinesses[0]?.id || '');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el dashboard'));
        } finally {
            setLoading(false);
            setCommercialAgendaLoading(false);
        }
    }, [activeOrganizationId]);

    const loadConversations = useCallback(async () => {
        if (!activeOrganizationId) {
            setConversations([]);
            setSelectedConversationId(null);
            return;
        }

        setConversationsLoading(true);
        try {
            const params: Record<string, string | number | boolean> = {
                limit: 20,
            };
            if (conversationFilter !== 'ALL') {
                params.status = conversationFilter;
            }

            const response = await messagingApi.getOrgConversations(params);
            const rows = (response.data?.data || []) as ConversationSummary[];
            setConversations(rows);
            setSelectedConversationId((previous) => {
                if (!previous && rows[0]) {
                    return rows[0].id;
                }
                if (previous && !rows.some((item) => item.id === previous)) {
                    return rows[0]?.id ?? null;
                }
                return previous;
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la bandeja de entrada'));
        } finally {
            setConversationsLoading(false);
        }
    }, [activeOrganizationId, conversationFilter]);

    const loadConversationThread = useCallback(async (conversationId: string) => {
        setThreadLoading(true);
        try {
            const response = await messagingApi.getOrgConversationThread(conversationId);
            setSelectedThread(response.data as ConversationThread);
        } catch (error) {
            setSelectedThread(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la conversaciÃ³n'));
        } finally {
            setThreadLoading(false);
        }
    }, []);
    const loadCustomers = useCallback(async (searchTerm: string) => {
        if (!activeOrganizationId) {
            setCustomers([]);
            setSelectedCustomerId(null);
            setCustomerHistory(null);
            return;
        }

        setCrmLoading(true);
        try {
            const response = await crmApi.getCustomers({
                search: searchTerm.trim() || undefined,
                limit: 20,
            });
            const rows = (response.data?.data || []) as CrmCustomer[];
            setCustomers(rows);
            setSelectedCustomerId((previous) => {
                if (!previous && rows[0]) {
                    return rows[0].user.id;
                }
                if (previous && !rows.some((item) => item.user.id === previous)) {
                    return rows[0]?.user.id ?? null;
                }
                return previous;
            });
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el CRM'));
        } finally {
            setCrmLoading(false);
        }
    }, [activeOrganizationId]);

    const loadCustomerHistory = useCallback(async (customerUserId: string) => {
        setCustomerHistoryLoading(true);
        try {
            const response = await crmApi.getCustomerHistory(customerUserId);
            setCustomerHistory(response.data as CrmCustomerHistory);
        } catch (error) {
            setCustomerHistory(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el historial del cliente'));
        } finally {
            setCustomerHistoryLoading(false);
        }
    }, []);

    const loadPipeline = useCallback(async () => {
        if (!activeOrganizationId) {
            setPipelineLeads([]);
            return;
        }

        setPipelineLoading(true);
        try {
            const response = await crmApi.getPipeline({ limit: 50 });
            setPipelineLeads((response.data?.data || []) as SalesLead[]);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el pipeline'));
        } finally {
            setPipelineLoading(false);
        }
    }, [activeOrganizationId]);

    const handleCreateLead = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!leadForm.businessId || !leadForm.title.trim()) {
            setErrorMessage('Selecciona negocio y titulo para crear un lead');
            return;
        }

        setCreatingLead(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await crmApi.createLead({
                businessId: leadForm.businessId,
                title: leadForm.title.trim(),
                notes: leadForm.notes.trim() || undefined,
                estimatedValue: leadForm.estimatedValue ? Number(leadForm.estimatedValue) : undefined,
                expectedCloseAt: leadForm.expectedCloseAt
                    ? new Date(leadForm.expectedCloseAt).toISOString()
                    : undefined,
            });
            setLeadForm((previous) => ({
                ...previous,
                title: '',
                notes: '',
                estimatedValue: '',
                expectedCloseAt: '',
            }));
            await loadPipeline();
            setSuccessMessage('Lead agregado al pipeline');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear el lead'));
        } finally {
            setCreatingLead(false);
        }
    };

    const handleLeadStageChange = async (
        leadId: string,
        stage: 'LEAD' | 'QUOTED' | 'BOOKED' | 'PAID' | 'LOST',
    ) => {
        setUpdatingLeadId(leadId);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await crmApi.updateLeadStage(leadId, {
                stage,
                lostReason: stage === 'LOST' ? 'Marcado manualmente desde dashboard' : undefined,
            });
            await loadPipeline();
            setSuccessMessage('Etapa de lead actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el lead'));
        } finally {
            setUpdatingLeadId(null);
        }
    };

    const loadBillingSummary = useCallback(async () => {
        if (!activeOrganizationId) {
            setBillingSummary(null);
            setFiscalSummary(null);
            setRecentPayments([]);
            setRecentInvoices([]);
            setRecentTransactions([]);
            return;
        }

        setBillingLoading(true);
        try {
            const activeRange = billingRangeRef.current;
            const params = {
                from: activeRange.from ? new Date(activeRange.from).toISOString() : undefined,
                to: activeRange.to ? new Date(activeRange.to).toISOString() : undefined,
            };
            const [billingRes, fiscalRes] = await Promise.all([
                paymentsApi.getBillingSummary(params),
                paymentsApi.getFiscalSummary(params),
            ]);
            setBillingSummary(billingRes.data as BillingSummary);
            setFiscalSummary(fiscalRes.data as FiscalSummary);

            const [paymentsRes, invoicesRes, transactionsRes] = await Promise.all([
                paymentsApi.getMyPayments({ limit: 12 }),
                paymentsApi.getMyInvoices({ limit: 12 }),
                bookingsApi.getTransactionsMyOrganization({ limit: 12 }),
            ]);
            setRecentPayments((paymentsRes.data || []) as PaymentRow[]);
            setRecentInvoices((invoicesRes.data || []) as InvoiceRow[]);
            setRecentTransactions((transactionsRes.data?.data || []) as TransactionRow[]);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar facturaciÃ³n'));
        } finally {
            setBillingLoading(false);
        }
    }, [activeOrganizationId]);

    const loadBusinessAnalytics = useCallback(async (businessId: string) => {
        if (!businessId || !activeOrganizationId) {
            setBusinessAnalytics(null);
            return;
        }

        setBusinessAnalyticsLoading(true);
        try {
            const response = await analyticsApi.getBusinessAnalytics(businessId, { days: 30 });
            setBusinessAnalytics(response.data as BusinessAnalyticsSnapshot);
        } catch (error) {
            setBusinessAnalytics(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar analitica por negocio'));
        } finally {
            setBusinessAnalyticsLoading(false);
        }
    }, [activeOrganizationId]);

    const loadManagedBusinessDetail = useCallback(async (businessId: string) => {
        if (!businessId || !activeOrganizationId) {
            setManagedBusinessDetail(null);
            return;
        }

        setManagedBusinessLoading(true);
        try {
            const response = await businessApi.getById(businessId);
            const payload = response.data as ManagedBusinessDetail;
            setManagedBusinessDetail(payload);
            setManagedBusinessForm({
                name: payload.name || '',
                description: payload.description || '',
                phone: payload.phone || '',
                whatsapp: payload.whatsapp || '',
                address: payload.address || '',
            });
        } catch (error) {
            setManagedBusinessDetail(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el negocio para edicion'));
        } finally {
            setManagedBusinessLoading(false);
        }
    }, [activeOrganizationId]);

    const loadWhatsAppConversations = useCallback(async () => {
        if (!activeOrganizationId) {
            setWhatsAppConversations([]);
            return;
        }

        setWhatsAppLoading(true);
        try {
            const response = await whatsappApi.getMyConversations({ limit: 20 });
            setWhatsAppConversations((response.data?.data || []) as WhatsAppConversationSummary[]);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el inbox de WhatsApp'));
            setWhatsAppConversations([]);
        } finally {
            setWhatsAppLoading(false);
        }
    }, [activeOrganizationId]);

    const loadAdCampaigns = useCallback(async () => {
        if (!activeOrganizationId) {
            setCampaigns([]);
            setAdsWalletBalance(0);
            setAdsWalletTopups([]);
            return;
        }

        setAdsLoading(true);
        try {
            const [campaignsRes, walletRes] = await Promise.all([
                adsApi.getMyCampaigns({ limit: 30 }),
                paymentsApi.getAdsWalletOverview({ limit: 20 }),
            ]);

            setCampaigns((campaignsRes.data?.data || []) as AdCampaign[]);
            setAdsWalletBalance(Number(walletRes.data?.balance ?? 0));
            setAdsWalletTopups((walletRes.data?.topups || []) as AdWalletTopup[]);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar las campaÃ±as ads'));
        } finally {
            setAdsLoading(false);
        }
    }, [activeOrganizationId]);

    const loadVerificationData = useCallback(async () => {
        if (!activeOrganizationId) {
            setVerificationDocuments([]);
            setVerificationStatus(null);
            return;
        }

        setVerificationLoading(true);
        try {
            const documentsRes = await verificationApi.getMyDocuments({ limit: 20 });
            setVerificationDocuments((documentsRes.data?.data || []) as VerificationDocument[]);

            if (selectedVerificationBusinessId) {
                const statusRes = await verificationApi.getBusinessStatus(selectedVerificationBusinessId);
                setVerificationStatus(statusRes.data as BusinessVerificationStatusPayload);
            } else {
                setVerificationStatus(null);
            }
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar verificaciÃ³n'));
        } finally {
            setVerificationLoading(false);
        }
    }, [activeOrganizationId, selectedVerificationBusinessId]);

    const loadAssistantConfig = useCallback(async (businessId: string) => {
        setAssistantConfigLoading(true);
        try {
            const response = await aiApi.getAssistantConfig(businessId);
            const payload = response.data as BusinessAssistantConfig;
            setAssistantConfigForm({
                enabled: Boolean(payload.aiAutoResponderEnabled),
                customPrompt: payload.aiAutoResponderPrompt || '',
            });
            setAssistantLastEmbeddedAt(payload.aiLastEmbeddedAt || null);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la configuracion IA'));
        } finally {
            setAssistantConfigLoading(false);
        }
    }, []);

    const handleSaveAssistantConfig = async () => {
        if (!selectedAiBusinessId) {
            setErrorMessage('Selecciona un negocio para configurar IA');
            return;
        }

        setAssistantConfigSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await aiApi.updateAssistantConfig(selectedAiBusinessId, {
                enabled: assistantConfigForm.enabled,
                customPrompt: assistantConfigForm.customPrompt.trim() || undefined,
            });
            const payload = response.data as BusinessAssistantConfig;
            setAssistantConfigForm({
                enabled: Boolean(payload.aiAutoResponderEnabled),
                customPrompt: payload.aiAutoResponderPrompt || '',
            });
            setAssistantLastEmbeddedAt(payload.aiLastEmbeddedAt || null);
            setSuccessMessage('Configuracion IA actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la configuracion IA'));
        } finally {
            setAssistantConfigSaving(false);
        }
    };

    const handleReindexAssistantContext = async () => {
        if (!selectedAiBusinessId) {
            setErrorMessage('Selecciona un negocio para reindexar');
            return;
        }

        setAssistantReindexing(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await aiApi.reindexBusiness(selectedAiBusinessId);
            setAssistantLastEmbeddedAt(new Date().toISOString());
            setSuccessMessage('Contexto IA reindexado correctamente');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo reindexar el contexto IA'));
        } finally {
            setAssistantReindexing(false);
        }
    };

    const handleGenerateAssistantPreview = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedAiBusinessId) {
            setErrorMessage('Selecciona un negocio para probar la respuesta');
            return;
        }
        if (!assistantPreviewMessage.trim()) {
            setErrorMessage('Escribe un mensaje del cliente para la simulacion');
            return;
        }

        setAssistantPreviewLoading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await aiApi.generateAutoReply(selectedAiBusinessId, {
                message: assistantPreviewMessage.trim(),
                customerName: assistantPreviewCustomerName.trim() || undefined,
            });
            const payload = response.data as BusinessAutoReplyResponse;
            setAssistantPreviewReply(payload.reply || '');
        } catch (error) {
            setAssistantPreviewReply('');
            setErrorMessage(getApiErrorMessage(error, 'No se pudo generar la respuesta IA'));
        } finally {
            setAssistantPreviewLoading(false);
        }
    };

    useEffect(() => {
        void loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        if (loading || typeof window === 'undefined') {
            return;
        }

        const prefetchTimer = window.setTimeout(() => {
            void pageLoaders.dashboardBillingTab();
            void pageLoaders.dashboardAdsTab();
            void pageLoaders.dashboardVerificationTab();
        }, 700);

        return () => window.clearTimeout(prefetchTimer);
    }, [loading]);

    useEffect(() => {
        if (!selectedAiBusinessId) {
            setAssistantConfigForm({
                enabled: false,
                customPrompt: '',
            });
            setAssistantLastEmbeddedAt(null);
            setBusinessAnalytics(null);
            return;
        }

        void loadAssistantConfig(selectedAiBusinessId);
        void loadBusinessAnalytics(selectedAiBusinessId);
    }, [loadAssistantConfig, loadBusinessAnalytics, selectedAiBusinessId]);

    useEffect(() => {
        if (!selectedManagedBusinessId) {
            setManagedBusinessDetail(null);
            return;
        }

        void loadManagedBusinessDetail(selectedManagedBusinessId);
    }, [loadManagedBusinessDetail, selectedManagedBusinessId]);

    useEffect(() => {
        if (activeTab !== 'inbox') {
            return;
        }

        if (!hydratedTabsRef.current.inbox) {
            hydratedTabsRef.current.inbox = true;
            lastConversationFilterRef.current = conversationFilter;
            void loadConversations();
            void loadWhatsAppConversations();
            return;
        }

        if (lastConversationFilterRef.current !== conversationFilter) {
            lastConversationFilterRef.current = conversationFilter;
            void loadConversations();
        }
    }, [activeTab, conversationFilter, loadConversations, loadWhatsAppConversations]);

    useEffect(() => {
        if (activeTab === 'inbox' && selectedConversationId) {
            void loadConversationThread(selectedConversationId);
        }
    }, [activeTab, selectedConversationId, loadConversationThread]);

    useEffect(() => {
        if (activeTab !== 'crm') {
            return;
        }

        const normalizedSearch = crmSearch.trim();
        if (!hydratedTabsRef.current.crm) {
            hydratedTabsRef.current.crm = true;
            lastCrmSearchRef.current = normalizedSearch;
            void loadCustomers(normalizedSearch);
            void loadPipeline();
            return;
        }

        if (lastCrmSearchRef.current === normalizedSearch) {
            return;
        }

        const debounceTimer = window.setTimeout(() => {
            lastCrmSearchRef.current = normalizedSearch;
            void loadCustomers(normalizedSearch);
        }, 300);

        return () => window.clearTimeout(debounceTimer);
    }, [activeTab, crmSearch, loadCustomers, loadPipeline]);

    useEffect(() => {
        if (activeTab === 'crm' && selectedCustomerId) {
            void loadCustomerHistory(selectedCustomerId);
        }
    }, [activeTab, selectedCustomerId, loadCustomerHistory]);

    useEffect(() => {
        if (activeTab !== 'billing' || hydratedTabsRef.current.billing) {
            return;
        }

        hydratedTabsRef.current.billing = true;
        void loadBillingSummary();
    }, [activeTab, loadBillingSummary]);

    useEffect(() => {
        if (activeTab !== 'ads' || hydratedTabsRef.current.ads) {
            return;
        }

        hydratedTabsRef.current.ads = true;
        void loadAdCampaigns();
    }, [activeTab, loadAdCampaigns]);

    useEffect(() => {
        if (activeTab !== 'verification' || hydratedTabsRef.current.verification) {
            return;
        }

        hydratedTabsRef.current.verification = true;
        void loadVerificationData();
    }, [activeTab, loadVerificationData]);

    const verifiedBusinesses = useMemo(
        () => businesses.filter((business) => business.verified).length,
        [businesses],
    );

    const openConversations = useMemo(
        () => conversations.filter((conversation) => conversation.status === 'OPEN').length,
        [conversations],
    );

    const handleCreatePromotion = async (event: React.FormEvent) => {
        event.preventDefault();

        const discount = Number(promotionForm.discountValue);
        if (!promotionForm.businessId || !promotionForm.title.trim() || !Number.isFinite(discount) || discount <= 0) {
            setErrorMessage('Completa negocio, tÃ­tulo y descuento vÃ¡lido');
            return;
        }

        setCreatingPromotion(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await promotionsApi.create({
                businessId: promotionForm.businessId,
                title: promotionForm.title.trim(),
                discountType: promotionForm.discountType,
                discountValue: discount,
                couponCode: promotionForm.couponCode.trim() || undefined,
                startsAt: new Date(promotionForm.startsAt).toISOString(),
                endsAt: new Date(promotionForm.endsAt).toISOString(),
                isFlashOffer: true,
            });
            await loadDashboard();
            setPromotionForm((previous) => ({ ...EMPTY_PROMOTION_FORM, businessId: previous.businessId }));
            setSuccessMessage('PromociÃ³n creada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la promociÃ³n'));
        } finally {
            setCreatingPromotion(false);
        }
    };

    const handleTogglePromotionStatus = async (promotion: Promotion) => {
        setProcessingId(promotion.id);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await promotionsApi.update(promotion.id, {
                isActive: !promotion.isActive,
            });
            await loadDashboard();
            setSuccessMessage(promotion.isActive ? 'Promocion pausada' : 'Promocion reactivada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la promocion'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleDeletePromotion = async (promotionId: string) => {
        const confirmed = window.confirm('Esta accion eliminara la promocion. Deseas continuar?');
        if (!confirmed) {
            return;
        }

        setProcessingId(promotionId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await promotionsApi.delete(promotionId);
            await loadDashboard();
            setSuccessMessage('Promocion eliminada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la promocion'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleSaveManagedBusiness = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedManagedBusinessId) {
            setErrorMessage('Selecciona un negocio para editar');
            return;
        }

        if (!managedBusinessForm.name.trim() || !managedBusinessForm.description.trim() || !managedBusinessForm.address.trim()) {
            setErrorMessage('Nombre, descripcion y direccion son obligatorios');
            return;
        }

        setManagedBusinessSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await businessApi.update(selectedManagedBusinessId, {
                name: managedBusinessForm.name.trim(),
                description: managedBusinessForm.description.trim(),
                phone: managedBusinessForm.phone.trim() || undefined,
                whatsapp: managedBusinessForm.whatsapp.trim() || undefined,
                address: managedBusinessForm.address.trim(),
            });
            await Promise.all([
                loadDashboard(),
                loadManagedBusinessDetail(selectedManagedBusinessId),
                loadBusinessAnalytics(selectedManagedBusinessId),
            ]);
            setSuccessMessage('Datos del negocio actualizados');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el negocio'));
        } finally {
            setManagedBusinessSaving(false);
        }
    };

    const handleDeleteManagedBusinessImage = async (imageId: string) => {
        setManagedBusinessDeletingImageId(imageId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await uploadApi.deleteBusinessImage(imageId);
            if (selectedManagedBusinessId) {
                await loadManagedBusinessDetail(selectedManagedBusinessId);
            }
            setSuccessMessage('Imagen eliminada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la imagen'));
        } finally {
            setManagedBusinessDeletingImageId(null);
        }
    };

    const handleBookingStatus = async (
        booking: Booking,
        status: 'CONFIRMED' | 'COMPLETED' | 'CANCELED',
    ) => {
        setUpdatingBookingId(booking.id);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            let quotedAmount = asNumber(booking.quotedAmount);
            if ((status === 'CONFIRMED' || status === 'COMPLETED') && quotedAmount <= 0) {
                const rawValue = window.prompt(`Monto cotizado en ${MARKET_CONFIG.currency}`, '1000');
                if (!rawValue) {
                    setUpdatingBookingId(null);
                    return;
                }
                quotedAmount = Number(rawValue);
            }

            await bookingsApi.updateStatus(booking.id, {
                status,
                quotedAmount: quotedAmount > 0 ? quotedAmount : undefined,
            });
            await loadDashboard();
            setSuccessMessage('Reserva actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la reserva'));
        } finally {
            setUpdatingBookingId(null);
        }
    };

    const handleBookingCheckout = async (booking: Booking) => {
        if (booking.status === 'CANCELED' || booking.status === 'NO_SHOW') {
            setErrorMessage('La reserva no permite cobro');
            return;
        }

        setChargingBookingId(booking.id);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            let quotedAmount = asNumber(booking.quotedAmount);
            if (quotedAmount <= 0) {
                const rawValue = window.prompt(`Monto a cobrar en ${MARKET_CONFIG.currency}`, '1000');
                if (!rawValue) {
                    return;
                }

                quotedAmount = Number(rawValue);
                if (!Number.isFinite(quotedAmount) || quotedAmount <= 0) {
                    setErrorMessage('El monto debe ser mayor que 0');
                    return;
                }

                await bookingsApi.updateStatus(booking.id, {
                    status: booking.status,
                    quotedAmount,
                });
            }

            const origin = window.location.origin;
            const response = await paymentsApi.createBookingCheckoutSession(booking.id, {
                successUrl: `${origin}/dashboard`,
                cancelUrl: `${origin}/dashboard`,
            });

            const checkoutUrl = response.data?.checkoutUrl as string | undefined;
            if (!checkoutUrl) {
                throw new Error('No se recibio URL de checkout');
            }

            window.location.assign(checkoutUrl);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar el cobro de la reserva'));
        } finally {
            setChargingBookingId(null);
        }
    };

    const handleSendReply = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedConversationId || !replyContent.trim()) {
            return;
        }

        setSendingReply(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await messagingApi.sendMessageAsOrg(selectedConversationId, { content: replyContent.trim() });
            setReplyContent('');
            await Promise.all([loadConversations(), loadConversationThread(selectedConversationId)]);
            setSuccessMessage('Mensaje enviado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar el mensaje'));
        } finally {
            setSendingReply(false);
        }
    };

    const handleToggleConversationStatus = async () => {
        if (!selectedThread || !selectedConversationId) {
            return;
        }

        const nextStatus: ConversationStatus = selectedThread.status === 'OPEN' ? 'CLOSED' : 'OPEN';
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await messagingApi.updateConversationStatus(selectedConversationId, {
                status: nextStatus,
            });
            await Promise.all([loadConversations(), loadConversationThread(selectedConversationId)]);
            setSuccessMessage(nextStatus === 'OPEN' ? 'ConversaciÃ³n reabierta' : 'ConversaciÃ³n cerrada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el estado'));
        }
    };

    const handleWhatsAppConversationStatus = async (
        conversationId: string,
        status: 'OPEN' | 'CLOSED' | 'ESCALATED',
    ) => {
        setUpdatingWhatsAppConversationId(conversationId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await whatsappApi.updateConversationStatus(conversationId, { status });
            await loadWhatsAppConversations();
            setSuccessMessage('Estado de WhatsApp actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar conversacion de WhatsApp'));
        } finally {
            setUpdatingWhatsAppConversationId(null);
        }
    };

    const handleConvertConversation = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!selectedConversationId || !convertForm.scheduledFor) {
            setErrorMessage('Indica fecha y hora de la reserva');
            return;
        }

        setConvertingConversation(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await messagingApi.convertConversationToBooking(selectedConversationId, {
                scheduledFor: new Date(convertForm.scheduledFor).toISOString(),
                partySize: convertForm.partySize ? Number(convertForm.partySize) : undefined,
                quotedAmount: convertForm.quotedAmount ? Number(convertForm.quotedAmount) : undefined,
                depositAmount: convertForm.depositAmount ? Number(convertForm.depositAmount) : undefined,
                notes: convertForm.notes.trim() || undefined,
            });
            await Promise.all([loadDashboard(), loadConversations(), loadConversationThread(selectedConversationId)]);
            setSuccessMessage('ConversaciÃ³n convertida a reserva');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo convertir la conversaciÃ³n'));
        } finally {
            setConvertingConversation(false);
        }
    };

    const handleDownloadCsv = async (target: 'invoices' | 'payments' | 'fiscal') => {
        setExportingCsv(target);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const params = {
                from: billingRange.from ? new Date(billingRange.from).toISOString() : undefined,
                to: billingRange.to ? new Date(billingRange.to).toISOString() : undefined,
            };

            const response = target === 'invoices'
                ? await paymentsApi.exportInvoicesCsv(params)
                : target === 'payments'
                    ? await paymentsApi.exportPaymentsCsv(params)
                    : await paymentsApi.exportFiscalCsv(params);

            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = resolveCsvFileName(
                response.headers['content-disposition'] as string | undefined,
                target === 'invoices'
                    ? 'invoices.csv'
                    : target === 'payments'
                        ? 'payments.csv'
                        : 'fiscal.csv',
            );
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            setSuccessMessage('CSV descargado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo exportar CSV'));
        } finally {
            setExportingCsv(null);
        }
    };

    const handleCreateCampaign = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!campaignForm.businessId || !campaignForm.name.trim()) {
            setErrorMessage('Selecciona negocio y nombre para la campaÃ±a');
            return;
        }

        const dailyBudget = Number(campaignForm.dailyBudget);
        const totalBudget = Number(campaignForm.totalBudget);
        const bidAmount = Number(campaignForm.bidAmount);
        if (!Number.isFinite(dailyBudget) || !Number.isFinite(totalBudget) || !Number.isFinite(bidAmount)) {
            setErrorMessage('Presupuestos y puja deben ser numÃ©ricos');
            return;
        }

        if (!campaignForm.startsAt || !campaignForm.endsAt) {
            setErrorMessage('Debes indicar rango de fechas para la campaÃ±a');
            return;
        }

        setCreatingCampaign(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await adsApi.createCampaign({
                businessId: campaignForm.businessId,
                name: campaignForm.name.trim(),
                dailyBudget,
                totalBudget,
                bidAmount,
                startsAt: new Date(campaignForm.startsAt).toISOString(),
                endsAt: new Date(campaignForm.endsAt).toISOString(),
                status: campaignForm.status,
            });
            await loadAdCampaigns();
            setCampaignForm((previous) => ({
                ...previous,
                name: '',
                startsAt: '',
                endsAt: '',
            }));
            setSuccessMessage('CampaÃ±a ads creada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la campaÃ±a ads'));
        } finally {
            setCreatingCampaign(false);
        }
    };

    const handleCreateAdsWalletTopup = async (event: React.FormEvent) => {
        event.preventDefault();
        const amount = Number(adsWalletTopupAmount);
        if (!Number.isFinite(amount) || amount < 1) {
            setErrorMessage('Monto de recarga invÃ¡lido');
            return;
        }

        setCreatingAdsWalletTopup(true);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const origin = window.location.origin;
            const response = await paymentsApi.createAdsWalletCheckoutSession({
                amount,
                successUrl: `${origin}/dashboard`,
                cancelUrl: `${origin}/dashboard`,
            });

            const checkoutUrl = response.data?.checkoutUrl as string | undefined;
            if (!checkoutUrl) {
                throw new Error('No se recibiÃ³ URL de checkout');
            }

            window.location.assign(checkoutUrl);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar la recarga del Ads Wallet'));
        } finally {
            setCreatingAdsWalletTopup(false);
        }
    };

    const handleCampaignStatus = async (
        campaignId: string,
        status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED',
    ) => {
        setUpdatingCampaignId(campaignId);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await adsApi.updateCampaignStatus(campaignId, { status });
            await loadAdCampaigns();
            setSuccessMessage('Estado de campaÃ±a actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la campaÃ±a'));
        } finally {
            setUpdatingCampaignId(null);
        }
    };

    const handleSubmitVerificationDocument = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedVerificationBusinessId) {
            setErrorMessage('Selecciona un negocio para subir documentos');
            return;
        }
        if (!selectedDocumentFile) {
            setErrorMessage('Debes seleccionar un archivo de documento');
            return;
        }

        setUploadingVerificationDocument(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const uploadResponse = await verificationApi.uploadDocumentFile(
                selectedVerificationBusinessId,
                selectedDocumentFile,
            );
            const uploadedFileUrl = uploadResponse.data?.fileUrl as string | undefined;
            if (!uploadedFileUrl) {
                throw new Error('No se recibiÃ³ URL del documento');
            }

            await verificationApi.submitDocument({
                businessId: selectedVerificationBusinessId,
                documentType: verificationForm.documentType,
                fileUrl: uploadedFileUrl,
            });
            setSelectedDocumentFile(null);
            await loadVerificationData();
            setSuccessMessage('Documento de verificaciÃ³n cargado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar documento'));
        } finally {
            setUploadingVerificationDocument(false);
        }
    };

    const handleSubmitBusinessVerification = async () => {
        if (!selectedVerificationBusinessId) {
            setErrorMessage('Selecciona un negocio');
            return;
        }

        setSubmittingBusinessVerification(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.submitBusiness(selectedVerificationBusinessId, {
                notes: verificationForm.notes.trim() || undefined,
            });
            await loadVerificationData();
            setSuccessMessage('Negocio enviado a revisiÃ³n');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar a revisiÃ³n'));
        } finally {
            setSubmittingBusinessVerification(false);
        }
    };
    const renderOverview = () => (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">SuscripciÃ³n</h2>
                    {metrics?.subscription ? (
                        <div className="text-sm text-gray-600 space-y-1">
                            <p>Plan: <span className="font-semibold text-gray-900">{metrics.subscription.plan.name}</span></p>
                            <p>Estado: <span className="font-semibold text-gray-900">{metrics.subscription.status}</span></p>
                            <p>Mensualidad: <span className="font-semibold text-gray-900">{formatCurrencyDo(Number(metrics.subscription.plan.priceMonthly), metrics.subscription.plan.currency)}</span></p>
                            <p>Fee marketplace: <span className="font-semibold text-gray-900">{(metrics.subscription.plan.transactionFeeBps / 100).toFixed(2)}%</span></p>
                            <p>PrÃ³ximo pago: <span className="font-semibold text-gray-900">{metrics.subscription.currentPeriodEnd ? formatDateDo(metrics.subscription.currentPeriodEnd) : 'No definido'}</span></p>
                        </div>
                    ) : <p className="text-sm text-gray-500">Sin datos de suscripciÃ³n.</p>}
                </div>

                <div className="card p-5 xl:col-span-2">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Marketplace</h2>
                    <p className="text-sm text-gray-600">
                        Promociones activas: <strong>{metrics?.marketplace.activePromotions || 0}</strong> Â·
                        Reservas pendientes: <strong>{metrics?.marketplace.pendingBookings || 0}</strong> Â·
                        Reservas confirmadas: <strong>{metrics?.marketplace.confirmedBookings || 0}</strong>
                    </p>
                    <p className="text-sm text-gray-600 mt-2">Tasa de conversiÃ³n: <strong>{metrics?.totals.conversionRate || 0}%</strong></p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Embudo de conversion</h2>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-gray-100 p-3">
                            <p className="text-gray-500">Busquedas</p>
                            <p className="text-xl font-semibold text-gray-900">{metrics?.funnel.searchQueries ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 p-3">
                            <p className="text-gray-500">Contactos</p>
                            <p className="text-xl font-semibold text-gray-900">{metrics?.funnel.contactClicks ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 p-3">
                            <p className="text-gray-500">WhatsApp</p>
                            <p className="text-xl font-semibold text-gray-900">{metrics?.funnel.whatsappClicks ?? 0}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 p-3">
                            <p className="text-gray-500">Intentos reserva</p>
                            <p className="text-xl font-semibold text-gray-900">{metrics?.funnel.bookingIntents ?? 0}</p>
                        </div>
                    </div>
                    <div className="mt-4 text-sm text-gray-600 space-y-1">
                        <p>Busqueda a contacto: <strong>{metrics?.funnel.searchToContactRate ?? 0}%</strong></p>
                        <p>Contacto a WhatsApp: <strong>{metrics?.funnel.contactToWhatsappRate ?? 0}%</strong></p>
                        <p>WhatsApp a intento: <strong>{metrics?.funnel.whatsappToBookingRate ?? 0}%</strong></p>
                        <p>Intento a reserva: <strong>{metrics?.funnel.bookingIntentToBookingRate ?? 0}%</strong></p>
                    </div>
                </div>
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">ROI del periodo</h2>
                    <div className="space-y-2 text-sm text-gray-600">
                        <p>Ingresos: <strong className="text-gray-900">{formatCurrency(metrics?.roi.periodRevenue ?? 0)}</strong></p>
                        <p>Fees plataforma: <strong className="text-gray-900">{formatCurrency(metrics?.roi.transactionFees ?? 0)}</strong></p>
                        <p>Gasto en ads: <strong className="text-gray-900">{formatCurrency(metrics?.roi.adSpend ?? 0)}</strong></p>
                        <p>Suscripcion prorrateada: <strong className="text-gray-900">{formatCurrency(metrics?.roi.subscriptionCost ?? 0)}</strong></p>
                        <p>Costos totales: <strong className="text-gray-900">{formatCurrency(metrics?.roi.totalCosts ?? 0)}</strong></p>
                        <p>Neto: <strong className={(metrics?.roi.netRevenue ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatCurrency(metrics?.roi.netRevenue ?? 0)}</strong></p>
                        <p>ROI: <strong className={(metrics?.roi.roiPercent ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}>{metrics?.roi.roiPercent ?? 0}%</strong></p>
                    </div>
                </div>
            </div>

            <div className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h2 className="font-display text-lg font-semibold text-gray-900">Agenda comercial RD</h2>
                        <p className="text-xs text-gray-500">Feriados proximos y acciones sugeridas para conversion local.</p>
                    </div>
                    <span className="chip !text-[11px] !py-1">Prox. 90 dias</span>
                </div>

                {commercialAgendaLoading ? (
                    <div className="space-y-2">
                        <div className="h-16 rounded-xl border border-gray-100 bg-gray-50 animate-pulse"></div>
                        <div className="h-16 rounded-xl border border-gray-100 bg-gray-50 animate-pulse"></div>
                    </div>
                ) : commercialAgenda.length === 0 ? (
                    <p className="text-sm text-gray-500">Sin eventos comerciales disponibles por ahora.</p>
                ) : (
                    <div className="space-y-2">
                        {commercialAgenda.map((item) => (
                            <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-semibold text-gray-900 truncate">{item.holidayName}</p>
                                    <span className="text-xs text-primary-700 shrink-0">{formatDaysUntilLabel(item.daysUntil)}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Ventana: {formatDateDo(item.campaignWindow.start)} - {formatDateDo(item.campaignWindow.end)}
                                </p>
                                <p className="text-sm text-gray-700 mt-1 line-clamp-2">{item.recommendation}</p>
                                {item.suggestedCategories.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {item.suggestedCategories.slice(0, 3).map((category) => (
                                            <span key={`${item.id}-${category}`} className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                                                {category}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 className="font-display text-lg font-semibold text-gray-900">Analitica por negocio</h2>
                        <select
                            className="input-field text-sm max-w-[260px]"
                            value={selectedAiBusinessId}
                            onChange={(event) => setSelectedAiBusinessId(event.target.value)}
                        >
                            <option value="">Selecciona negocio</option>
                            {businesses.map((business) => (
                                <option key={business.id} value={business.id}>
                                    {business.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {businessAnalyticsLoading ? (
                        <p className="text-sm text-gray-500">Cargando analitica...</p>
                    ) : businessAnalytics ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs text-gray-500">Vistas 30d</p>
                                <p className="text-xl font-semibold text-gray-900">{businessAnalytics.totals.views}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs text-gray-500">Clics 30d</p>
                                <p className="text-xl font-semibold text-gray-900">{businessAnalytics.totals.clicks}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs text-gray-500">Conversiones</p>
                                <p className="text-xl font-semibold text-gray-900">{businessAnalytics.totals.conversions}</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3">
                                <p className="text-xs text-gray-500">Tasa conversion</p>
                                <p className="text-xl font-semibold text-primary-700">{businessAnalytics.totals.conversionRate}%</p>
                            </div>
                            <div className="rounded-xl border border-gray-100 p-3 col-span-2">
                                <p className="text-xs text-gray-500">Ingresos estimados</p>
                                <p className="text-xl font-semibold text-emerald-700">{formatCurrency(businessAnalytics.totals.grossRevenue)}</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">Selecciona un negocio para ver su rendimiento detallado.</p>
                    )}
                </div>

                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Editar negocio y media</h2>
                    <div className="space-y-3">
                        <select
                            className="input-field text-sm"
                            value={selectedManagedBusinessId}
                            onChange={(event) => setSelectedManagedBusinessId(event.target.value)}
                        >
                            <option value="">Selecciona negocio</option>
                            {businesses.map((business) => (
                                <option key={business.id} value={business.id}>
                                    {business.name}
                                </option>
                            ))}
                        </select>

                        {managedBusinessLoading ? (
                            <p className="text-sm text-gray-500">Cargando datos del negocio...</p>
                        ) : managedBusinessDetail ? (
                            <>
                                <form onSubmit={handleSaveManagedBusiness} className="space-y-2">
                                    <input
                                        className="input-field text-sm"
                                        value={managedBusinessForm.name}
                                        onChange={(event) => setManagedBusinessForm((previous) => ({ ...previous, name: event.target.value }))}
                                        placeholder="Nombre"
                                    />
                                    <textarea
                                        className="input-field text-sm"
                                        rows={3}
                                        value={managedBusinessForm.description}
                                        onChange={(event) => setManagedBusinessForm((previous) => ({ ...previous, description: event.target.value }))}
                                        placeholder="Descripcion"
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input
                                            className="input-field text-sm"
                                            value={managedBusinessForm.phone}
                                            onChange={(event) => setManagedBusinessForm((previous) => ({ ...previous, phone: event.target.value }))}
                                            placeholder="Telefono"
                                        />
                                        <input
                                            className="input-field text-sm"
                                            value={managedBusinessForm.whatsapp}
                                            onChange={(event) => setManagedBusinessForm((previous) => ({ ...previous, whatsapp: event.target.value }))}
                                            placeholder="WhatsApp"
                                        />
                                    </div>
                                    <input
                                        className="input-field text-sm"
                                        value={managedBusinessForm.address}
                                        onChange={(event) => setManagedBusinessForm((previous) => ({ ...previous, address: event.target.value }))}
                                        placeholder="Direccion"
                                    />
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm"
                                        disabled={managedBusinessSaving}
                                    >
                                        {managedBusinessSaving ? 'Guardando...' : 'Guardar cambios'}
                                    </button>
                                </form>

                                <div className="rounded-xl border border-gray-100 p-3">
                                    <p className="text-xs text-gray-500 mb-2">Imagenes publicadas</p>
                                    {managedBusinessDetail.images && managedBusinessDetail.images.length > 0 ? (
                                        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                            {managedBusinessDetail.images.map((image) => (
                                                <div key={image.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 p-2">
                                                    <a
                                                        href={image.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="truncate text-xs text-primary-700 hover:text-primary-800"
                                                    >
                                                        {image.url}
                                                    </a>
                                                    <button
                                                        type="button"
                                                        className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200 disabled:opacity-50"
                                                        onClick={() => void handleDeleteManagedBusinessImage(image.id)}
                                                        disabled={managedBusinessDeletingImageId === image.id}
                                                    >
                                                        {managedBusinessDeletingImageId === image.id ? 'Eliminando...' : 'Eliminar'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500">No hay imagenes cargadas en este negocio.</p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-sm text-gray-500">Selecciona un negocio para editar su perfil.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Asistente IA del negocio</h2>
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="assistant-business-select" className="text-xs text-gray-600 mb-1 block">
                                Negocio
                            </label>
                            <select
                                id="assistant-business-select"
                                className="input-field text-sm"
                                value={selectedAiBusinessId}
                                onChange={(event) => setSelectedAiBusinessId(event.target.value)}
                            >
                                <option value="">Selecciona negocio</option>
                                {businesses.map((business) => (
                                    <option key={business.id} value={business.id}>
                                        {business.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                                type="checkbox"
                                checked={assistantConfigForm.enabled}
                                onChange={(event) =>
                                    setAssistantConfigForm((previous) => ({
                                        ...previous,
                                        enabled: event.target.checked,
                                    }))
                                }
                            />
                            Activar auto respondedor IA
                        </label>

                        <div>
                            <label htmlFor="assistant-custom-prompt" className="text-xs text-gray-600 mb-1 block">
                                Prompt personalizado
                            </label>
                            <textarea
                                id="assistant-custom-prompt"
                                rows={4}
                                className="input-field text-sm"
                                placeholder="Ej: responde con tono formal, menciona horario y motiva reservar por WhatsApp."
                                value={assistantConfigForm.customPrompt}
                                onChange={(event) =>
                                    setAssistantConfigForm((previous) => ({
                                        ...previous,
                                        customPrompt: event.target.value,
                                    }))
                                }
                            />
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="btn-primary text-sm"
                                disabled={assistantConfigSaving || assistantConfigLoading}
                                onClick={() => void handleSaveAssistantConfig()}
                            >
                                {assistantConfigSaving ? 'Guardando...' : 'Guardar configuracion'}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary text-sm"
                                disabled={assistantReindexing || assistantConfigLoading}
                                onClick={() => void handleReindexAssistantContext()}
                            >
                                {assistantReindexing ? 'Reindexando...' : 'Reindexar contexto'}
                            </button>
                        </div>

                        <p className="text-xs text-gray-500">
                            Ultima indexacion: {assistantLastEmbeddedAt ? formatDateTime(assistantLastEmbeddedAt) : 'N/D'}
                        </p>
                    </div>
                </div>

                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Simulador de respuesta IA</h2>
                    <form onSubmit={handleGenerateAssistantPreview} className="space-y-3">
                        <input
                            className="input-field text-sm"
                            placeholder="Nombre cliente (opcional)"
                            value={assistantPreviewCustomerName}
                            onChange={(event) => setAssistantPreviewCustomerName(event.target.value)}
                        />
                        <textarea
                            className="input-field text-sm"
                            rows={4}
                            placeholder="Mensaje del cliente para probar el asistente..."
                            value={assistantPreviewMessage}
                            onChange={(event) => setAssistantPreviewMessage(event.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn-primary text-sm"
                            disabled={assistantPreviewLoading || assistantConfigLoading}
                        >
                            {assistantPreviewLoading ? 'Generando...' : 'Generar respuesta'}
                        </button>
                    </form>

                    <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 min-h-[104px]">
                        <p className="text-xs text-gray-500 mb-1">Respuesta de la IA</p>
                        <p className="text-sm text-gray-800 whitespace-pre-line">
                            {assistantPreviewReply || 'Aun no hay simulacion. Prueba un mensaje para ver el resultado.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Nueva promociÃ³n</h2>
                    <form className="space-y-3" onSubmit={handleCreatePromotion}>
                        <select className="input-field text-sm" value={promotionForm.businessId} onChange={(event) => setPromotionForm((previous) => ({ ...previous, businessId: event.target.value }))}>
                            <option value="">Selecciona negocio</option>
                            {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                        </select>
                        <input className="input-field text-sm" placeholder="TÃ­tulo" value={promotionForm.title} onChange={(event) => setPromotionForm((previous) => ({ ...previous, title: event.target.value }))} />
                        <div className="grid grid-cols-2 gap-3">
                            <select className="input-field text-sm" value={promotionForm.discountType} onChange={(event) => setPromotionForm((previous) => ({ ...previous, discountType: event.target.value as 'PERCENTAGE' | 'FIXED' }))}>
                                <option value="PERCENTAGE">Porcentaje %</option>
                                <option value="FIXED">Monto fijo</option>
                            </select>
                            <input className="input-field text-sm" type="number" min="1" step="0.01" placeholder="Descuento" value={promotionForm.discountValue} onChange={(event) => setPromotionForm((previous) => ({ ...previous, discountValue: event.target.value }))} />
                        </div>
                        <input className="input-field text-sm" placeholder="CÃ³digo (opcional)" value={promotionForm.couponCode} onChange={(event) => setPromotionForm((previous) => ({ ...previous, couponCode: event.target.value.toUpperCase() }))} />
                        <div className="grid grid-cols-2 gap-3">
                            <input className="input-field text-sm" type="datetime-local" value={promotionForm.startsAt} onChange={(event) => setPromotionForm((previous) => ({ ...previous, startsAt: event.target.value }))} />
                            <input className="input-field text-sm" type="datetime-local" value={promotionForm.endsAt} onChange={(event) => setPromotionForm((previous) => ({ ...previous, endsAt: event.target.value }))} />
                        </div>
                        <button type="submit" className="btn-primary text-sm" disabled={creatingPromotion}>{creatingPromotion ? 'Creando...' : 'Publicar'}</button>
                    </form>
                </div>

                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Promociones activas</h2>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {promotions.length > 0 ? promotions.map((promotion) => (
                            <div key={promotion.id} className="rounded-xl border border-gray-100 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-gray-900">{promotion.title}</p>
                                        <p className="text-xs text-gray-500">{promotion.business.name}</p>
                                        <p className="text-xs text-gray-500">
                                            {promotion.discountType === 'PERCENTAGE'
                                                ? `${asNumber(promotion.discountValue)}%`
                                                : formatCurrency(promotion.discountValue)}
                                            {promotion.couponCode ? ` · ${promotion.couponCode}` : ''}
                                        </p>
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            Estado: {promotion.isActive ? 'Activa' : 'Pausada'}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={processingId === promotion.id}
                                            onClick={() => void handleTogglePromotionStatus(promotion)}
                                        >
                                            {processingId === promotion.id
                                                ? 'Procesando...'
                                                : promotion.isActive
                                                    ? 'Pausar'
                                                    : 'Activar'}
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200 disabled:opacity-50"
                                            disabled={processingId === promotion.id}
                                            onClick={() => void handleDeletePromotion(promotion.id)}
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )) : <p className="text-sm text-gray-500">No hay promociones registradas.</p>}
                    </div>
                </div>
            </div>

            <div className="card p-5">
                <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Reservas recientes</h2>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {bookings.length > 0 ? bookings.map((booking) => {
                        const latestTransaction = booking.transactions?.[0];
                        const paymentCaptured = latestTransaction?.status === 'SUCCEEDED';
                        const canCharge =
                            (booking.status === 'PENDING' || booking.status === 'CONFIRMED') &&
                            !paymentCaptured;

                        return (
                            <div key={booking.id} className="rounded-xl border border-gray-100 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-gray-900">{booking.business.name}</p>
                                        <p className="text-xs text-gray-500">{formatDateTimeDo(booking.scheduledFor)} Â· {booking.user?.name || 'Cliente plataforma'}</p>
                                        <p className="text-xs text-gray-500">{asNumber(booking.quotedAmount) > 0 ? formatCurrency(booking.quotedAmount) : 'Monto pendiente de cotizar'}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{booking.status}</span>
                                        {paymentCaptured && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                                Pago confirmado
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {booking.status !== 'COMPLETED' && booking.status !== 'CANCELED' && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {booking.status === 'PENDING' && <button type="button" className="btn-secondary text-xs" disabled={updatingBookingId === booking.id || chargingBookingId === booking.id} onClick={() => void handleBookingStatus(booking, 'CONFIRMED')}>Confirmar</button>}
                                        {booking.status === 'CONFIRMED' && <button type="button" className="btn-primary text-xs" disabled={updatingBookingId === booking.id || chargingBookingId === booking.id} onClick={() => void handleBookingStatus(booking, 'COMPLETED')}>Completar</button>}
                                        <button type="button" className="btn-secondary text-xs" disabled={updatingBookingId === booking.id || chargingBookingId === booking.id} onClick={() => void handleBookingStatus(booking, 'CANCELED')}>Cancelar</button>
                                        {canCharge && (
                                            <button
                                                type="button"
                                                className="btn-primary text-xs"
                                                disabled={chargingBookingId === booking.id || updatingBookingId === booking.id}
                                                onClick={() => void handleBookingCheckout(booking)}
                                            >
                                                {chargingBookingId === booking.id ? 'Abriendo checkout...' : 'Cobrar'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    }) : <p className="text-sm text-gray-500">No hay reservas registradas.</p>}
                </div>
            </div>
        </>
    );

    const renderInbox = () => (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-lg font-semibold text-gray-900">Inbox</h2>
                    <span className="text-xs rounded-full bg-primary-50 text-primary-700 px-2 py-1">{openConversations} abiertas</span>
                </div>
                <div className="flex gap-2 mb-3">
                    {(['ALL', 'OPEN', 'CLOSED', 'CONVERTED'] as const).map((status) => (
                        <button key={status} type="button" onClick={() => setConversationFilter(status)} className={`text-xs px-2 py-1 rounded-lg border ${conversationFilter === status ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                            {status}
                        </button>
                    ))}
                </div>
                <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                    {conversationsLoading ? <p className="text-sm text-gray-500">Cargando conversaciones...</p> : conversations.length > 0 ? conversations.map((conversation) => (
                        <button key={conversation.id} type="button" onClick={() => setSelectedConversationId(conversation.id)} className={`w-full text-left rounded-xl border p-3 ${selectedConversationId === conversation.id ? 'border-primary-400 bg-primary-50' : 'border-gray-100 hover:border-primary-200'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">{conversation.customerUser.name}</p>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-gray-200">{conversation.status}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{conversation.subject || 'Sin asunto'}</p>
                            <p className="text-xs text-gray-500 truncate">{conversation.messages[0]?.content || 'Sin mensajes'}</p>
                        </button>
                    )) : <p className="text-sm text-gray-500">No hay conversaciones.</p>}
                </div>
            </div>

            <div className="card p-5 xl:col-span-2">
                {!selectedConversationId ? <p className="text-sm text-gray-500">Selecciona una conversaciÃ³n.</p> : threadLoading ? <p className="text-sm text-gray-500">Cargando conversaciÃ³n...</p> : selectedThread ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="font-display text-lg font-semibold text-gray-900">{selectedThread.subject || 'ConversaciÃ³n'}</h3>
                                <p className="text-sm text-gray-500">{selectedThread.customerUser.name} Â· {selectedThread.customerUser.email}</p>
                                <p className="text-xs text-gray-400">Negocio: {selectedThread.business.name}</p>
                            </div>
                            <button type="button" onClick={() => void handleToggleConversationStatus()} className="btn-secondary text-xs" disabled={selectedThread.status === 'CONVERTED'}>
                                {selectedThread.status === 'OPEN' ? 'Cerrar' : 'Reabrir'}
                            </button>
                        </div>

                        <div className="rounded-xl border border-gray-100 p-3 max-h-[20rem] overflow-y-auto space-y-2">
                            {selectedThread.messages.map((message) => (
                                <div key={message.id} className={`rounded-lg px-3 py-2 text-sm ${message.senderRole === 'BUSINESS_STAFF' ? 'bg-primary-50 border border-primary-100' : message.senderRole === 'SYSTEM' ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100'}`}>
                                    <p className="text-xs text-gray-500 mb-1">{message.senderRole}{message.senderUser?.name ? ` Â· ${message.senderUser.name}` : ''} Â· {formatDateTime(message.createdAt)}</p>
                                    <p className="text-gray-800 whitespace-pre-line">{message.content}</p>
                                </div>
                            ))}
                        </div>

                        <form onSubmit={handleSendReply} className="space-y-2">
                            <textarea className="input-field text-sm" rows={3} value={replyContent} onChange={(event) => setReplyContent(event.target.value)} placeholder="Responder al cliente..." disabled={selectedThread.status !== 'OPEN'} />
                            <button type="submit" className="btn-primary text-sm" disabled={sendingReply || selectedThread.status !== 'OPEN'}>{sendingReply ? 'Enviando...' : 'Enviar respuesta'}</button>
                        </form>

                        {selectedThread.status !== 'CONVERTED' && (
                            <div className="rounded-xl border border-gray-100 p-4">
                                <h4 className="font-semibold text-gray-900 mb-2">Convertir a reserva</h4>
                                <form onSubmit={handleConvertConversation} className="space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input type="datetime-local" className="input-field text-sm" value={convertForm.scheduledFor} onChange={(event) => setConvertForm((previous) => ({ ...previous, scheduledFor: event.target.value }))} />
                                        <input type="number" min="1" className="input-field text-sm" placeholder="TamaÃ±o grupo" value={convertForm.partySize} onChange={(event) => setConvertForm((previous) => ({ ...previous, partySize: event.target.value }))} />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input type="number" min="0" step="0.01" className="input-field text-sm" placeholder="Monto cotizado" value={convertForm.quotedAmount} onChange={(event) => setConvertForm((previous) => ({ ...previous, quotedAmount: event.target.value }))} />
                                        <input type="number" min="0" step="0.01" className="input-field text-sm" placeholder="DepÃ³sito" value={convertForm.depositAmount} onChange={(event) => setConvertForm((previous) => ({ ...previous, depositAmount: event.target.value }))} />
                                    </div>
                                    <textarea className="input-field text-sm" rows={2} placeholder="Notas" value={convertForm.notes} onChange={(event) => setConvertForm((previous) => ({ ...previous, notes: event.target.value }))} />
                                    <button type="submit" className="btn-primary text-sm" disabled={convertingConversation}>{convertingConversation ? 'Convirtiendo...' : 'Crear reserva'}</button>
                                </form>
                            </div>
                        )}
                    </div>
                ) : <p className="text-sm text-gray-500">No se pudo cargar esta conversaciÃ³n.</p>}

                <div className="mt-6 rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-display text-base font-semibold text-gray-900">Canal WhatsApp</h3>
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => void loadWhatsAppConversations()}
                            disabled={whatsAppLoading}
                        >
                            {whatsAppLoading ? 'Actualizando...' : 'Actualizar'}
                        </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {whatsAppConversations.length > 0 ? whatsAppConversations.map((conversation) => (
                            <div key={conversation.id} className="rounded-lg border border-gray-100 p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">
                                            {conversation.customerName || conversation.customerPhone}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {conversation.business.name} · {formatDateTime(conversation.lastMessageAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                            {conversation.status}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={updatingWhatsAppConversationId === conversation.id}
                                            onClick={() =>
                                                void handleWhatsAppConversationStatus(
                                                    conversation.id,
                                                    conversation.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                                                )
                                            }
                                        >
                                            {updatingWhatsAppConversationId === conversation.id
                                                ? 'Procesando...'
                                                : conversation.status === 'OPEN'
                                                    ? 'Cerrar'
                                                    : 'Reabrir'}
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center justify-end">
                                    <button
                                        type="button"
                                        className="text-xs text-amber-700 hover:text-amber-800 disabled:opacity-50"
                                        disabled={updatingWhatsAppConversationId === conversation.id || conversation.status === 'ESCALATED'}
                                        onClick={() => void handleWhatsAppConversationStatus(conversation.id, 'ESCALATED')}
                                    >
                                        Marcar escalada
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <p className="text-sm text-gray-500">No hay conversaciones en WhatsApp.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
    const renderCrm = () => (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-5 xl:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h2 className="font-display text-lg font-semibold text-gray-900">Clientes</h2>
                    <input type="search" className="input-field text-sm max-w-xs" placeholder="Buscar por nombre o email" value={crmSearch} onChange={(event) => setCrmSearch(event.target.value)} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b border-gray-100 text-gray-500">
                            <tr>
                                <th className="text-left py-2">Cliente</th>
                                <th className="text-left py-2">Segmento</th>
                                <th className="text-left py-2">Reservas</th>
                                <th className="text-left py-2">Gasto</th>
                                <th className="text-left py-2">Ãšltima actividad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {crmLoading ? (
                                <tr><td className="py-3 text-gray-500" colSpan={5}>Cargando clientes...</td></tr>
                            ) : customers.length > 0 ? customers.map((customer) => (
                                <tr key={customer.user.id} className={`border-b border-gray-50 cursor-pointer ${selectedCustomerId === customer.user.id ? 'bg-primary-50' : ''}`} onClick={() => setSelectedCustomerId(customer.user.id)}>
                                    <td className="py-2"><p className="font-medium text-gray-900">{customer.user.name}</p><p className="text-xs text-gray-500">{customer.user.email}</p></td>
                                    <td className="py-2"><span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{customer.segment}</span></td>
                                    <td className="py-2">{customer.stats.totalBookings}</td>
                                    <td className="py-2">{formatCurrency(customer.stats.totalSpent)}</td>
                                    <td className="py-2 text-xs text-gray-500">{formatDateTime(customer.stats.lastActivityAt)}</td>
                                </tr>
                            )) : (
                                <tr><td className="py-3 text-gray-500" colSpan={5}>No hay clientes.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card p-5">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Historial cliente</h3>
                {customerHistoryLoading ? <p className="text-sm text-gray-500">Cargando historial...</p> : customerHistory ? (
                    <div className="space-y-3 text-sm">
                        <div>
                            <p className="font-semibold text-gray-900">{customerHistory.customer.name}</p>
                            <p className="text-gray-500">{customerHistory.customer.email}</p>
                            <p className="text-xs text-gray-500 mt-1">Segmento: {customerHistory.segment}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 p-3 space-y-1">
                            <p>Reservas: <strong>{customerHistory.summary.totalBookings}</strong></p>
                            <p>Compras: <strong>{customerHistory.summary.totalTransactions}</strong></p>
                            <p>Conversaciones: <strong>{customerHistory.summary.totalConversations}</strong></p>
                            <p>Gasto: <strong>{formatCurrency(customerHistory.summary.totalSpent)}</strong></p>
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900 mb-1">Ãšltimas reservas</p>
                            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                {customerHistory.bookings.slice(0, 5).map((booking) => (
                                    <div key={booking.id} className="rounded-lg border border-gray-100 p-2">
                                        <p className="text-xs font-medium text-gray-900">{booking.business.name}</p>
                                        <p className="text-xs text-gray-500">{booking.status} Â· {formatDateTime(booking.scheduledFor)}</p>
                                    </div>
                                ))}
                                {customerHistory.bookings.length === 0 && <p className="text-xs text-gray-500">Sin reservas.</p>}
                            </div>
                        </div>
                    </div>
                ) : <p className="text-sm text-gray-500">Selecciona un cliente.</p>}
            </div>

            <div className="card p-5 xl:col-span-3">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-display text-lg font-semibold text-gray-900">Pipeline de ventas</h3>
                    <span className="text-xs rounded-full bg-primary-50 text-primary-700 px-2 py-1">
                        {pipelineLeads.length} leads
                    </span>
                </div>

                <form onSubmit={handleCreateLead} className="rounded-xl border border-gray-100 p-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <select
                            className="input-field text-sm"
                            value={leadForm.businessId}
                            onChange={(event) =>
                                setLeadForm((previous) => ({ ...previous, businessId: event.target.value }))
                            }
                        >
                            <option value="">Selecciona negocio</option>
                            {businesses.map((business) => (
                                <option key={business.id} value={business.id}>
                                    {business.name}
                                </option>
                            ))}
                        </select>
                        <input
                            className="input-field text-sm"
                            placeholder="Titulo del lead"
                            value={leadForm.title}
                            onChange={(event) =>
                                setLeadForm((previous) => ({ ...previous, title: event.target.value }))
                            }
                        />
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="Valor estimado"
                            value={leadForm.estimatedValue}
                            onChange={(event) =>
                                setLeadForm((previous) => ({ ...previous, estimatedValue: event.target.value }))
                            }
                        />
                        <input
                            type="datetime-local"
                            className="input-field text-sm"
                            value={leadForm.expectedCloseAt}
                            onChange={(event) =>
                                setLeadForm((previous) => ({ ...previous, expectedCloseAt: event.target.value }))
                            }
                        />
                        <button
                            type="submit"
                            className="btn-primary text-sm"
                            disabled={creatingLead}
                        >
                            {creatingLead ? 'Creando...' : 'Crear lead'}
                        </button>
                    </div>
                    <textarea
                        className="input-field text-sm mt-3"
                        rows={2}
                        placeholder="Notas del lead (opcional)"
                        value={leadForm.notes}
                        onChange={(event) =>
                            setLeadForm((previous) => ({ ...previous, notes: event.target.value }))
                        }
                    />
                </form>

                {pipelineLoading ? (
                    <p className="text-sm text-gray-500">Cargando pipeline...</p>
                ) : pipelineLeads.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-100 text-gray-500">
                                <tr>
                                    <th className="text-left py-2">Lead</th>
                                    <th className="text-left py-2">Negocio</th>
                                    <th className="text-left py-2">Cliente</th>
                                    <th className="text-left py-2">Valor</th>
                                    <th className="text-left py-2">Etapa</th>
                                    <th className="text-left py-2">Cierre</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pipelineLeads.map((lead) => (
                                    <tr key={lead.id} className="border-b border-gray-50">
                                        <td className="py-2">
                                            <p className="font-medium text-gray-900">{lead.title}</p>
                                            {lead.notes ? (
                                                <p className="text-xs text-gray-500 line-clamp-2">{lead.notes}</p>
                                            ) : null}
                                        </td>
                                        <td className="py-2">{lead.business.name}</td>
                                        <td className="py-2 text-xs text-gray-600">
                                            <p>{lead.customerUser?.name || lead.metadata?.contactName || 'Sin cliente'}</p>
                                            {lead.metadata?.contactPhone ? (
                                                <p className="text-[11px] text-gray-500">{lead.metadata.contactPhone}</p>
                                            ) : null}
                                            {lead.metadata?.contactEmail ? (
                                                <p className="text-[11px] text-gray-500">{lead.metadata.contactEmail}</p>
                                            ) : null}
                                            {lead.metadata?.source ? (
                                                <p className="text-[10px] text-primary-600 uppercase tracking-wide">{lead.metadata.source}</p>
                                            ) : null}
                                        </td>
                                        <td className="py-2">{formatCurrency(lead.estimatedValue)}</td>
                                        <td className="py-2">
                                            <select
                                                className="input-field text-xs py-1"
                                                value={lead.stage}
                                                disabled={updatingLeadId === lead.id}
                                                onChange={(event) =>
                                                    void handleLeadStageChange(
                                                        lead.id,
                                                        event.target.value as 'LEAD' | 'QUOTED' | 'BOOKED' | 'PAID' | 'LOST',
                                                    )
                                                }
                                            >
                                                <option value="LEAD">LEAD</option>
                                                <option value="QUOTED">QUOTED</option>
                                                <option value="BOOKED">BOOKED</option>
                                                <option value="PAID">PAID</option>
                                                <option value="LOST">LOST</option>
                                            </select>
                                        </td>
                                        <td className="py-2 text-xs text-gray-500">
                                            {formatDateTime(lead.expectedCloseAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">Aun no hay leads en el pipeline.</p>
                )}
            </div>
        </div>
    );

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h1 className="font-display text-3xl font-bold text-gray-900">Dashboard SaaS</h1>
                    <p className="text-gray-500">MÃ©tricas, operaciÃ³n, CRM y facturaciÃ³n</p>
                </div>
                <Link to="/register-business" className="btn-accent">+ Nuevo Negocio</Link>
            </div>

            {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
            {successMessage && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</div>}

            {loading ? (
                <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Negocios</p><p className="text-2xl font-bold text-primary-600">{businesses.length}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Verificados</p><p className="text-2xl font-bold text-emerald-600">{verifiedBusinesses}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Vistas</p><p className="text-2xl font-bold text-sky-600">{metrics?.totals.views || 0}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Clics</p><p className="text-2xl font-bold text-indigo-600">{metrics?.totals.clicks || 0}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Conversiones</p><p className="text-2xl font-bold text-amber-600">{metrics?.totals.conversions || 0}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Inbox abiertas</p><p className="text-2xl font-bold text-fuchsia-700">{openConversations}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Ingresos</p><p className="text-xl font-bold text-emerald-700">{formatCurrency(metrics?.totals.grossRevenue || 0)}</p></div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {TABS.map((tab) => (
                            <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === tab.key ? 'bg-primary-600 text-white shadow-lg' : 'bg-white text-gray-700 border border-gray-200'}`}>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' && renderOverview()}
                    {activeTab === 'inbox' && renderInbox()}
                    {activeTab === 'crm' && renderCrm()}
                    {activeTab === 'billing' && (
                        <Suspense fallback={<div className="card p-5 text-sm text-gray-500">Cargando facturaciÃ³n...</div>}>
                            <DashboardBillingTab
                                billingRange={billingRange}
                                setBillingRange={setBillingRange}
                                loadBillingSummary={loadBillingSummary}
                                billingLoading={billingLoading}
                                handleDownloadCsv={handleDownloadCsv}
                                exportingCsv={exportingCsv}
                                billingSummary={billingSummary}
                                fiscalSummary={fiscalSummary}
                                recentPayments={recentPayments}
                                recentInvoices={recentInvoices}
                                recentTransactions={recentTransactions}
                                formatCurrency={formatCurrency}
                                formatDateTime={formatDateTime}
                            />
                        </Suspense>
                    )}
                    {activeTab === 'ads' && (
                        <Suspense fallback={<div className="card p-5 text-sm text-gray-500">Cargando ads...</div>}>
                            <DashboardAdsTab
                                businesses={businesses}
                                adsLoading={adsLoading}
                                loadAdCampaigns={loadAdCampaigns}
                                adsWalletBalance={adsWalletBalance}
                                handleCreateAdsWalletTopup={handleCreateAdsWalletTopup}
                                adsWalletTopupAmount={adsWalletTopupAmount}
                                setAdsWalletTopupAmount={setAdsWalletTopupAmount}
                                creatingAdsWalletTopup={creatingAdsWalletTopup}
                                adsWalletTopups={adsWalletTopups}
                                resolveAdsWalletTopupStatus={resolveAdsWalletTopupStatus}
                                formatCurrency={formatCurrency}
                                formatDateTime={formatDateTime}
                                handleCreateCampaign={handleCreateCampaign}
                                campaignForm={campaignForm}
                                setCampaignForm={setCampaignForm}
                                creatingCampaign={creatingCampaign}
                                campaigns={campaigns}
                                updatingCampaignId={updatingCampaignId}
                                handleCampaignStatus={handleCampaignStatus}
                            />
                        </Suspense>
                    )}
                    {activeTab === 'verification' && (
                        <Suspense fallback={<div className="card p-5 text-sm text-gray-500">Cargando verificaciÃ³n...</div>}>
                            <DashboardVerificationTab
                                selectedVerificationBusinessId={selectedVerificationBusinessId}
                                setSelectedVerificationBusinessId={setSelectedVerificationBusinessId}
                                businesses={businesses}
                                verificationForm={verificationForm}
                                setVerificationForm={setVerificationForm}
                                selectedDocumentFile={selectedDocumentFile}
                                setSelectedDocumentFile={setSelectedDocumentFile}
                                handleSubmitVerificationDocument={handleSubmitVerificationDocument}
                                uploadingVerificationDocument={uploadingVerificationDocument}
                                submittingBusinessVerification={submittingBusinessVerification}
                                handleSubmitBusinessVerification={handleSubmitBusinessVerification}
                                verificationLoading={verificationLoading}
                                verificationStatus={verificationStatus}
                                verificationDocuments={verificationDocuments}
                                formatDateTime={formatDateTime}
                            />
                        </Suspense>
                    )}
                </>
            )}
        </div>
    );
}



