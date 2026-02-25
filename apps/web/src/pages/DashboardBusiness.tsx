import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    analyticsApi,
    bookingsApi,
    businessApi,
    crmApi,
    messagingApi,
    paymentsApi,
    promotionsApi,
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
    business: { id: string; name: string };
    user?: { name: string } | null;
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

type DashboardTab = 'overview' | 'inbox' | 'crm' | 'billing';

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
    const [billingLoading, setBillingLoading] = useState(false);
    const [billingRange, setBillingRange] = useState({ from: '', to: '' });
    const [exportingCsv, setExportingCsv] = useState<'invoices' | 'payments' | null>(null);

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
            return;
        }

        setBillingLoading(true);
        try {
            const response = await paymentsApi.getBillingSummary({
                from: billingRange.from ? new Date(billingRange.from).toISOString() : undefined,
                to: billingRange.to ? new Date(billingRange.to).toISOString() : undefined,
            });
            setBillingSummary(response.data as BillingSummary);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar facturación'));
        } finally {
            setBillingLoading(false);
        }
    }, [activeOrganizationId, billingRange.from, billingRange.to]);

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

    const handleDownloadCsv = async (target: 'invoices' | 'payments') => {
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
                : await paymentsApi.exportPaymentsCsv(params);

            const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = resolveCsvFileName(
                response.headers['content-disposition'] as string | undefined,
                target === 'invoices' ? 'invoices.csv' : 'payments.csv',
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
                    {bookings.length > 0 ? bookings.map((booking) => (
                        <div key={booking.id} className="rounded-xl border border-gray-100 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="font-medium text-gray-900">{booking.business.name}</p>
                                    <p className="text-xs text-gray-500">{new Date(booking.scheduledFor).toLocaleString('es-DO')} · {booking.user?.name || 'Cliente plataforma'}</p>
                                </div>
                                <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">{booking.status}</span>
                            </div>
                            {booking.status !== 'COMPLETED' && booking.status !== 'CANCELED' && (
                                <div className="flex gap-2 mt-2">
                                    {booking.status === 'PENDING' && <button type="button" className="btn-secondary text-xs" disabled={updatingBookingId === booking.id} onClick={() => void handleBookingStatus(booking, 'CONFIRMED')}>Confirmar</button>}
                                    {booking.status === 'CONFIRMED' && <button type="button" className="btn-primary text-xs" disabled={updatingBookingId === booking.id} onClick={() => void handleBookingStatus(booking, 'COMPLETED')}>Completar</button>}
                                    <button type="button" className="btn-secondary text-xs" disabled={updatingBookingId === booking.id} onClick={() => void handleBookingStatus(booking, 'CANCELED')}>Cancelar</button>
                                </div>
                            )}
                        </div>
                    )) : <p className="text-sm text-gray-500">No hay reservas registradas.</p>}
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
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Total facturado</p><p className="text-xl font-bold text-primary-700">{formatCurrency(billingSummary?.invoices.total || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Cobrado</p><p className="text-xl font-bold text-emerald-700">{formatCurrency(billingSummary?.payments.totalCollected || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Fallido</p><p className="text-xl font-bold text-red-700">{formatCurrency(billingSummary?.payments.totalFailed || 0)}</p></div>
                    <div className="card p-4 text-center"><p className="text-xs text-gray-500">Comisión plataforma</p><p className="text-xl font-bold text-amber-700">{formatCurrency(billingSummary?.marketplace.platformFeeAmount || 0)}</p></div>
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
            </div>
        );
    };

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
                </>
            )}
        </div>
    );
}

