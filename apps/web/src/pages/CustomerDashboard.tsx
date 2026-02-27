import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiErrorMessage } from '../api/error';
import { bookingsApi, messagingApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
type ConversationStatus = 'OPEN' | 'CLOSED' | 'CONVERTED';

interface BookingItem {
    id: string;
    status: BookingStatus;
    scheduledFor: string;
    business: {
        id: string;
        name: string;
        slug: string;
    };
}

interface ConversationItem {
    id: string;
    status: ConversationStatus;
    updatedAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
    };
    messages?: Array<{
        id: string;
        content: string;
    }>;
}

const EMPTY_BOOKINGS: BookingItem[] = [];
const EMPTY_CONVERSATIONS: ConversationItem[] = [];

function formatDateTime(value: string): string {
    return new Date(value).toLocaleString('es-DO', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function bookingStatusLabel(status: BookingStatus): string {
    switch (status) {
        case 'PENDING':
            return 'Pendiente';
        case 'CONFIRMED':
            return 'Confirmada';
        case 'COMPLETED':
            return 'Completada';
        case 'CANCELED':
            return 'Cancelada';
        case 'NO_SHOW':
            return 'No Show';
        default:
            return status;
    }
}

function conversationStatusLabel(status: ConversationStatus): string {
    switch (status) {
        case 'OPEN':
            return 'Abierta';
        case 'CLOSED':
            return 'Cerrada';
        case 'CONVERTED':
            return 'Convertida';
        default:
            return status;
    }
}

export function CustomerDashboard() {
    const { user } = useAuth();
    const dashboardQuery = useQuery({
        queryKey: ['customer-dashboard'],
        queryFn: async () => {
            const [bookingsResponse, conversationsResponse] = await Promise.all([
                bookingsApi.getMineAsUser({ limit: 6 }),
                messagingApi.getMyConversations({ limit: 6 }),
            ]);

            const bookings = ((bookingsResponse.data?.data ?? []) as BookingItem[])
                .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime());
            const conversations = (conversationsResponse.data?.data ?? []) as ConversationItem[];

            return {
                bookings,
                conversations,
            };
        },
    });

    const loading = dashboardQuery.isLoading;
    const error = dashboardQuery.error
        ? getApiErrorMessage(dashboardQuery.error, 'No se pudo cargar tu panel')
        : '';
    const bookings = dashboardQuery.data?.bookings ?? EMPTY_BOOKINGS;
    const conversations = dashboardQuery.data?.conversations ?? EMPTY_CONVERSATIONS;

    const nextBooking = useMemo(() => {
        const now = Date.now();
        return bookings.find((booking) => new Date(booking.scheduledFor).getTime() >= now) ?? null;
    }, [bookings]);

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
                <div className="h-10 w-56 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
                <div className="h-5 w-80 rounded-lg bg-gray-100 animate-pulse mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="card p-6">
                            <div className="h-4 w-24 bg-gray-100 rounded mb-3 animate-pulse"></div>
                            <div className="h-7 w-12 bg-gray-100 rounded animate-pulse"></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-fade-in">
            <section className="card p-6 lg:p-8">
                <p className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Panel Cliente</p>
                <h1 className="font-display text-3xl font-bold text-gray-900 mt-1">
                    Hola, {user?.name?.split(' ')[0] ?? 'Usuario'}
                </h1>
                <p className="text-gray-600 mt-2">
                    Gestiona tus reservas, conversaciones con negocios y preferencias de cuenta.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                    <Link className="btn-primary" to="/businesses">
                        Explorar negocios
                    </Link>
                    <Link className="btn-secondary" to="/profile">
                        Editar perfil
                    </Link>
                </div>
            </section>

            {error && (
                <section className="card p-4 border border-red-100 bg-red-50">
                    <p className="text-sm text-red-700">{error}</p>
                </section>
            )}

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Reservas</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{bookings.length}</p>
                    <p className="text-sm text-gray-500 mt-1">Registros recientes</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversaciones</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{conversations.length}</p>
                    <p className="text-sm text-gray-500 mt-1">Hilos activos e historial</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Proxima reserva</p>
                    <p className="text-base font-semibold text-gray-900 mt-2">
                        {nextBooking ? nextBooking.business.name : 'Sin reservas proximas'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                        {nextBooking ? formatDateTime(nextBooking.scheduledFor) : 'Agenda cuando quieras'}
                    </p>
                </article>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <article className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl font-bold text-gray-900">Mis reservas</h2>
                        <Link to="/businesses" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                            Nueva reserva
                        </Link>
                    </div>
                    {bookings.length === 0 ? (
                        <p className="text-sm text-gray-500">No tienes reservas todavia.</p>
                    ) : (
                        <div className="space-y-3">
                            {bookings.map((booking) => (
                                <div key={booking.id} className="rounded-xl border border-gray-100 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="font-semibold text-gray-900">{booking.business.name}</p>
                                            <p className="text-xs text-gray-500 mt-1">{formatDateTime(booking.scheduledFor)}</p>
                                        </div>
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                                            {bookingStatusLabel(booking.status)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl font-bold text-gray-900">Mis mensajes</h2>
                        <Link to="/businesses" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                            Escribir a negocio
                        </Link>
                    </div>
                    {conversations.length === 0 ? (
                        <p className="text-sm text-gray-500">No tienes conversaciones todavia.</p>
                    ) : (
                        <div className="space-y-3">
                            {conversations.map((conversation) => (
                                <div key={conversation.id} className="rounded-xl border border-gray-100 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="font-semibold text-gray-900">{conversation.business.name}</p>
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                                            {conversationStatusLabel(conversation.status)}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                                        {conversation.messages?.[0]?.content ?? 'Sin mensajes recientes'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Actualizado: {formatDateTime(conversation.updatedAt)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>
        </div>
    );
}
