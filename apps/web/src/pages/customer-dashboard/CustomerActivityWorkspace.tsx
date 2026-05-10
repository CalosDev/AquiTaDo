import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { bookingsApi, checkinsApi, messagingApi, paymentsApi } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/error';
import { PageFeedbackStack } from '../../components/PageFeedbackStack';
import {
    AppCard,
    EmptyState,
    EntityListItem,
    PageShell,
    SplitPanelLayout,
} from '../../components/ui';
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
            <PageShell className="space-y-6">
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
                        <div key={index} className="rounded-[26px] border border-slate-200 bg-white p-5">
                            <div className="h-5 w-40 rounded-full bg-slate-100 animate-pulse" />
                            <div className="mt-5 space-y-3">
                                {Array.from({ length: 3 }).map((__, rowIndex) => (
                                    <div key={rowIndex} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                                        <div className="h-4 w-32 rounded-full bg-slate-100 animate-pulse" />
                                        <div className="mt-3 h-3 w-24 rounded-full bg-slate-100 animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <SplitPanelLayout
                    primary={(
                        <AppCard title="Mi inbox" description="Conversaciones con negocios y respuestas recientes.">
                            <div className="mt-5 space-y-3 min-h-[20rem]">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
                                        <div className="h-4 w-36 rounded-full bg-slate-100 animate-pulse" />
                                        <div className="mt-3 h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                                        <div className="mt-4 h-12 rounded-2xl bg-white animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </AppCard>
                    )}
                    secondary={(
                        <AppCard title="Hilo seleccionado" description="Lee el historial y responde sin salir del panel.">
                            <div className="mt-5 space-y-3 min-h-[20rem]">
                                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                                <div className="h-44 rounded-2xl bg-slate-100 animate-pulse" />
                                <div className="h-24 rounded-2xl bg-slate-50 animate-pulse" />
                            </div>
                        </AppCard>
                    )}
                />
            </PageShell>
        );
    }

    return (
        <PageShell className="space-y-6">
            <PageFeedbackStack
                items={[
                    { id: 'customer-activity-error', tone: 'danger', text: errorMessage },
                    { id: 'customer-activity-success', tone: 'info', text: successMessage },
                ]}
            />

            <section className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-700">Tu actividad</p>
                        <h2 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">Reservas, check-ins e inbox</h2>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                            Sigue tus experiencias recientes, tu progreso de loyalty y las conversaciones abiertas con negocios.
                        </p>
                    </div>
                    <button type="button" className="btn-secondary text-sm" onClick={() => void loadCustomerActivity()}>
                        Actualizar actividad
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                        {
                            label: 'Reservas',
                            value: formatNumberDo(bookings.total),
                            delta: `${formatNumberDo(completedBookings)} completadas`,
                        },
                        {
                            label: 'Check-ins',
                            value: formatNumberDo(checkinSummary?.checkinCount ?? checkins.total),
                            delta: `Racha ${formatNumberDo(checkinSummary?.checkinStreak ?? 0)}`,
                        },
                        {
                            label: 'Loyalty points',
                            value: formatNumberDo(checkinSummary?.loyaltyPoints ?? 0),
                            delta: checkinSummary?.loyaltyTier || 'Sin tier aun',
                        },
                        {
                            label: 'Conversaciones',
                            value: formatNumberDo(conversations.total),
                            delta: 'Abiertas y recientes',
                        },
                    ].map((metric) => (
                        <div key={metric.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{metric.label}</p>
                            <p className="mt-1.5 text-xl font-bold tracking-normal text-slate-950">{metric.value}</p>
                            <p className="mt-1 text-xs font-medium text-slate-600">{metric.delta}</p>
                        </div>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <AppCard title="Mis reservas" description="Agenda y estados de las experiencias que ya apartaste o que siguen pendientes.">
                    <div className="mt-5 space-y-3">
                        {bookings.data.length > 0 ? bookings.data.map((booking) => (
                            <EntityListItem
                                key={booking.id}
                                title={booking.business.name}
                                subtitle={formatDateTimeDo(booking.scheduledFor)}
                                badge={(
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingTone(booking.status)}`}>
                                        {getBookingLabel(booking.status)}
                                    </span>
                                )}
                                meta={booking.quotedAmount ? formatCurrencyDo(booking.quotedAmount, booking.currency) : 'Sin monto'}
                                body={(
                                    <div className="space-y-2">
                                        {booking.promotion?.title ? (
                                            <p className="text-xs text-slate-500">Promo aplicada: {booking.promotion.title}</p>
                                        ) : null}
                                        <p className="text-xs text-slate-500">{booking.partySize ? `${booking.partySize} personas` : 'Sin tamano definido'}</p>
                                    </div>
                                )}
                                actions={booking.quotedAmount ? (
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleBookingCheckout(booking.id)}
                                            disabled={actionKey === `booking-checkout-${booking.id}`}
                                        >
                                            {actionKey === `booking-checkout-${booking.id}` ? 'Redirigiendo...' : 'Pagar reserva'}
                                        </button>
                                    </div>
                                ) : undefined}
                            />
                        )) : (
                            <EmptyState
                                title="Aun no tienes reservas"
                                body="Cuando hagas tu primera reserva, la veras aqui con su estado y sus siguientes pasos."
                            />
                        )}
                    </div>
                </AppCard>

                <AppCard title="Mis check-ins" description="Actividad reciente y progreso de loyalty en negocios compatibles.">
                    <div className="mt-5 space-y-3">
                        {checkins.data.length > 0 ? checkins.data.map((checkin) => (
                            <EntityListItem
                                key={checkin.id}
                                title={checkin.business.name}
                                subtitle={formatDateTimeDo(checkin.createdAt)}
                                meta={`+${formatNumberDo(checkin.pointsAwarded)} pts`}
                                body={(
                                    <div className="space-y-1 text-xs text-slate-500">
                                        <p>{checkin.business.province?.name || checkin.business.address || 'Ubicacion registrada'}</p>
                                        <p>{checkin.verifiedLocation ? 'Ubicacion verificada' : 'Sin verificacion GPS'}</p>
                                    </div>
                                )}
                            />
                        )) : (
                            <EmptyState
                                title="Sin check-ins por ahora"
                                body="Cuando hagas check-in en negocios compatibles, veras aqui tus puntos y tu progreso."
                            />
                        )}
                    </div>
                </AppCard>
            </div>

            <SplitPanelLayout
                className="gap-4"
                primary={(
                    <AppCard
                        title="Mi inbox"
                        description="Conversaciones con negocios y respuestas recientes."
                        className="!p-4 shadow-none md:!p-5 [&_.app-card__header]:mb-3"
                    >
                        <div className="mt-4 space-y-2.5">
                            {conversations.data.length > 0 ? conversations.data.map((conversation) => (
                                <button
                                    type="button"
                                    key={conversation.id}
                                    className={`w-full rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                                        selectedConversationId === conversation.id
                                            ? 'border-primary-300 bg-primary-50'
                                            : 'border-slate-200 bg-white hover:border-primary-200 hover:bg-slate-50'
                                    }`}
                                    onClick={() => setSelectedConversationId(conversation.id)}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-sm font-semibold text-slate-900">{conversation.business.name}</p>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getConversationTone(conversation.status)}`}>
                                                    {getConversationLabel(conversation.status)}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-sm text-slate-600">{conversation.subject || 'Consulta directa'}</p>
                                            <p className="mt-2 text-xs text-slate-500">{formatDateTimeDo(conversation.lastMessageAt)}</p>
                                        </div>
                                        <p className="shrink-0 text-xs font-medium text-slate-500">{formatNumberDo(conversation._count.messages)} mensajes</p>
                                    </div>
                                </button>
                            )) : (
                                <EmptyState
                                    title="Sin conversaciones todavia"
                                    body="Tus conversaciones apareceran aqui cuando escribas desde una ficha de negocio."
                                />
                            )}
                        </div>
                    </AppCard>
                )}
                secondary={(
                    <AppCard
                        title="Hilo seleccionado"
                        description="Lee el historial y responde sin salir del panel."
                        className="!p-4 shadow-none md:!p-5 [&_.app-card__header]:mb-3"
                    >
                        {threadLoading ? (
                            <div className="mt-4 space-y-3">
                                <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                                <div className="h-40 rounded-2xl bg-slate-100 animate-pulse" />
                            </div>
                        ) : conversationThread ? (
                            <div className="mt-4 space-y-3">
                                <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3">
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

                                <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                    {conversationThread.messages.length > 0 ? conversationThread.messages.map((message) => (
                                        <EntityListItem
                                            key={message.id}
                                            title={getSenderLabel(message.senderRole)}
                                            meta={formatDateTimeDo(message.createdAt)}
                                            body={<p className="text-sm text-slate-600">{message.content}</p>}
                                            className="!rounded-2xl !border-slate-200/70 !px-3 !py-3 shadow-none"
                                        />
                                    )) : (
                                        <p className="text-sm text-slate-600">No hay mensajes en este hilo.</p>
                                    )}
                                </div>

                                <form className="space-y-3" onSubmit={(event) => void handleSendReply(event)}>
                                    <textarea
                                        className="input-field min-h-[96px]"
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
                            <EmptyState
                                title="Selecciona una conversacion"
                                body="Cuando elijas un hilo, aqui veras el historial completo y podras responder."
                                className="mt-5"
                            />
                        )}
                    </AppCard>
                )}
            />
        </PageShell>
    );
}
