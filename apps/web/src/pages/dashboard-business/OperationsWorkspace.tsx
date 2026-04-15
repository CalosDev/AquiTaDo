import { useCallback, useEffect, useMemo, useState } from 'react';
import { bookingsApi, messagingApi, whatsappApi } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/error';
import { PageFeedbackStack } from '../../components/PageFeedbackStack';
import { EmptyState, SectionCard, SummaryCard } from '../../components/ui';
import { useTimedMessage } from '../../hooks/useTimedMessage';
import { formatCurrencyDo, formatDateDo, formatDateTimeDo } from '../../lib/market';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
type TransactionStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | string;
type ConversationStatus = 'OPEN' | 'CLOSED' | 'CONVERTED';
type WhatsAppStatus = 'OPEN' | 'CLOSED' | 'ESCALATED';
type MessageSenderRole = 'CUSTOMER' | 'BUSINESS_STAFF' | 'SYSTEM';

interface PortfolioBusinessOption {
    id: string;
    name: string;
    slug?: string;
}

interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface OwnerBooking {
    id: string;
    status: BookingStatus;
    scheduledFor: string;
    partySize?: number | null;
    notes?: string | null;
    quotedAmount?: string | number | null;
    depositAmount?: string | number | null;
    currency: string;
    createdAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
        verified: boolean;
    };
    user?: {
        id: string;
        name: string;
        email: string;
        phone?: string | null;
    } | null;
    promotion?: {
        id: string;
        title: string;
        couponCode?: string | null;
        discountType?: string;
        discountValue?: string | number;
    } | null;
    transactions?: Array<{
        id: string;
        status: TransactionStatus;
        grossAmount?: string | number | null;
        netAmount?: string | number | null;
        currency?: string | null;
        createdAt: string;
    }>;
}

interface OwnerTransaction {
    id: string;
    status: TransactionStatus;
    grossAmount: string | number;
    platformFeeAmount: string | number;
    netAmount: string | number;
    currency: string;
    createdAt: string;
    paidAt?: string | null;
    booking?: {
        id: string;
        scheduledFor: string;
        status: BookingStatus;
    } | null;
    business: {
        id: string;
        name: string;
        slug: string;
    };
    buyerUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface ConversationSummary {
    id: string;
    subject?: string | null;
    status: ConversationStatus;
    lastMessageAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
        verified: boolean;
    };
    customerUser: {
        id: string;
        name: string;
        email: string;
    };
    convertedBooking?: {
        id: string;
        status: BookingStatus;
        scheduledFor: string;
    } | null;
    messages: Array<{
        id: string;
        content: string;
        senderRole: MessageSenderRole;
        senderUserId?: string | null;
        createdAt: string;
    }>;
    _count: {
        messages: number;
    };
}

interface ConversationThread {
    id: string;
    subject?: string | null;
    status: ConversationStatus;
    lastMessageAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
        verified: boolean;
    };
    customerUser: {
        id: string;
        name: string;
        email: string;
    };
    convertedBooking?: {
        id: string;
        status: BookingStatus;
        scheduledFor: string;
    } | null;
    messages: Array<{
        id: string;
        content: string;
        senderRole: MessageSenderRole;
        createdAt: string;
        senderUser?: {
            id: string;
            name: string;
            email: string;
        } | null;
    }>;
}

interface WhatsAppConversation {
    id: string;
    status: WhatsAppStatus;
    customerPhone: string;
    customerName?: string | null;
    autoResponderActive: boolean;
    lastMessageAt: string;
    business?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    messages: Array<{
        id: string;
        direction: 'INBOUND' | 'OUTBOUND';
        status: string;
        content?: string | null;
        createdAt: string;
    }>;
}

interface WhatsAppDraft {
    status: WhatsAppStatus;
    autoResponderActive: boolean;
}

