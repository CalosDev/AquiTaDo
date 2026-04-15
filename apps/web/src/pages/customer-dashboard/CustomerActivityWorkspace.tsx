import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { bookingsApi, checkinsApi, messagingApi, paymentsApi } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/error';
import { PageFeedbackStack } from '../../components/PageFeedbackStack';
import { useTimedMessage } from '../../hooks/useTimedMessage';
import { formatCurrencyDo, formatDateTimeDo, formatNumberDo } from '../../lib/market';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
type ConversationStatus = 'OPEN' | 'CLOSED' | 'CONVERTED';
type MessageSenderRole = 'CUSTOMER' | 'BUSINESS_STAFF' | 'SYSTEM';
type LoyaltyTier = 'NUEVO' | 'EXPLORADOR' | 'LOCAL_PRO' | 'EMBAJADOR';

interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface UserBooking {
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
    promotion?: {
        id: string;
        title: string;
        couponCode?: string | null;
    } | null;
    transactions?: Array<{
        id: string;
        status: string;
        grossAmount?: string | number | null;
        createdAt: string;
    }>;
}

interface UserCheckin {
    id: string;
    createdAt: string;
    verifiedLocation: boolean;
    pointsAwarded: number;
    streakApplied: number;
    distanceMeters?: number | null;
    business: {
        id: string;
        name: string;
        slug: string;
        address?: string | null;
        province?: {
            id: string;
            name: string;
            slug: string;
        } | null;
        city?: {
            id: string;
            name: string;
        } | null;
    };
}

interface CheckinSummary {
    loyaltyPoints: number;
    checkinCount: number;
    checkinStreak: number;
    lastCheckinAt?: string | null;
    loyaltyTier: LoyaltyTier;
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
        totalPages: Number(payload.totalPages ?? 0),
    };
}

function getBookingTone(status: BookingStatus): string {
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

function getBookingLabel(status: BookingStatus): string {
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
        case 'CONVERTED':
            return 'Convertida';
        case 'CLOSED':
            return 'Cerrada';
        default:
            return 'Abierta';
    }
}

function getSenderLabel(role: MessageSenderRole): string {
    switch (role) {
        case 'BUSINESS_STAFF':
            return 'Equipo';
        case 'SYSTEM':
            return 'Sistema';
        default:
            return 'Tu';
    }
}

