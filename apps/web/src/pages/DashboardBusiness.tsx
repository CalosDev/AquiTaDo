import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    adsApi,
    analyticsApi,
    bookingsApi,
    businessApi,
    crmApi,
    messagingApi,
    paymentsApi,
    promotionsApi,
    verificationApi,
} from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useOrganization } from '../context/useOrganization';

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
    { key: 'overview', label: 'Operación' },
    { key: 'inbox', label: 'Inbox' },
    { key: 'crm', label: 'CRM' },
    { key: 'billing', label: 'Facturación' },
    { key: 'ads', label: 'Ads' },
    { key: 'verification', label: 'Verificación' },
];

function asNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCurrency(value: string | number | null | undefined): string {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        maximumFractionDigits: 2,
    }).format(asNumber(value));
}

function formatDateTime(value?: string | null): string {
    if (!value) {
        return 'N/D';
    }
    return new Date(value).toLocaleString('es-DO');
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

export function DashboardBusiness() {
    const { activeOrganizationId } = useOrganization();

    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [loading, setLoading] = useState(true);

    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [metrics, setMetrics] = useState<DashboardPayload | null>(null);

    const [promotionForm, setPromotionForm] = useState<PromotionForm>(EMPTY_PROMOTION_FORM);
    const [creatingPromotion, setCreatingPromotion] = useState(false);
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

    const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
    const [fiscalSummary, setFiscalSummary] = useState<FiscalSummary | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingRange, setBillingRange] = useState({ from: '', to: '' });
    const [exportingCsv, setExportingCsv] = useState<'invoices' | 'payments' | 'fiscal' | null>(null);

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
        fileUrl: '',
        notes: '',
    });

    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const loadDashboard = useCallback(async () => {
        if (!activeOrganizationId) {
            setLoading(false);
            setBusinesses([]);
            setPromotions([]);
            setBookings([]);
            setMetrics(null);
            setErrorMessage('Selecciona una organización para usar el dashboard');
            return;
        }

        setLoading(true);
        setErrorMessage('');

        try {
            const [businessesRes, promotionsRes, bookingsRes, metricsRes] = await Promise.all([
                businessApi.getMine(),
                promotionsApi.getMine({ limit: 10 }),
                bookingsApi.getMineAsOrganization({ limit: 10 }),
                analyticsApi.getMyDashboard({ days: 30 }),
            ]);

            const loadedBusinesses = businessesRes.data || [];
            setBusinesses(loadedBusinesses);
            setPromotions(promotionsRes.data?.data || []);
            setBookings(bookingsRes.data?.data || []);
            setMetrics(metricsRes.data || null);
            setPromotionForm((previous) => ({
                ...previous,
                businessId: previous.businessId || loadedBusinesses[0]?.id || '',
            }));
            setCampaignForm((previous) => ({
                ...previous,
                businessId: previous.businessId || loadedBusinesses[0]?.id || '',
            }));
            setSelectedVerificationBusinessId((previous) => previous || loadedBusinesses[0]?.id || '');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el dashboard'));
        } finally {
            setLoading(false);
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
            if (!selectedConversationId && rows[0]) {
                setSelectedConversationId(rows[0].id);
            }
            if (selectedConversationId && !rows.some((item) => item.id === selectedConversationId)) {
                setSelectedConversationId(rows[0]?.id ?? null);
            }
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la bandeja de entrada'));
        } finally {
            setConversationsLoading(false);
        }
    }, [activeOrganizationId, conversationFilter, selectedConversationId]);

    const loadConversationThread = useCallback(async (conversationId: string) => {
        setThreadLoading(true);
        try {
            const response = await messagingApi.getOrgConversationThread(conversationId);
            setSelectedThread(response.data as ConversationThread);
        } catch (error) {
            setSelectedThread(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la conversación'));
        } finally {
            setThreadLoading(false);
        }
    }, []);
    const loadCustomers = useCallback(async () => {
        if (!activeOrganizationId) {
            setCustomers([]);
            setSelectedCustomerId(null);
            setCustomerHistory(null);
            return;
        }

        setCrmLoading(true);
        try {
            const response = await crmApi.getCustomers({
                search: crmSearch.trim() || undefined,
                limit: 20,
            });
            const rows = (response.data?.data || []) as CrmCustomer[];
            setCustomers(rows);
            if (!selectedCustomerId && rows[0]) {
                setSelectedCustomerId(rows[0].user.id);
            }
            if (selectedCustomerId && !rows.some((item) => item.user.id === selectedCustomerId)) {
                setSelectedCustomerId(rows[0]?.user.id ?? null);
            }
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el CRM'));
        } finally {
            setCrmLoading(false);
        }
    }, [activeOrganizationId, crmSearch, selectedCustomerId]);

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

    const loadBillingSummary = useCallback(async () => {
        if (!activeOrganizationId) {
            setBillingSummary(null);
            setFiscalSummary(null);
            return;
        }

        setBillingLoading(true);
        try {
            const params = {
                from: billingRange.from ? new Date(billingRange.from).toISOString() : undefined,
                to: billingRange.to ? new Date(billingRange.to).toISOString() : undefined,
            };
            const [billingRes, fiscalRes] = await Promise.all([
                paymentsApi.getBillingSummary(params),
                paymentsApi.getFiscalSummary(params),
            ]);
            setBillingSummary(billingRes.data as BillingSummary);
            setFiscalSummary(fiscalRes.data as FiscalSummary);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar facturación'));
        } finally {
            setBillingLoading(false);
        }
    }, [activeOrganizationId, billingRange.from, billingRange.to]);

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
            setErrorMessage(getApiErrorMessage(error, 'No se pudieron cargar las campañas ads'));
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
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar verificación'));
        } finally {
            setVerificationLoading(false);
        }
    }, [activeOrganizationId, selectedVerificationBusinessId]);

    useEffect(() => {
        void loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        if (activeTab === 'inbox') {
            void loadConversations();
        }
    }, [activeTab, loadConversations]);

    useEffect(() => {
        if (activeTab === 'inbox' && selectedConversationId) {
            void loadConversationThread(selectedConversationId);
        }
    }, [activeTab, selectedConversationId, loadConversationThread]);

    useEffect(() => {
        if (activeTab === 'crm') {
            void loadCustomers();
        }
    }, [activeTab, loadCustomers]);

    useEffect(() => {
        if (activeTab === 'crm' && selectedCustomerId) {
            void loadCustomerHistory(selectedCustomerId);
        }
    }, [activeTab, selectedCustomerId, loadCustomerHistory]);

    useEffect(() => {
        if (activeTab === 'billing') {
            void loadBillingSummary();
        }
    }, [activeTab, loadBillingSummary]);

    useEffect(() => {
        if (activeTab === 'ads') {
            void loadAdCampaigns();
        }
    }, [activeTab, loadAdCampaigns]);

    useEffect(() => {
        if (activeTab === 'verification') {
            void loadVerificationData();
        }
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
            setErrorMessage('Completa negocio, título y descuento válido');
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
            setSuccessMessage('Promoción creada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la promoción'));
        } finally {
            setCreatingPromotion(false);
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
                const rawValue = window.prompt('Monto cotizado en DOP', '1000');
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
                const rawValue = window.prompt('Monto a cobrar en DOP', '1000');
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
            setSuccessMessage(nextStatus === 'OPEN' ? 'Conversación reabierta' : 'Conversación cerrada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el estado'));
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
            setSuccessMessage('Conversación convertida a reserva');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo convertir la conversación'));
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
            setErrorMessage('Selecciona negocio y nombre para la campaña');
            return;
        }

        const dailyBudget = Number(campaignForm.dailyBudget);
        const totalBudget = Number(campaignForm.totalBudget);
        const bidAmount = Number(campaignForm.bidAmount);
        if (!Number.isFinite(dailyBudget) || !Number.isFinite(totalBudget) || !Number.isFinite(bidAmount)) {
            setErrorMessage('Presupuestos y puja deben ser numéricos');
            return;
        }

        if (!campaignForm.startsAt || !campaignForm.endsAt) {
            setErrorMessage('Debes indicar rango de fechas para la campaña');
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
            setSuccessMessage('Campaña ads creada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la campaña ads'));
        } finally {
            setCreatingCampaign(false);
        }
    };

    const handleCreateAdsWalletTopup = async (event: React.FormEvent) => {
        event.preventDefault();
        const amount = Number(adsWalletTopupAmount);
        if (!Number.isFinite(amount) || amount < 1) {
            setErrorMessage('Monto de recarga inválido');
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
                throw new Error('No se recibió URL de checkout');
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
            setSuccessMessage('Estado de campaña actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la campaña'));
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
        if (!verificationForm.fileUrl.trim()) {
            setErrorMessage('Debes indicar URL del documento');
            return;
        }

        setUploadingVerificationDocument(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await verificationApi.submitDocument({
                businessId: selectedVerificationBusinessId,
                documentType: verificationForm.documentType,
                fileUrl: verificationForm.fileUrl.trim(),
            });
            setVerificationForm((previous) => ({
                ...previous,
                fileUrl: '',
            }));
            await loadVerificationData();
            setSuccessMessage('Documento de verificación cargado');
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
            setSuccessMessage('Negocio enviado a revisión');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar a revisión'));
        } finally {
            setSubmittingBusinessVerification(false);
        }
    };
    const renderOverview = () => (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Suscripción</h2>
                    {metrics?.subscription ? (
                        <div className="text-sm text-gray-600 space-y-1">
                            <p>Plan: <span className="font-semibold text-gray-900">{metrics.subscription.plan.name}</span></p>
                            <p>Estado: <span className="font-semibold text-gray-900">{metrics.subscription.status}</span></p>
                            <p>Mensualidad: <span className="font-semibold text-gray-900">{new Intl.NumberFormat('es-DO', { style: 'currency', currency: metrics.subscription.plan.currency }).format(Number(metrics.subscription.plan.priceMonthly))}</span></p>
                            <p>Fee marketplace: <span className="font-semibold text-gray-900">{(metrics.subscription.plan.transactionFeeBps / 100).toFixed(2)}%</span></p>
                            <p>Próximo pago: <span className="font-semibold text-gray-900">{metrics.subscription.currentPeriodEnd ? new Date(metrics.subscription.currentPeriodEnd).toLocaleDateString('es-DO') : 'No definido'}</span></p>
                        </div>
                    ) : <p className="text-sm text-gray-500">Sin datos de suscripción.</p>}
                </div>

                <div className="card p-5 xl:col-span-2">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Marketplace</h2>
                    <p className="text-sm text-gray-600">
                        Promociones activas: <strong>{metrics?.marketplace.activePromotions || 0}</strong> ·
                        Reservas pendientes: <strong>{metrics?.marketplace.pendingBookings || 0}</strong> ·
                        Reservas confirmadas: <strong>{metrics?.marketplace.confirmedBookings || 0}</strong>
                    </p>
                    <p className="text-sm text-gray-600 mt-2">Tasa de conversión: <strong>{metrics?.totals.conversionRate || 0}%</strong></p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-5">
                    <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Nueva promoción</h2>
                    <form className="space-y-3" onSubmit={handleCreatePromotion}>
                        <select className="input-field text-sm" value={promotionForm.businessId} onChange={(event) => setPromotionForm((previous) => ({ ...previous, businessId: event.target.value }))}>
                            <option value="">Selecciona negocio</option>
                            {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                        </select>
                        <input className="input-field text-sm" placeholder="Título" value={promotionForm.title} onChange={(event) => setPromotionForm((previous) => ({ ...previous, title: event.target.value }))} />
                        <div className="grid grid-cols-2 gap-3">
                            <select className="input-field text-sm" value={promotionForm.discountType} onChange={(event) => setPromotionForm((previous) => ({ ...previous, discountType: event.target.value as 'PERCENTAGE' | 'FIXED' }))}>
                                <option value="PERCENTAGE">Porcentaje %</option>
                                <option value="FIXED">Monto fijo</option>
                            </select>
                            <input className="input-field text-sm" type="number" min="1" step="0.01" placeholder="Descuento" value={promotionForm.discountValue} onChange={(event) => setPromotionForm((previous) => ({ ...previous, discountValue: event.target.value }))} />
                        </div>
                        <input className="input-field text-sm" placeholder="Código (opcional)" value={promotionForm.couponCode} onChange={(event) => setPromotionForm((previous) => ({ ...previous, couponCode: event.target.value.toUpperCase() }))} />
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
                                <p className="font-medium text-gray-900">{promotion.title}</p>
                                <p className="text-xs text-gray-500">{promotion.business.name}</p>
                                <p className="text-xs text-gray-500">{promotion.discountType === 'PERCENTAGE' ? `${asNumber(promotion.discountValue)}%` : formatCurrency(promotion.discountValue)}{promotion.couponCode ? ` · ${promotion.couponCode}` : ''}</p>
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
                                        <p className="text-xs text-gray-500">{new Date(booking.scheduledFor).toLocaleString('es-DO')} · {booking.user?.name || 'Cliente plataforma'}</p>
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
                {!selectedConversationId ? <p className="text-sm text-gray-500">Selecciona una conversación.</p> : threadLoading ? <p className="text-sm text-gray-500">Cargando conversación...</p> : selectedThread ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="font-display text-lg font-semibold text-gray-900">{selectedThread.subject || 'Conversación'}</h3>
                                <p className="text-sm text-gray-500">{selectedThread.customerUser.name} · {selectedThread.customerUser.email}</p>
                                <p className="text-xs text-gray-400">Negocio: {selectedThread.business.name}</p>
                            </div>
                            <button type="button" onClick={() => void handleToggleConversationStatus()} className="btn-secondary text-xs" disabled={selectedThread.status === 'CONVERTED'}>
                                {selectedThread.status === 'OPEN' ? 'Cerrar' : 'Reabrir'}
                            </button>
                        </div>

                        <div className="rounded-xl border border-gray-100 p-3 max-h-[20rem] overflow-y-auto space-y-2">
                            {selectedThread.messages.map((message) => (
                                <div key={message.id} className={`rounded-lg px-3 py-2 text-sm ${message.senderRole === 'BUSINESS_STAFF' ? 'bg-primary-50 border border-primary-100' : message.senderRole === 'SYSTEM' ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100'}`}>
                                    <p className="text-xs text-gray-500 mb-1">{message.senderRole}{message.senderUser?.name ? ` · ${message.senderUser.name}` : ''} · {formatDateTime(message.createdAt)}</p>
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
                                        <input type="number" min="1" className="input-field text-sm" placeholder="Tamaño grupo" value={convertForm.partySize} onChange={(event) => setConvertForm((previous) => ({ ...previous, partySize: event.target.value }))} />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <input type="number" min="0" step="0.01" className="input-field text-sm" placeholder="Monto cotizado" value={convertForm.quotedAmount} onChange={(event) => setConvertForm((previous) => ({ ...previous, quotedAmount: event.target.value }))} />
                                        <input type="number" min="0" step="0.01" className="input-field text-sm" placeholder="Depósito" value={convertForm.depositAmount} onChange={(event) => setConvertForm((previous) => ({ ...previous, depositAmount: event.target.value }))} />
                                    </div>
                                    <textarea className="input-field text-sm" rows={2} placeholder="Notas" value={convertForm.notes} onChange={(event) => setConvertForm((previous) => ({ ...previous, notes: event.target.value }))} />
                                    <button type="submit" className="btn-primary text-sm" disabled={convertingConversation}>{convertingConversation ? 'Convirtiendo...' : 'Crear reserva'}</button>
                                </form>
                            </div>
                        )}
                    </div>
                ) : <p className="text-sm text-gray-500">No se pudo cargar esta conversación.</p>}
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
                                <th className="text-left py-2">Última actividad</th>
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
                            <p className="font-semibold text-gray-900 mb-1">Últimas reservas</p>
                            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                                {customerHistory.bookings.slice(0, 5).map((booking) => (
                                    <div key={booking.id} className="rounded-lg border border-gray-100 p-2">
                                        <p className="text-xs font-medium text-gray-900">{booking.business.name}</p>
                                        <p className="text-xs text-gray-500">{booking.status} · {formatDateTime(booking.scheduledFor)}</p>
                                    </div>
                                ))}
                                {customerHistory.bookings.length === 0 && <p className="text-xs text-gray-500">Sin reservas.</p>}
                            </div>
                        </div>
                    </div>
                ) : <p className="text-sm text-gray-500">Selecciona un cliente.</p>}
            </div>
        </div>
    );

    const renderBilling = () => {
        const invoiceStatuses = Object.entries(billingSummary?.invoices.byStatus || {});
        const paymentStatuses = Object.entries(billingSummary?.payments.byStatus || {});
        const monthlyFiscalRows = fiscalSummary?.monthly ?? [];

        return (
            <div className="space-y-6">
                <div className="card p-5">
                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Desde</label>
                            <input type="date" className="input-field text-sm" value={billingRange.from} onChange={(event) => setBillingRange((previous) => ({ ...previous, from: event.target.value }))} />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Hasta</label>
                            <input type="date" className="input-field text-sm" value={billingRange.to} onChange={(event) => setBillingRange((previous) => ({ ...previous, to: event.target.value }))} />
                        </div>
                        <button type="button" className="btn-primary text-sm" onClick={() => void loadBillingSummary()} disabled={billingLoading}>{billingLoading ? 'Cargando...' : 'Actualizar'}</button>
                        <button type="button" className="btn-secondary text-sm" onClick={() => void handleDownloadCsv('invoices')} disabled={exportingCsv === 'invoices'}>{exportingCsv === 'invoices' ? 'Exportando...' : 'Facturas CSV'}</button>
                        <button type="button" className="btn-secondary text-sm" onClick={() => void handleDownloadCsv('payments')} disabled={exportingCsv === 'payments'}>{exportingCsv === 'payments' ? 'Exportando...' : 'Pagos CSV'}</button>
                        <button type="button" className="btn-secondary text-sm" onClick={() => void handleDownloadCsv('fiscal')} disabled={exportingCsv === 'fiscal'}>{exportingCsv === 'fiscal' ? 'Exportando...' : 'Reporte fiscal CSV'}</button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Total facturado</p><p className="text-xl font-bold text-primary-700">{formatCurrency(billingSummary?.invoices.total || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Cobrado</p><p className="text-xl font-bold text-emerald-700">{formatCurrency(billingSummary?.payments.totalCollected || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Fallido</p><p className="text-xl font-bold text-red-700">{formatCurrency(billingSummary?.payments.totalFailed || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Comisión plataforma</p><p className="text-xl font-bold text-amber-700">{formatCurrency(billingSummary?.marketplace.platformFeeAmount || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">ITBIS acumulado</p><p className="text-xl font-bold text-indigo-700">{formatCurrency(fiscalSummary?.totals.tax || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Facturas pagadas</p><p className="text-xl font-bold text-teal-700">{fiscalSummary?.totals.invoicesPaid || 0}</p></div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="card p-5">
                        <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Facturas por estado</h3>
                        <div className="space-y-2">
                            {invoiceStatuses.length > 0 ? invoiceStatuses.map(([status, row]) => (
                                <div key={status} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                    <span className="text-sm text-gray-700">{status}</span>
                                    <span className="text-sm text-gray-900">{row.count} · {formatCurrency(row.total)}</span>
                                </div>
                            )) : <p className="text-sm text-gray-500">Sin datos de facturas.</p>}
                        </div>
                    </div>
                    <div className="card p-5">
                        <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Pagos por estado</h3>
                        <div className="space-y-2">
                            {paymentStatuses.length > 0 ? paymentStatuses.map(([status, row]) => (
                                <div key={status} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                                    <span className="text-sm text-gray-700">{status}</span>
                                    <span className="text-sm text-gray-900">{row.count} · {formatCurrency(row.total)}</span>
                                </div>
                            )) : <p className="text-sm text-gray-500">Sin datos de pagos.</p>}
                        </div>
                    </div>
                </div>

                <div className="card p-5">
                    <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Resumen fiscal mensual</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-gray-100 text-gray-500">
                                <tr>
                                    <th className="text-left py-2">Periodo</th>
                                    <th className="text-left py-2">Emitidas</th>
                                    <th className="text-left py-2">Pagadas</th>
                                    <th className="text-left py-2">Subtotal</th>
                                    <th className="text-left py-2">ITBIS</th>
                                    <th className="text-left py-2">Total</th>
                                    <th className="text-left py-2">Cobrado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyFiscalRows.length > 0 ? monthlyFiscalRows.map((row) => (
                                    <tr key={row.period} className="border-b border-gray-50">
                                        <td className="py-2">{row.period}</td>
                                        <td className="py-2">{row.invoicesIssued}</td>
                                        <td className="py-2">{row.invoicesPaid}</td>
                                        <td className="py-2">{formatCurrency(row.subtotal)}</td>
                                        <td className="py-2">{formatCurrency(row.tax)}</td>
                                        <td className="py-2">{formatCurrency(row.total)}</td>
                                        <td className="py-2">{formatCurrency(row.paidTotal)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td className="py-3 text-gray-500" colSpan={7}>Sin datos fiscales en el rango seleccionado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    const renderAds = () => (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-5 xl:col-span-1">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Ads Wallet</h3>
                <div className="rounded-xl border border-gray-100 p-3 mb-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500">Saldo disponible</p>
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => void loadAdCampaigns()}
                            disabled={adsLoading}
                        >
                            Refrescar
                        </button>
                    </div>
                    <p className={`text-2xl font-bold ${adsWalletBalance > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatCurrency(adsWalletBalance)}
                    </p>
                    <form onSubmit={handleCreateAdsWalletTopup} className="flex items-end gap-2">
                        <div className="flex-1">
                            <label className="text-xs text-gray-500 block mb-1">Recargar saldo (DOP)</label>
                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                className="input-field text-sm"
                                value={adsWalletTopupAmount}
                                onChange={(event) => setAdsWalletTopupAmount(event.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn-primary text-sm" disabled={creatingAdsWalletTopup}>
                            {creatingAdsWalletTopup ? 'Conectando...' : 'Recargar'}
                        </button>
                    </form>
                    <p className="text-xs text-gray-500">Cada clic válido descuenta el CPC de la campaña desde este saldo.</p>
                </div>

                <div className="mb-5">
                    <p className="text-xs text-gray-500 mb-2">Últimas recargas</p>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                        {adsWalletTopups.length > 0 ? adsWalletTopups.slice(0, 8).map((topup) => {
                            const status = resolveAdsWalletTopupStatus(topup.status);
                            return (
                                <div key={topup.id} className="rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-medium text-gray-900">{formatCurrency(topup.amount)}</p>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${status.className}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        {formatDateTime(topup.paidAt || topup.createdAt)}
                                    </p>
                                    {topup.failureReason ? (
                                        <p className="text-[11px] text-red-600 mt-1">{topup.failureReason}</p>
                                    ) : null}
                                </div>
                            );
                        }) : <p className="text-sm text-gray-500">Sin recargas registradas.</p>}
                    </div>
                </div>

                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Nueva campaña</h3>
                <form onSubmit={handleCreateCampaign} className="space-y-3">
                    <select
                        className="input-field text-sm"
                        value={campaignForm.businessId}
                        onChange={(event) =>
                            setCampaignForm((previous) => ({
                                ...previous,
                                businessId: event.target.value,
                            }))
                        }
                    >
                        <option value="">Selecciona negocio</option>
                        {businesses.map((business) => (
                            <option key={business.id} value={business.id}>{business.name}</option>
                        ))}
                    </select>
                    <input
                        className="input-field text-sm"
                        placeholder="Nombre campaña"
                        value={campaignForm.name}
                        onChange={(event) =>
                            setCampaignForm((previous) => ({
                                ...previous,
                                name: event.target.value,
                            }))
                        }
                    />
                    <div className="grid grid-cols-3 gap-2">
                        <input
                            type="number"
                            min="1"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="Diario"
                            value={campaignForm.dailyBudget}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    dailyBudget: event.target.value,
                                }))
                            }
                        />
                        <input
                            type="number"
                            min="1"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="Total"
                            value={campaignForm.totalBudget}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    totalBudget: event.target.value,
                                }))
                            }
                        />
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="CPC"
                            value={campaignForm.bidAmount}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    bidAmount: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="datetime-local"
                            className="input-field text-sm"
                            value={campaignForm.startsAt}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    startsAt: event.target.value,
                                }))
                            }
                        />
                        <input
                            type="datetime-local"
                            className="input-field text-sm"
                            value={campaignForm.endsAt}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    endsAt: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <select
                        className="input-field text-sm"
                        value={campaignForm.status}
                        onChange={(event) =>
                            setCampaignForm((previous) => ({
                                ...previous,
                                status: event.target.value as 'DRAFT' | 'ACTIVE',
                            }))
                        }
                    >
                        <option value="DRAFT">Borrador</option>
                        <option value="ACTIVE">Activa</option>
                    </select>
                    <button type="submit" className="btn-primary text-sm" disabled={creatingCampaign}>
                        {creatingCampaign ? 'Creando...' : 'Crear campaña'}
                    </button>
                </form>
            </div>

            <div className="card p-5 xl:col-span-2">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Campañas actuales</h3>
                <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
                    {adsLoading ? (
                        <p className="text-sm text-gray-500">Cargando campañas ads...</p>
                    ) : campaigns.length > 0 ? (
                        campaigns.map((campaign) => (
                            <div key={campaign.id} className="rounded-xl border border-gray-100 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-gray-900">{campaign.name}</p>
                                        <p className="text-xs text-gray-500">{campaign.business.name}</p>
                                    </div>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                        {campaign.status}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    CPC {formatCurrency(campaign.bidAmount)} ·
                                    Presupuesto {formatCurrency(campaign.spentAmount)} / {formatCurrency(campaign.totalBudget)} ·
                                    CTR {campaign.ctr}%
                                </p>
                                <div className="flex gap-2 mt-2">
                                    {campaign.status !== 'ACTIVE' && campaign.status !== 'ENDED' && (
                                        <button
                                            type="button"
                                            className="btn-primary text-xs"
                                            disabled={updatingCampaignId === campaign.id}
                                            onClick={() => void handleCampaignStatus(campaign.id, 'ACTIVE')}
                                        >
                                            Activar
                                        </button>
                                    )}
                                    {campaign.status === 'ACTIVE' && (
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={updatingCampaignId === campaign.id}
                                            onClick={() => void handleCampaignStatus(campaign.id, 'PAUSED')}
                                        >
                                            Pausar
                                        </button>
                                    )}
                                    {campaign.status !== 'ENDED' && (
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={updatingCampaignId === campaign.id}
                                            onClick={() => void handleCampaignStatus(campaign.id, 'ENDED')}
                                        >
                                            Finalizar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">No hay campañas creadas.</p>
                    )}
                </div>
            </div>
        </div>
    );

    const renderVerification = () => (
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
                        <option value="ID_CARD">Cédula/ID</option>
                        <option value="TAX_CERTIFICATE">RNC/Certificado fiscal</option>
                        <option value="BUSINESS_LICENSE">Licencia comercial</option>
                        <option value="ADDRESS_PROOF">Comprobante dirección</option>
                        <option value="SELFIE">Selfie validación</option>
                        <option value="OTHER">Otro</option>
                    </select>

                    <form onSubmit={handleSubmitVerificationDocument} className="space-y-2">
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
                        placeholder="Notas de revisión (opcional)"
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
                        {submittingBusinessVerification ? 'Enviando...' : 'Enviar a revisión'}
                    </button>
                </div>
            </div>

            <div className="card p-5 xl:col-span-2">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Estado y documentos</h3>
                {verificationLoading ? (
                    <p className="text-sm text-gray-500">Cargando información de verificación...</p>
                ) : (
                    <div className="space-y-4">
                        {verificationStatus ? (
                            <div className="rounded-xl border border-gray-100 p-3 text-sm space-y-1">
                                <p>
                                    Estado: <strong>{verificationStatus.verificationStatus}</strong>
                                </p>
                                <p>
                                    Verificado: <strong>{verificationStatus.verified ? 'Sí' : 'No'}</strong>
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
                                            {document.business.name} · {formatDateTime(document.submittedAt)}
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

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h1 className="font-display text-3xl font-bold text-gray-900">Dashboard SaaS</h1>
                    <p className="text-gray-500">Métricas, operación, CRM y facturación</p>
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
                    {activeTab === 'billing' && renderBilling()}
                    {activeTab === 'ads' && renderAds()}
                    {activeTab === 'verification' && renderVerification()}
                </>
            )}
        </div>
    );
}