interface OperationsWorkspaceProps {
    activeOrganizationId: string | null;
    businesses: PortfolioBusinessOption[];
    selectedBusinessId: string;
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

function parsePaginatedResponse<T>(value: unknown): PaginatedResponse<T> {
    const payload = (value || {}) as Partial<PaginatedResponse<T>>;
    return {
        data: asArray<T>(payload.data),
        total: Number(payload.total ?? 0),
        page: Number(payload.page ?? 1),
        limit: Number(payload.limit ?? payload.data?.length ?? 0),
        totalPages: Number(payload.totalPages ?? 1),
    };
}

function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInt(value: string): number | undefined {
    const parsed = parseOptionalNumber(value);
    if (parsed === undefined) {
        return undefined;
    }
    return Math.trunc(parsed);
}

function toIsoDateTime(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
}

function getBookingStatusTone(status: BookingStatus): string {
    switch (status) {
        case 'COMPLETED':
            return 'bg-primary-100 text-primary-700';
        case 'CONFIRMED':
            return 'bg-blue-100 text-blue-700';
        case 'CANCELED':
        case 'NO_SHOW':
            return 'bg-red-100 text-red-700';
        default:
            return 'bg-amber-100 text-amber-800';
    }
}

function getBookingStatusLabel(status: BookingStatus): string {
    switch (status) {
        case 'CONFIRMED':
            return 'Confirmada';
        case 'COMPLETED':
            return 'Completada';
        case 'CANCELED':
            return 'Cancelada';
        case 'NO_SHOW':
            return 'No asistio';
        default:
            return 'Pendiente';
    }
}

function getTransactionTone(status: string): string {
    switch (status) {
        case 'SUCCEEDED':
            return 'bg-primary-100 text-primary-700';
        case 'PENDING':
            return 'bg-amber-100 text-amber-800';
        case 'CANCELED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-red-100 text-red-700';
    }
}

function getTransactionLabel(status: string): string {
    switch (status) {
        case 'SUCCEEDED':
            return 'Cobrado';
        case 'PENDING':
            return 'Pendiente';
        case 'FAILED':
            return 'Fallido';
        case 'CANCELED':
            return 'Cancelado';
        default:
            return status;
    }
}

function getConversationTone(status: ConversationStatus): string {
    switch (status) {
        case 'CONVERTED':
            return 'bg-primary-100 text-primary-700';
        case 'CLOSED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-amber-100 text-amber-800';
    }
}

function getConversationLabel(status: ConversationStatus): string {
    switch (status) {
        case 'CLOSED':
            return 'Cerrada';
        case 'CONVERTED':
            return 'Convertida';
        default:
            return 'Abierta';
    }
}

function getMessageSenderLabel(role: MessageSenderRole): string {
    switch (role) {
        case 'BUSINESS_STAFF':
            return 'Equipo';
        case 'SYSTEM':
            return 'Sistema';
        default:
            return 'Cliente';
    }
}

function getWhatsAppTone(status: WhatsAppStatus): string {
    switch (status) {
        case 'ESCALATED':
            return 'bg-blue-100 text-blue-700';
        case 'CLOSED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-primary-100 text-primary-700';
    }
}

function getWhatsAppLabel(status: WhatsAppStatus): string {
    switch (status) {
        case 'ESCALATED':
            return 'Escalada';
        case 'CLOSED':
            return 'Cerrada';
        default:
            return 'Abierta';
    }
}

export function OperationsWorkspace({
    activeOrganizationId,
    businesses,
    selectedBusinessId,
}: OperationsWorkspaceProps) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [threadLoading, setThreadLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [actionKey, setActionKey] = useState('');

    const [bookingBusinessId, setBookingBusinessId] = useState(selectedBusinessId);
    const [bookingStatusFilter, setBookingStatusFilter] = useState<'' | BookingStatus>('');
    const [transactionStatusFilter, setTransactionStatusFilter] = useState<'' | TransactionStatus>('');
    const [bookings, setBookings] = useState<PaginatedResponse<OwnerBooking>>({
        data: [],
        total: 0,
        page: 1,
        limit: 8,
        totalPages: 1,
    });
    const [transactions, setTransactions] = useState<PaginatedResponse<OwnerTransaction>>({
        data: [],
        total: 0,
        page: 1,
        limit: 8,
        totalPages: 1,
    });
    const [selectedBookingId, setSelectedBookingId] = useState('');
    const [bookingDraft, setBookingDraft] = useState({
        status: 'PENDING' as BookingStatus,
        quotedAmount: '',
        depositAmount: '',
        notes: '',
    });

    const [conversationBusinessId, setConversationBusinessId] = useState(selectedBusinessId);
    const [conversationStatusFilter, setConversationStatusFilter] = useState<'' | ConversationStatus>('');
    const [conversationSearchInput, setConversationSearchInput] = useState('');
    const [appliedConversationSearch, setAppliedConversationSearch] = useState('');
    const [conversations, setConversations] = useState<PaginatedResponse<ConversationSummary>>({
        data: [],
        total: 0,
        page: 1,
        limit: 8,
        totalPages: 1,
    });
    const [selectedConversationId, setSelectedConversationId] = useState('');
    const [conversationThread, setConversationThread] = useState<ConversationThread | null>(null);
    const [conversationReply, setConversationReply] = useState('');
    const [conversationStatusDraft, setConversationStatusDraft] = useState<ConversationStatus>('OPEN');
    const [convertDraft, setConvertDraft] = useState({
        scheduledFor: '',
        partySize: '',
        notes: '',
        quotedAmount: '',
        depositAmount: '',
        currency: 'DOP',
    });

    const [whatsAppStatusFilter, setWhatsAppStatusFilter] = useState<'' | WhatsAppStatus>('');
    const [whatsAppConversations, setWhatsAppConversations] = useState<PaginatedResponse<WhatsAppConversation>>({
        data: [],
        total: 0,
        page: 1,
        limit: 8,
        totalPages: 1,
    });
    const [whatsAppDrafts, setWhatsAppDrafts] = useState<Record<string, WhatsAppDraft>>({});

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    useEffect(() => {
        setBookingBusinessId(selectedBusinessId);
        setConversationBusinessId(selectedBusinessId);
    }, [selectedBusinessId]);

    const selectedBooking = useMemo(
        () => bookings.data.find((booking) => booking.id === selectedBookingId) || null,
        [bookings.data, selectedBookingId],
    );
    const selectedConversationSummary = useMemo(
        () => conversations.data.find((conversation) => conversation.id === selectedConversationId) || null,
        [conversations.data, selectedConversationId],
    );
    const pendingBookingsCount = useMemo(
        () => bookings.data.filter((booking) => booking.status === 'PENDING').length,
        [bookings.data],
    );
    const pendingTransactionsCount = useMemo(
        () => transactions.data.filter((transaction) => transaction.status === 'PENDING').length,
        [transactions.data],
    );
    const openConversationCount = useMemo(
        () => conversations.data.filter((conversation) => conversation.status === 'OPEN').length,
        [conversations.data],
    );
    const activeWhatsAppCount = useMemo(
        () => whatsAppConversations.data.filter((conversation) => conversation.status === 'OPEN' || conversation.status === 'ESCALATED').length,
        [whatsAppConversations.data],
    );

    const syncBookingDraft = useCallback((booking: OwnerBooking | null) => {
        if (!booking) {
            setBookingDraft({
                status: 'PENDING',
                quotedAmount: '',
                depositAmount: '',
                notes: '',
            });
            return;
        }

        setBookingDraft({
            status: booking.status,
            quotedAmount: booking.quotedAmount != null ? String(booking.quotedAmount) : '',
            depositAmount: booking.depositAmount != null ? String(booking.depositAmount) : '',
            notes: booking.notes || '',
        });
    }, []);

    useEffect(() => {
        syncBookingDraft(selectedBooking);
    }, [selectedBooking, syncBookingDraft]);

    const loadBookingsArea = useCallback(async () => {
        if (!activeOrganizationId) {
            setBookings({ data: [], total: 0, page: 1, limit: 8, totalPages: 1 });
            setTransactions({ data: [], total: 0, page: 1, limit: 8, totalPages: 1 });
            setSelectedBookingId('');
            return;
        }

        const bookingParams: Record<string, string | number | boolean> = {
            limit: 8,
        };
        if (bookingBusinessId) {
            bookingParams.businessId = bookingBusinessId;
        }
        if (bookingStatusFilter) {
            bookingParams.status = bookingStatusFilter;
        }

        const transactionParams: Record<string, string | number | boolean> = {
            limit: 8,
        };
        if (bookingBusinessId) {
            transactionParams.businessId = bookingBusinessId;
        }
        if (transactionStatusFilter) {
            transactionParams.status = transactionStatusFilter;
        }

        const [bookingsResponse, transactionsResponse] = await Promise.all([
            bookingsApi.getMineAsOrganization(bookingParams),
            bookingsApi.getTransactionsMyOrganization(transactionParams),
        ]);

        const nextBookings = parsePaginatedResponse<OwnerBooking>(bookingsResponse.data);
        const nextTransactions = parsePaginatedResponse<OwnerTransaction>(transactionsResponse.data);

        setBookings(nextBookings);
        setTransactions(nextTransactions);
        setSelectedBookingId((current) => {
            if (current && nextBookings.data.some((booking) => booking.id === current)) {
                return current;
            }
            return nextBookings.data[0]?.id || '';
        });
    }, [
        activeOrganizationId,
        bookingBusinessId,
        bookingStatusFilter,
        transactionStatusFilter,
    ]);

    const loadConversationsArea = useCallback(async () => {
        if (!activeOrganizationId) {
            setConversations({ data: [], total: 0, page: 1, limit: 8, totalPages: 1 });
            setSelectedConversationId('');
            setConversationThread(null);
            return;
        }

        const conversationParams: Record<string, string | number | boolean> = {
            limit: 8,
        };
        if (conversationBusinessId) {
            conversationParams.businessId = conversationBusinessId;
        }
        if (conversationStatusFilter) {
            conversationParams.status = conversationStatusFilter;
        }
        if (appliedConversationSearch) {
            conversationParams.search = appliedConversationSearch;
        }

        const response = await messagingApi.getOrgConversations(conversationParams);

        const nextConversations = parsePaginatedResponse<ConversationSummary>(response.data);
        setConversations(nextConversations);
        setSelectedConversationId((current) => {
            if (current && nextConversations.data.some((conversation) => conversation.id === current)) {
                return current;
            }
            return nextConversations.data[0]?.id || '';
        });
    }, [
        activeOrganizationId,
        appliedConversationSearch,
        conversationBusinessId,
        conversationStatusFilter,
    ]);

    const loadWhatsAppArea = useCallback(async () => {
        if (!activeOrganizationId) {
            setWhatsAppConversations({ data: [], total: 0, page: 1, limit: 8, totalPages: 1 });
            setWhatsAppDrafts({});
            return;
        }

        const whatsAppParams: Record<string, string | number | boolean> = {
            limit: 8,
        };
        if (whatsAppStatusFilter) {
            whatsAppParams.status = whatsAppStatusFilter;
        }

        const response = await whatsappApi.getMyConversations(whatsAppParams);
        const nextWhatsApp = parsePaginatedResponse<WhatsAppConversation>(response.data);
        setWhatsAppConversations(nextWhatsApp);
        setWhatsAppDrafts(
            nextWhatsApp.data.reduce<Record<string, WhatsAppDraft>>((accumulator, conversation) => {
                accumulator[conversation.id] = {
                    status: conversation.status,
                    autoResponderActive: conversation.autoResponderActive,
                };
                return accumulator;
            }, {}),
        );
    }, [activeOrganizationId, whatsAppStatusFilter]);

    const refreshAll = useCallback(async (options?: { silent?: boolean }) => {
        if (options?.silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            await Promise.all([
                loadBookingsArea(),
                loadConversationsArea(),
                loadWhatsAppArea(),
            ]);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la operacion comercial del panel'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [loadBookingsArea, loadConversationsArea, loadWhatsAppArea]);

    useEffect(() => {
        void refreshAll();
    }, [refreshAll]);

    const loadConversationThread = useCallback(async (conversationId: string) => {
        if (!conversationId) {
            setConversationThread(null);
            return;
        }

        setThreadLoading(true);
        try {
            const response = await messagingApi.getOrgConversationThread(conversationId);
            const thread = (response.data || null) as ConversationThread | null;
            setConversationThread(thread);
            setConversationStatusDraft(thread?.status || 'OPEN');
        } catch (error) {
            setConversationThread(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el hilo de la conversacion'));
        } finally {
            setThreadLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadConversationThread(selectedConversationId);
    }, [loadConversationThread, selectedConversationId]);

    const handleUpdateBooking = async () => {
        if (!selectedBookingId) {
            setErrorMessage('Selecciona una reserva antes de aplicar cambios');
            return;
        }

        setActionKey(`booking:${selectedBookingId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await bookingsApi.updateStatus(selectedBookingId, {
                status: bookingDraft.status,
                quotedAmount: parseOptionalNumber(bookingDraft.quotedAmount),
                depositAmount: parseOptionalNumber(bookingDraft.depositAmount),
                notes: bookingDraft.notes.trim() || undefined,
            });
            setSuccessMessage('Reserva actualizada correctamente');
            await loadBookingsArea();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la reserva'));
        } finally {
            setActionKey('');
        }
    };

    const handleSendConversationReply = async () => {
        if (!selectedConversationId) {
            setErrorMessage('Selecciona una conversacion antes de responder');
            return;
        }

        if (!conversationReply.trim()) {
            setErrorMessage('Escribe un mensaje antes de enviarlo');
            return;
        }

        setActionKey(`reply:${selectedConversationId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const response = await messagingApi.sendMessageAsOrg(selectedConversationId, {
                content: conversationReply.trim(),
            });
            setConversationThread((response.data || null) as ConversationThread | null);
            setConversationReply('');
            setSuccessMessage('Mensaje enviado');
            await loadConversationsArea();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar la respuesta'));
        } finally {
            setActionKey('');
        }
    };

    const handleUpdateConversationStatus = async () => {
        if (!selectedConversationId) {
            setErrorMessage('Selecciona una conversacion antes de cambiar su estado');
            return;
        }

        setActionKey(`conversation-status:${selectedConversationId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const response = await messagingApi.updateConversationStatus(selectedConversationId, {
                status: conversationStatusDraft,
            });
            setConversationThread((response.data || null) as ConversationThread | null);
            setSuccessMessage('Estado de la conversacion actualizado');
            await loadConversationsArea();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el estado de la conversacion'));
        } finally {
            setActionKey('');
        }
    };

    const handleConvertConversationToBooking = async () => {
        if (!selectedConversationId) {
            setErrorMessage('Selecciona una conversacion antes de convertirla');
            return;
        }

        const scheduledFor = toIsoDateTime(convertDraft.scheduledFor);
        if (!scheduledFor) {
            setErrorMessage('Ingresa una fecha valida y futura para la reserva');
            return;
        }

        setActionKey(`convert:${selectedConversationId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const response = await messagingApi.convertConversationToBooking(selectedConversationId, {
                scheduledFor,
                partySize: parseOptionalInt(convertDraft.partySize),
                notes: convertDraft.notes.trim() || undefined,
                quotedAmount: parseOptionalNumber(convertDraft.quotedAmount),
                depositAmount: parseOptionalNumber(convertDraft.depositAmount),
                currency: convertDraft.currency.trim() || 'DOP',
            });
            const booking = (response.data || null) as { id?: string } | null;

            setSuccessMessage('Conversacion convertida a reserva');
            setSelectedBookingId(booking?.id || '');
            await Promise.all([
                loadBookingsArea(),
                loadConversationsArea(),
            ]);
            await loadConversationThread(selectedConversationId);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo convertir la conversacion en reserva'));
        } finally {
            setActionKey('');
        }
    };

    const handleUpdateWhatsAppConversation = async (conversationId: string) => {
        const draft = whatsAppDrafts[conversationId];
        if (!draft) {
            return;
        }

        setActionKey(`whatsapp:${conversationId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await whatsappApi.updateConversationStatus(conversationId, draft);
            setSuccessMessage('Conversacion de WhatsApp actualizada');
            await loadWhatsAppArea();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la conversacion de WhatsApp'));
        } finally {
            setActionKey('');
        }
    };

    if (loading) {
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
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.4fr)]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="h-5 w-44 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-4 h-56 rounded-3xl bg-slate-50 animate-pulse" />
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-5">
                        <div className="h-5 w-44 rounded-full bg-slate-100 animate-pulse" />
                        <div className="mt-4 h-56 rounded-3xl bg-slate-50 animate-pulse" />
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="section-shell p-6 space-y-6">
            <PageFeedbackStack
                items={[
                    { id: 'operations-error', tone: 'danger', text: errorMessage },
                    { id: 'operations-success', tone: 'success', text: successMessage },
                ]}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Operacion comercial</p>
                    <h2 className="font-display text-xl font-bold text-slate-900">Reservas, inbox y WhatsApp</h2>
                    <p className="mt-2 text-sm text-slate-600">
                        Gestiona la demanda que entra por AquiTa.do y responde sin salir del panel.
                    </p>
                </div>
                <button
                    type="button"
                    className="btn-secondary text-sm"
                    onClick={() => void refreshAll({ silent: true })}
                    disabled={refreshing}
                >
                    {refreshing ? 'Actualizando...' : 'Actualizar operaciones'}
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    label="Reservas en cola"
                    value={pendingBookingsCount}
                    delta={`${bookings.total} en el filtro activo`}
                />
                <SummaryCard
                    label="Transacciones pendientes"
                    value={pendingTransactionsCount}
                    delta={`${transactions.total} movimientos observados`}
                />
                <SummaryCard
                    label="Inbox abierto"
                    value={openConversationCount}
                    delta={`${conversations.total} conversaciones activas`}
                />
                <SummaryCard
                    label="WhatsApp activo"
                    value={activeWhatsAppCount}
                    delta={`${whatsAppConversations.total} hilos sincronizados`}
                />
            </div>

            <div className="flex flex-wrap gap-2.5">
                {selectedConversationSummary ? (
                    <span className={`chip ${getConversationTone(selectedConversationSummary.status)}`}>
                        Conversacion activa: {getConversationLabel(selectedConversationSummary.status)}
                    </span>
                ) : null}
                {selectedBooking ? (
                    <span className={`chip ${getBookingStatusTone(selectedBooking.status)}`}>
                        Reserva seleccionada: {getBookingStatusLabel(selectedBooking.status)}
                    </span>
                ) : null}
                {selectedConversationSummary?.convertedBooking ? (
                    <span className="chip">
                        Lead convertido a reserva
                    </span>
                ) : null}
                {refreshing ? (
                    <span className="chip">Sincronizando cambios...</span>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
                <SectionCard
                    title="Reservas recientes"
                    description="Filtros arriba, cola a la izquierda y edicion rapida al lado para no mezclar roles."
                    density="compact"
                >
                    <div className="card-filter density-compact mb-4">
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                            <select
                                className="input-field min-w-[11rem]"
                                value={bookingBusinessId}
                                onChange={(event) => setBookingBusinessId(event.target.value)}
                            >
                                <option value="">Todo el portafolio</option>
                                {businesses.map((business) => (
                                    <option key={business.id} value={business.id}>{business.name}</option>
                                ))}
                            </select>
                            <select
                                className="input-field min-w-[10rem]"
                                value={bookingStatusFilter}
                                onChange={(event) => setBookingStatusFilter(event.target.value as '' | BookingStatus)}
                            >
                                <option value="">Todos los estados</option>
                                <option value="PENDING">Pendiente</option>
                                <option value="CONFIRMED">Confirmada</option>
                                <option value="COMPLETED">Completada</option>
                                <option value="CANCELED">Cancelada</option>
                                <option value="NO_SHOW">No asistio</option>
                            </select>
                            <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={() => void loadBookingsArea()}
                            >
                                Aplicar
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                        {bookings.data.length > 0 ? (
                            <div className="card-list">
                                <div className="card-list__header">
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cola de reservas</p>
                                    <p className="text-xs text-slate-500">{bookings.total} en el filtro</p>
                                </div>
                                {bookings.data.map((booking) => (
                                    <button
                                        key={booking.id}
                                        type="button"
                                        className={`card-list__item w-full flex-col items-start text-left ${
                                            booking.id === selectedBookingId ? 'card-list__item--active' : ''
                                        }`}
                                        onClick={() => setSelectedBookingId(booking.id)}
                                    >
                                        <div className="flex w-full items-start justify-between gap-3">
                                            <div>
                                                <p className="font-medium text-slate-900">{booking.business.name}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {booking.user?.name || 'Cliente'} - {formatDateTimeDo(booking.scheduledFor)}
                                                </p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingStatusTone(booking.status)}`}>
                                                {getBookingStatusLabel(booking.status)}
                                            </span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                                            <span className="rounded-full bg-white px-2.5 py-1">
                                                Cotizado: {formatCurrencyDo(booking.quotedAmount ?? 0, booking.currency)}
                                            </span>
                                            <span className="rounded-full bg-white px-2.5 py-1">
                                                Deposito: {formatCurrencyDo(booking.depositAmount ?? 0, booking.currency)}
                                            </span>
                                            {booking.partySize ? (
                                                <span className="rounded-full bg-white px-2.5 py-1">
                                                    Party: {booking.partySize}
                                                </span>
                                            ) : null}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                title="Sin reservas en este filtro"
                                body="Ajusta negocio o estado para volver a poblar la cola operativa."
                            />
                        )}

                        <div className="card-form density-compact space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Edicion rapida de reserva</p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                        {selectedBooking
                                            ? `${selectedBooking.business.name} - ${selectedBooking.user?.name || 'Cliente'}`
                                            : 'Selecciona una reserva para editarla sin perder el contexto de la cola.'}
                                    </p>
                                </div>
                                {selectedBooking ? (
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingStatusTone(selectedBooking.status)}`}>
                                        {getBookingStatusLabel(selectedBooking.status)}
                                    </span>
                                ) : null}
                            </div>

                            {selectedBooking ? (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <select
                                        className="input-field"
                                        value={bookingDraft.status}
                                        onChange={(event) => setBookingDraft((current) => ({
                                            ...current,
                                            status: event.target.value as BookingStatus,
                                        }))}
                                    >
                                        <option value="PENDING">Pendiente</option>
                                        <option value="CONFIRMED">Confirmada</option>
                                        <option value="COMPLETED">Completada</option>
                                        <option value="CANCELED">Cancelada</option>
                                        <option value="NO_SHOW">No asistio</option>
                                    </select>
                                    <input
                                        className="input-field"
                                        inputMode="decimal"
                                        placeholder="Monto cotizado"
                                        value={bookingDraft.quotedAmount}
                                        onChange={(event) => setBookingDraft((current) => ({
                                            ...current,
                                            quotedAmount: event.target.value,
                                        }))}
                                    />
                                    <input
                                        className="input-field"
                                        inputMode="decimal"
                                        placeholder="Deposito"
                                        value={bookingDraft.depositAmount}
                                        onChange={(event) => setBookingDraft((current) => ({
                                            ...current,
                                            depositAmount: event.target.value,
                                        }))}
                                    />
                                    <textarea
                                        className="input-field md:col-span-2"
                                        rows={3}
                                        placeholder="Notas internas o para la reserva"
                                        value={bookingDraft.notes}
                                        onChange={(event) => setBookingDraft((current) => ({
                                            ...current,
                                            notes: event.target.value,
                                        }))}
                                    />
                                    <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                                        <button
                                            type="button"
                                            className="btn-primary text-sm"
                                            onClick={() => void handleUpdateBooking()}
                                            disabled={actionKey === `booking:${selectedBooking.id}`}
                                        >
                                            {actionKey === `booking:${selectedBooking.id}` ? 'Guardando...' : 'Guardar reserva'}
                                        </button>
                                        <p className="text-sm text-slate-500">
                                            Programada para {formatDateTimeDo(selectedBooking.scheduledFor)}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <EmptyState
                                    title="Sin reserva seleccionada"
                                    body="Selecciona un item de la cola para editar estado, monto o notas."
                                />
                            )}
                        </div>
                    </div>
                </SectionCard>

                <SectionCard
                    title="Transacciones de reservas"
                    description="Visibilidad rapida del flujo cobrado, pendiente o fallido."
                    density="compact"
                    actions={(
                        <select
                            className="input-field min-w-[10rem]"
                            value={transactionStatusFilter}
                            onChange={(event) => setTransactionStatusFilter(event.target.value as '' | TransactionStatus)}
                        >
                            <option value="">Todos los estados</option>
                            <option value="PENDING">Pendiente</option>
                            <option value="SUCCEEDED">Cobrado</option>
                            <option value="FAILED">Fallido</option>
                            <option value="CANCELED">Cancelado</option>
                        </select>
                    )}
                >
                    {transactions.data.length > 0 ? (
                        <div className="card-list">
                            <div className="card-list__header">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Flujo financiero</p>
                                <p className="text-xs text-slate-500">{transactions.total} movimientos</p>
                            </div>
                            {transactions.data.map((transaction) => (
                                <div key={transaction.id} className="card-list__item items-start justify-between">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-slate-900">{transaction.business.name}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {transaction.buyerUser?.name || 'Cliente'} - {formatDateTimeDo(transaction.createdAt)}
                                        </p>
                                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-3">
                                            <p>Bruto: {formatCurrencyDo(transaction.grossAmount, transaction.currency)}</p>
                                            <p>Fee: {formatCurrencyDo(transaction.platformFeeAmount, transaction.currency)}</p>
                                            <p>Neto: {formatCurrencyDo(transaction.netAmount, transaction.currency)}</p>
                                        </div>
                                        {transaction.booking ? (
                                            <p className="mt-2 text-xs text-slate-500">
                                                Reserva: {getBookingStatusLabel(transaction.booking.status)} - {formatDateDo(transaction.booking.scheduledFor)}
                                            </p>
                                        ) : null}
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getTransactionTone(transaction.status)}`}>
                                        {getTransactionLabel(transaction.status)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            title="Sin transacciones en este filtro"
                            body="Cuando haya cobros o intentos de pago, apareceran aqui con su estado."
                        />
                    )}
                </SectionCard>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.4fr)]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="font-display text-lg font-semibold text-slate-900">Inbox AquiTa.do</h3>
                            <p className="mt-1 text-sm text-slate-600">
                                Responde conversaciones, cambia estados y convierte leads en reservas.
                            </p>
                        </div>
                    </div>

                    <div className="card-filter density-compact">
                        <div className="grid grid-cols-1 gap-3">
                            <select
                                className="input-field"
                                value={conversationBusinessId}
                                onChange={(event) => setConversationBusinessId(event.target.value)}
                            >
                                <option value="">Todo el portafolio</option>
                                {businesses.map((business) => (
                                    <option key={business.id} value={business.id}>{business.name}</option>
                                ))}
                            </select>
                            <select
                                className="input-field"
                                value={conversationStatusFilter}
                                onChange={(event) => setConversationStatusFilter(event.target.value as '' | ConversationStatus)}
                            >
                                <option value="">Todos los estados</option>
                                <option value="OPEN">Abierta</option>
                                <option value="CLOSED">Cerrada</option>
                                <option value="CONVERTED">Convertida</option>
                            </select>
                            <div className="flex gap-2">
                                <input
                                    className="input-field"
                                    placeholder="Buscar por asunto, negocio o cliente"
                                    value={conversationSearchInput}
                                    onChange={(event) => setConversationSearchInput(event.target.value)}
                                />
                                <button
                                    type="button"
                                    className="btn-secondary text-sm"
                                    onClick={() => {
                                        setAppliedConversationSearch(conversationSearchInput.trim());
                                    }}
                                >
                                    Buscar
                                </button>
                            </div>
                        </div>
                    </div>

                    {conversations.data.length > 0 ? (
                        <div className="card-list">
                            <div className="card-list__header">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Cola de conversaciones</p>
                                <p className="text-xs text-slate-500">{conversations.total} conversaciones</p>
                            </div>
                            {conversations.data.map((conversation) => {
                                const lastMessage = conversation.messages[0];
                                return (
                                    <button
                                        key={conversation.id}
                                        type="button"
                                        className={`card-list__item w-full flex-col items-start text-left ${
                                            conversation.id === selectedConversationId ? 'card-list__item--active' : ''
                                        }`}
                                        onClick={() => setSelectedConversationId(conversation.id)}
                                    >
                                        <div className="flex w-full items-start justify-between gap-3">
                                            <div>
                                                <p className="font-medium text-slate-900">{conversation.business.name}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {conversation.customerUser.name} - {formatDateTimeDo(conversation.lastMessageAt)}
                                                </p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getConversationTone(conversation.status)}`}>
                                                {getConversationLabel(conversation.status)}
                                            </span>
                                        </div>
                                        <p className="mt-3 line-clamp-2 text-sm text-slate-700">
                                            {lastMessage?.content || 'Sin mensajes visibles'}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                                            <span className="rounded-full bg-white px-2.5 py-1">
                                                {conversation._count.messages} mensajes
                                            </span>
                                            {conversation.convertedBooking ? (
                                                <span className="rounded-full bg-white px-2.5 py-1">
                                                    Reserva {conversation.convertedBooking.status}
                                                </span>
                                            ) : null}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            title="Sin conversaciones en este filtro"
                            body="Cuando entre nueva demanda por AquiTa.do, aparecera aqui como una cola operativa."
                        />
                    )}
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="font-display text-lg font-semibold text-slate-900">Hilo seleccionado</h3>
                            <p className="mt-1 text-sm text-slate-600">
                                Mantiene respuesta operativa y conversion inmediata a reserva.
                            </p>
                        </div>
                        {conversationThread ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getConversationTone(conversationThread.status)}`}>
                                {getConversationLabel(conversationThread.status)}
                            </span>
                        ) : null}
                    </div>

                    {threadLoading ? (
                        <div className="space-y-3">
                            <div className="h-5 w-40 rounded-full bg-slate-100 animate-pulse" />
                            <div className="h-40 rounded-3xl bg-slate-50 animate-pulse" />
                        </div>
                    ) : conversationThread ? (
                        <>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900">{conversationThread.business.name}</p>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {conversationThread.customerUser.name} - {conversationThread.customerUser.email}
                                        </p>
                                    </div>
                                    {conversationThread.convertedBooking ? (
                                        <span className="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-semibold text-primary-700">
                                            Booking {conversationThread.convertedBooking.status}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-3 text-sm text-slate-700">
                                    {conversationThread.subject || 'Sin asunto'}
                                </p>
                            </div>

                            <div className="card-list max-h-[22rem] overflow-y-auto pr-1">
                                {conversationThread.messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`card-list__item flex-col items-start ${
                                            message.senderRole === 'CUSTOMER'
                                                ? 'bg-slate-50/70'
                                                : message.senderRole === 'SYSTEM'
                                                    ? 'bg-blue-50/60'
                                                    : 'bg-primary-50/60'
                                        }`}
                                    >
                                        <div className="flex w-full flex-wrap items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-slate-900">
                                                {getMessageSenderLabel(message.senderRole)}
                                                {message.senderUser?.name ? ` - ${message.senderUser.name}` : ''}
                                            </p>
                                            <p className="text-xs text-slate-500">{formatDateTimeDo(message.createdAt)}</p>
                                        </div>
                                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{message.content}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                                    <h4 className="font-medium text-slate-900">Responder y gestionar</h4>
                                    <textarea
                                        className="input-field"
                                        rows={4}
                                        placeholder="Escribe una respuesta para el cliente"
                                        value={conversationReply}
                                        onChange={(event) => setConversationReply(event.target.value)}
                                        disabled={conversationThread.status === 'CLOSED'}
                                    />
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className="btn-primary text-sm"
                                            onClick={() => void handleSendConversationReply()}
                                            disabled={conversationThread.status === 'CLOSED' || actionKey === `reply:${conversationThread.id}`}
                                        >
                                            {actionKey === `reply:${conversationThread.id}` ? 'Enviando...' : 'Enviar respuesta'}
                                        </button>
                                        <select
                                            className="input-field min-w-[10rem]"
                                            value={conversationStatusDraft}
                                            onChange={(event) => setConversationStatusDraft(event.target.value as ConversationStatus)}
                                        >
                                            <option value="OPEN">Abierta</option>
                                            <option value="CLOSED">Cerrada</option>
                                            {conversationThread.convertedBooking ? <option value="CONVERTED">Convertida</option> : null}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleUpdateConversationStatus()}
                                            disabled={actionKey === `conversation-status:${conversationThread.id}`}
                                        >
                                            {actionKey === `conversation-status:${conversationThread.id}` ? 'Guardando...' : 'Guardar estado'}
                                        </button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                                    <h4 className="font-medium text-slate-900">Convertir a reserva</h4>
                                    {conversationThread.convertedBooking ? (
                                        <p className="rounded-2xl border border-primary-100 bg-primary-50 px-3 py-3 text-sm text-primary-700">
                                            Esta conversacion ya genero la reserva {conversationThread.convertedBooking.id.slice(0, 8)} para el {formatDateTimeDo(conversationThread.convertedBooking.scheduledFor)}.
                                        </p>
                                    ) : (
                                        <>
                                            <input
                                                type="datetime-local"
                                                className="input-field"
                                                value={convertDraft.scheduledFor}
                                                onChange={(event) => setConvertDraft((current) => ({
                                                    ...current,
                                                    scheduledFor: event.target.value,
                                                }))}
                                            />
                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <input
                                                    className="input-field"
                                                    inputMode="numeric"
                                                    placeholder="Party size"
                                                    value={convertDraft.partySize}
                                                    onChange={(event) => setConvertDraft((current) => ({
                                                        ...current,
                                                        partySize: event.target.value,
                                                    }))}
                                                />
                                                <input
                                                    className="input-field"
                                                    placeholder="Moneda"
                                                    value={convertDraft.currency}
                                                    onChange={(event) => setConvertDraft((current) => ({
                                                        ...current,
                                                        currency: event.target.value.toUpperCase(),
                                                    }))}
                                                />
                                                <input
                                                    className="input-field"
                                                    inputMode="decimal"
                                                    placeholder="Monto cotizado"
                                                    value={convertDraft.quotedAmount}
                                                    onChange={(event) => setConvertDraft((current) => ({
                                                        ...current,
                                                        quotedAmount: event.target.value,
                                                    }))}
                                                />
                                                <input
                                                    className="input-field"
                                                    inputMode="decimal"
                                                    placeholder="Deposito"
                                                    value={convertDraft.depositAmount}
                                                    onChange={(event) => setConvertDraft((current) => ({
                                                        ...current,
                                                        depositAmount: event.target.value,
                                                    }))}
                                                />
                                            </div>
                                            <textarea
                                                className="input-field"
                                                rows={3}
                                                placeholder="Notas para la reserva"
                                                value={convertDraft.notes}
                                                onChange={(event) => setConvertDraft((current) => ({
                                                    ...current,
                                                    notes: event.target.value,
                                                }))}
                                            />
                                            <button
                                                type="button"
                                                className="btn-secondary text-sm"
                                                onClick={() => void handleConvertConversationToBooking()}
                                                disabled={actionKey === `convert:${conversationThread.id}`}
                                            >
                                                {actionKey === `convert:${conversationThread.id}` ? 'Convirtiendo...' : 'Crear reserva desde conversacion'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <EmptyState
                            title="Sin hilo seleccionado"
                            body="Selecciona una conversacion de la cola para responder, cambiar estado o convertirla en reserva."
                        />
                    )}
                </article>
            </div>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="font-display text-lg font-semibold text-slate-900">Conversaciones de WhatsApp</h3>
                        <p className="mt-1 text-sm text-slate-600">
                            Supervisa el canal entrante, controla escalamiento y auto-respuesta.
                        </p>
                    </div>
                    <div className="card-filter density-compact">
                        <div className="flex flex-wrap gap-2">
                            <select
                                className="input-field min-w-[10rem]"
                                value={whatsAppStatusFilter}
                                onChange={(event) => setWhatsAppStatusFilter(event.target.value as '' | WhatsAppStatus)}
                            >
                                <option value="">Todos los estados</option>
                                <option value="OPEN">Abierta</option>
                                <option value="ESCALATED">Escalada</option>
                                <option value="CLOSED">Cerrada</option>
                            </select>
                            <button
                                type="button"
                                className="btn-secondary text-sm"
                                onClick={() => void loadWhatsAppArea()}
                            >
                                Aplicar
                            </button>
                        </div>
                    </div>
                </div>

                {whatsAppConversations.data.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {whatsAppConversations.data.map((conversation) => {
                            const draft = whatsAppDrafts[conversation.id] || {
                                status: conversation.status,
                                autoResponderActive: conversation.autoResponderActive,
                            };
                            const lastMessage = conversation.messages[0];

                            return (
                                <div key={conversation.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-medium text-slate-900">
                                                {conversation.customerName || conversation.customerPhone}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {conversation.business?.name || 'Negocio sin contexto'} - {formatDateTimeDo(conversation.lastMessageAt)}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getWhatsAppTone(conversation.status)}`}>
                                            {getWhatsAppLabel(conversation.status)}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm text-slate-700">
                                        {lastMessage?.content || 'Sin ultimo mensaje visible'}
                                    </p>
                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <select
                                            className="input-field"
                                            value={draft.status}
                                            onChange={(event) => setWhatsAppDrafts((current) => ({
                                                ...current,
                                                [conversation.id]: {
                                                    ...draft,
                                                    status: event.target.value as WhatsAppStatus,
                                                },
                                            }))}
                                        >
                                            <option value="OPEN">Abierta</option>
                                            <option value="ESCALATED">Escalada</option>
                                            <option value="CLOSED">Cerrada</option>
                                        </select>
                                        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={draft.autoResponderActive}
                                                onChange={(event) => setWhatsAppDrafts((current) => ({
                                                    ...current,
                                                    [conversation.id]: {
                                                        ...draft,
                                                        autoResponderActive: event.target.checked,
                                                    },
                                                }))}
                                            />
                                            Auto responder activo
                                        </label>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleUpdateWhatsAppConversation(conversation.id)}
                                            disabled={actionKey === `whatsapp:${conversation.id}`}
                                        >
                                            {actionKey === `whatsapp:${conversation.id}` ? 'Guardando...' : 'Guardar WhatsApp'}
                                        </button>
                                        <span className="text-sm text-slate-500">{conversation.customerPhone}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState
                        title="Sin conversaciones de WhatsApp"
                        body="Cuando el canal tenga actividad, veras aqui el estado, el ultimo mensaje y sus controles."
                    />
                )}
            </article>
        </section>
    );
}