function getTierTone(tier: LoyaltyTier): string {
    switch (tier) {
        case 'EMBAJADOR':
            return 'bg-primary-100 text-primary-700';
        case 'LOCAL_PRO':
            return 'bg-blue-100 text-blue-700';
        case 'EXPLORADOR':
            return 'bg-amber-100 text-amber-800';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

function buildReturnUrl(): string {
    if (typeof window === 'undefined') {
        return 'http://localhost:5173/app/customer';
    }

    const url = new URL(window.location.href);
    url.hash = '';
    return url.toString();
}

export function CustomerActivityWorkspace() {
    const [loading, setLoading] = useState(true);
    const [threadLoading, setThreadLoading] = useState(false);
    const [actionKey, setActionKey] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [bookings, setBookings] = useState<PaginatedResponse<UserBooking>>({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
    });
    const [checkins, setCheckins] = useState<PaginatedResponse<UserCheckin>>({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
    });
    const [checkinSummary, setCheckinSummary] = useState<CheckinSummary | null>(null);
    const [conversations, setConversations] = useState<PaginatedResponse<ConversationSummary>>({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
    });
    const [selectedConversationId, setSelectedConversationId] = useState('');
    const [conversationThread, setConversationThread] = useState<ConversationThread | null>(null);
    const [replyDraft, setReplyDraft] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const loadCustomerActivity = useCallback(async () => {
        setLoading(true);
        try {
            const [
                bookingsResponse,
                checkinsResponse,
                conversationsResponse,
            ] = await Promise.all([
                bookingsApi.getMineAsUser({ limit: 6 }),
                checkinsApi.getMine({ limit: 6 }),
                messagingApi.getMyConversations({ limit: 8 }),
            ]);

            setBookings(parsePaginatedResponse<UserBooking>(bookingsResponse.data));
            setCheckins(parsePaginatedResponse<UserCheckin>(checkinsResponse.data));
            setCheckinSummary(((checkinsResponse.data as { summary?: CheckinSummary } | undefined)?.summary || null) as CheckinSummary | null);
            setConversations(parsePaginatedResponse<ConversationSummary>(conversationsResponse.data));
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar tu actividad reciente'));
        } finally {
            setLoading(false);
        }
    }, []);

    const loadThread = useCallback(async () => {
        if (!selectedConversationId) {
            setConversationThread(null);
            setThreadLoading(false);
            return;
        }

        setThreadLoading(true);
        try {
            const response = await messagingApi.getMyConversationThread(selectedConversationId);
            setConversationThread((response.data || null) as ConversationThread | null);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la conversacion'));
        } finally {
            setThreadLoading(false);
        }
    }, [selectedConversationId]);

    useEffect(() => {
        void loadCustomerActivity();
    }, [loadCustomerActivity]);

    useEffect(() => {
        if (!loading && conversations.data.length > 0) {
            const exists = conversations.data.some((conversation) => conversation.id === selectedConversationId);
            if (!exists) {
                setSelectedConversationId(conversations.data[0]?.id || '');
            }
            return;
        }

        if (!loading && conversations.data.length === 0) {
            setSelectedConversationId('');
            setConversationThread(null);
        }
    }, [conversations.data, loading, selectedConversationId]);

    useEffect(() => {
        void loadThread();
    }, [loadThread]);

    const handleSendReply = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedConversationId || !replyDraft.trim()) {
            return;
        }

        setActionKey('customer-reply');
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await messagingApi.sendMessageAsCustomer(selectedConversationId, {
                content: replyDraft.trim(),
            });
            setReplyDraft('');
            await Promise.all([
                loadCustomerActivity(),
                loadThread(),
            ]);
            setSuccessMessage('Mensaje enviado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo enviar el mensaje'));
        } finally {
            setActionKey('');
        }
    };

    const handleBookingCheckout = async (bookingId: string) => {
        setActionKey(`booking-checkout-${bookingId}`);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const returnUrl = buildReturnUrl();
            const response = await paymentsApi.createBookingCheckoutSession(bookingId, {
                successUrl: returnUrl,
                cancelUrl: returnUrl,
            });
            const payload = (response.data || {}) as { checkoutUrl?: string; url?: string };
            const checkoutUrl = payload.checkoutUrl || payload.url;
            if (!checkoutUrl) {
                throw new Error('No se recibio URL de checkout');
            }

            window.location.href = checkoutUrl;
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo iniciar el pago de la reserva'));
            setActionKey('');
        }
    };

    const completedBookings = useMemo(
        () => bookings.data.filter((booking) => booking.status === 'COMPLETED').length,
        [bookings.data],
    );

    if (loading) {
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
            </section>
        );
    }

    return (
        <section className="section-shell p-6 space-y-6">
            <PageFeedbackStack
                items={[
                    { id: 'customer-activity-error', tone: 'danger', text: errorMessage },
                    { id: 'customer-activity-success', tone: 'info', text: successMessage },
                ]}
            />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Tu actividad</p>
                    <h2 className="font-display text-2xl font-bold text-slate-900">Reservas, check-ins e inbox</h2>
                    <p className="max-w-3xl text-sm text-slate-600">
                        Sigue tus experiencias recientes, tu progreso de loyalty y las conversaciones abiertas con negocios.
                    </p>
                </div>
                <button type="button" className="btn-secondary text-sm" onClick={() => void loadCustomerActivity()}>
                    Actualizar actividad
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reservas</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(bookings.total)}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatNumberDo(completedBookings)} completadas</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check-ins</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(checkinSummary?.checkinCount ?? checkins.total)}</p>
                    <p className="mt-2 text-sm text-slate-500">Racha {formatNumberDo(checkinSummary?.checkinStreak ?? 0)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loyalty points</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(checkinSummary?.loyaltyPoints ?? 0)}</p>
                    {checkinSummary?.loyaltyTier ? (
                        <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getTierTone(checkinSummary.loyaltyTier)}`}>
                            {checkinSummary.loyaltyTier}
                        </span>
                    ) : null}
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Conversaciones</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(conversations.total)}</p>
                    <p className="mt-2 text-sm text-slate-500">Abiertas y recientes</p>
                </article>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Mis reservas</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Agenda y estados</h3>
                    </div>
                    <div className="mt-5 space-y-3">
                        {bookings.data.length > 0 ? bookings.data.map((booking) => (
                            <article key={booking.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-slate-900">{booking.business.name}</p>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingTone(booking.status)}`}>
                                                {getBookingLabel(booking.status)}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{formatDateTimeDo(booking.scheduledFor)}</p>
                                        {booking.promotion?.title ? (
                                            <p className="mt-1 text-xs text-slate-500">Promo: {booking.promotion.title}</p>
                                        ) : null}
                                    </div>
                                    <div className="text-right text-xs text-slate-500">
                                        <p>{booking.quotedAmount ? formatCurrencyDo(booking.quotedAmount, booking.currency) : 'Sin monto'}</p>
                                        <p>{booking.partySize ? `${booking.partySize} personas` : 'Sin tamano definido'}</p>
                                    </div>
                                </div>
                                {booking.quotedAmount ? (
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleBookingCheckout(booking.id)}
                                            disabled={actionKey === `booking-checkout-${booking.id}`}
                                        >
                                            {actionKey === `booking-checkout-${booking.id}` ? 'Redirigiendo...' : 'Pagar reserva'}
                                        </button>
                                    </div>
                                ) : null}
                            </article>
                        )) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">
                                Todavia no tienes reservas registradas.
                            </div>
                        )}
                    </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Mis check-ins</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Actividad y loyalty</h3>
                    </div>
                    <div className="mt-5 space-y-3">
                        {checkins.data.length > 0 ? checkins.data.map((checkin) => (
                            <article key={checkin.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900">{checkin.business.name}</p>
                                        <p className="mt-1 text-sm text-slate-600">{formatDateTimeDo(checkin.createdAt)}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {checkin.business.province?.name || checkin.business.address || 'Ubicacion registrada'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-slate-900">+{formatNumberDo(checkin.pointsAwarded)} pts</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {checkin.verifiedLocation ? 'Ubicacion verificada' : 'Sin verificacion GPS'}
                                        </p>
                                    </div>
                                </div>
                            </article>
                        )) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">
                                Cuando hagas check-in en negocios compatibles, los veras aqui.
                            </div>
                        )}
                    </div>
                </article>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Mi inbox</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Conversaciones con negocios</h3>
                    </div>
                    <div className="mt-5 space-y-3">
                        {conversations.data.length > 0 ? conversations.data.map((conversation) => (
                            <button
                                type="button"
                                key={conversation.id}
                                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                                    selectedConversationId === conversation.id
                                        ? 'border-primary-300 bg-primary-50'
                                        : 'border-slate-200 bg-slate-50/70 hover:border-primary-200'
                                }`}
                                onClick={() => setSelectedConversationId(conversation.id)}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-slate-900">{conversation.business.name}</p>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getConversationTone(conversation.status)}`}>
                                                {getConversationLabel(conversation.status)}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{conversation.subject || 'Consulta directa'}</p>
                                        <p className="mt-1 text-xs text-slate-500">{formatDateTimeDo(conversation.lastMessageAt)}</p>
                                    </div>
                                    <p className="text-xs text-slate-500">{formatNumberDo(conversation._count.messages)} mensajes</p>
                                </div>
                            </button>
                        )) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">
                                Tus conversaciones apareceran aqui cuando escribas desde un negocio.
                            </div>
                        )}
                    </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Hilo seleccionado</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Responde sin salir del panel</h3>
                    </div>

                    {threadLoading ? (
                        <div className="mt-5 space-y-3">
                            <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                            <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
                        </div>
                    ) : conversationThread ? (
                        <div className="mt-5 space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="font-medium text-slate-900">{conversationThread.business.name}</p>
                                        <p className="mt-1 text-sm text-slate-600">{conversationThread.subject || 'Consulta directa'}</p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getConversationTone(conversationThread.status)}`}>
                                        {getConversationLabel(conversationThread.status)}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                {conversationThread.messages.length > 0 ? conversationThread.messages.map((message) => (
                                    <article key={message.id} className="rounded-2xl bg-white p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-slate-900">{getSenderLabel(message.senderRole)}</p>
                                            <p className="text-xs text-slate-500">{formatDateTimeDo(message.createdAt)}</p>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">{message.content}</p>
                                    </article>
                                )) : (
                                    <p className="text-sm text-slate-600">No hay mensajes en este hilo.</p>
                                )}
                            </div>

                            <form className="space-y-3" onSubmit={(event) => void handleSendReply(event)}>
                                <textarea
                                    className="input-field min-h-[110px]"
                                    value={replyDraft}
                                    onChange={(event) => setReplyDraft(event.target.value)}
                                    placeholder="Escribe tu respuesta para el negocio."
                                    disabled={conversationThread.status === 'CLOSED'}
                                />
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        className="btn-primary text-sm"
                                        disabled={actionKey === 'customer-reply' || !replyDraft.trim() || conversationThread.status === 'CLOSED'}
                                    >
                                        {actionKey === 'customer-reply' ? 'Enviando...' : 'Enviar mensaje'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">
                            Selecciona una conversacion para leer el historial y responder.
                        </div>
                    )}
                </article>
            </div>
        </section>
    );
}
