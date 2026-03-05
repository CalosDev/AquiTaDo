import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { favoritesApi, messagingApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useAuth } from '../context/useAuth';
import { formatDateTimeDo } from '../lib/market';

type ConversationStatus = 'OPEN' | 'CLOSED' | 'CONVERTED';

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

interface ConversationThread {
    id: string;
    status: ConversationStatus;
    updatedAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
    };
    messages: Array<{
        id: string;
        content: string;
        createdAt: string;
        senderRole: 'CUSTOMER' | 'BUSINESS_STAFF' | 'SYSTEM';
        senderUser?: {
            id: string;
            name: string;
        } | null;
    }>;
}

interface FavoriteBusinessItem {
    businessId: string;
    createdAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
        address: string;
        province?: {
            id: string;
            name: string;
            slug: string;
        } | null;
    };
}

interface UserBusinessList {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    _count?: {
        items: number;
    };
    items: Array<{
        businessId: string;
        addedAt: string;
        business: {
            id: string;
            name: string;
            slug: string;
        };
    }>;
}

const EMPTY_CONVERSATIONS: ConversationItem[] = [];
const EMPTY_FAVORITES: FavoriteBusinessItem[] = [];
const EMPTY_LISTS: UserBusinessList[] = [];

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
    const [favoritesActionLoading, setFavoritesActionLoading] = useState<string | null>(null);
    const [favoritesInfoMessage, setFavoritesInfoMessage] = useState('');
    const [favoritesErrorMessage, setFavoritesErrorMessage] = useState('');

    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
    const [selectedConversationThread, setSelectedConversationThread] = useState<ConversationThread | null>(null);
    const [conversationThreadLoading, setConversationThreadLoading] = useState(false);
    const [conversationReply, setConversationReply] = useState('');
    const [conversationReplySending, setConversationReplySending] = useState(false);
    const [conversationInfoMessage, setConversationInfoMessage] = useState('');
    const [conversationErrorMessage, setConversationErrorMessage] = useState('');

    const dashboardQuery = useQuery({
        queryKey: ['customer-dashboard-lite'],
        queryFn: async () => {
            const [conversationsResponse, favoritesResponse, listsResponse] = await Promise.all([
                messagingApi.getMyConversations({ limit: 8 }),
                favoritesApi.getFavoriteBusinesses({ limit: 8 }),
                favoritesApi.getMyLists({ limit: 8 }),
            ]);

            return {
                conversations: (conversationsResponse.data?.data ?? []) as ConversationItem[],
                favorites: (favoritesResponse.data?.data ?? []) as FavoriteBusinessItem[],
                lists: (listsResponse.data?.data ?? []) as UserBusinessList[],
            };
        },
    });

    const loading = dashboardQuery.isLoading;
    const error = dashboardQuery.error
        ? getApiErrorMessage(dashboardQuery.error, 'No se pudo cargar tu panel')
        : '';

    const conversations = dashboardQuery.data?.conversations ?? EMPTY_CONVERSATIONS;
    const favorites = dashboardQuery.data?.favorites ?? EMPTY_FAVORITES;
    const lists = dashboardQuery.data?.lists ?? EMPTY_LISTS;

    const openConversationsCount = useMemo(
        () => conversations.filter((conversation) => conversation.status === 'OPEN').length,
        [conversations],
    );

    useEffect(() => {
        if (conversations.length === 0) {
            setSelectedConversationId(null);
            setSelectedConversationThread(null);
            return;
        }

        if (!selectedConversationId || !conversations.some((conversation) => conversation.id === selectedConversationId)) {
            setSelectedConversationId(conversations[0].id);
        }
    }, [conversations, selectedConversationId]);

    const reloadDashboard = async () => {
        await dashboardQuery.refetch();
    };

    const loadConversationThread = useCallback(async (conversationId: string) => {
        setConversationThreadLoading(true);
        setConversationErrorMessage('');
        try {
            const response = await messagingApi.getMyConversationThread(conversationId);
            setSelectedConversationThread(response.data as ConversationThread);
        } catch (threadError) {
            setConversationErrorMessage(getApiErrorMessage(threadError, 'No se pudo cargar el chat'));
            setSelectedConversationThread(null);
        } finally {
            setConversationThreadLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!selectedConversationId) {
            return;
        }
        void loadConversationThread(selectedConversationId);
    }, [loadConversationThread, selectedConversationId]);

    const handleRemoveFavorite = async (businessId: string) => {
        const actionKey = `favorite-${businessId}`;
        setFavoritesActionLoading(actionKey);
        setFavoritesErrorMessage('');
        setFavoritesInfoMessage('');
        try {
            await favoritesApi.toggleFavoriteBusiness({ businessId });
            await reloadDashboard();
            setFavoritesInfoMessage('Negocio removido de favoritos');
        } catch (actionError) {
            setFavoritesErrorMessage(getApiErrorMessage(actionError, 'No se pudo remover el favorito'));
        } finally {
            setFavoritesActionLoading(null);
        }
    };

    const handleDeleteList = async (listId: string) => {
        const actionKey = `delete-list-${listId}`;
        setFavoritesActionLoading(actionKey);
        setFavoritesErrorMessage('');
        setFavoritesInfoMessage('');
        try {
            await favoritesApi.deleteList(listId);
            await reloadDashboard();
            setFavoritesInfoMessage('Lista eliminada');
        } catch (actionError) {
            setFavoritesErrorMessage(getApiErrorMessage(actionError, 'No se pudo eliminar la lista'));
        } finally {
            setFavoritesActionLoading(null);
        }
    };

    const handleRemoveFromList = async (listId: string, businessId: string) => {
        const actionKey = `remove-item-${listId}-${businessId}`;
        setFavoritesActionLoading(actionKey);
        setFavoritesErrorMessage('');
        setFavoritesInfoMessage('');
        try {
            await favoritesApi.removeBusinessFromList(listId, businessId);
            await reloadDashboard();
            setFavoritesInfoMessage('Negocio removido de la lista');
        } catch (actionError) {
            setFavoritesErrorMessage(getApiErrorMessage(actionError, 'No se pudo remover el negocio de la lista'));
        } finally {
            setFavoritesActionLoading(null);
        }
    };

    const handleSendConversationReply = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedConversationId || !conversationReply.trim()) {
            setConversationErrorMessage('Escribe una respuesta para continuar');
            return;
        }

        setConversationReplySending(true);
        setConversationErrorMessage('');
        setConversationInfoMessage('');
        try {
            await messagingApi.sendMessageAsCustomer(selectedConversationId, {
                content: conversationReply.trim(),
            });
            setConversationReply('');
            await Promise.all([
                loadConversationThread(selectedConversationId),
                reloadDashboard(),
            ]);
            setConversationInfoMessage('Mensaje enviado');
        } catch (sendError) {
            setConversationErrorMessage(getApiErrorMessage(sendError, 'No se pudo enviar el mensaje'));
        } finally {
            setConversationReplySending(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
                <div className="h-10 w-56 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
                <div className="h-5 w-80 rounded-lg bg-gray-100 animate-pulse mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="card p-6">
                            <div className="h-4 w-24 bg-gray-100 rounded mb-3 animate-pulse"></div>
                            <div className="h-7 w-16 bg-gray-100 rounded animate-pulse"></div>
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
                    Gestiona tus favoritos, listas y conversaciones con negocios.
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
            {favoritesErrorMessage && (
                <section className="card p-4 border border-red-100 bg-red-50">
                    <p className="text-sm text-red-700">{favoritesErrorMessage}</p>
                </section>
            )}
            {favoritesInfoMessage && (
                <section className="card p-4 border border-green-100 bg-green-50">
                    <p className="text-sm text-green-700">{favoritesInfoMessage}</p>
                </section>
            )}

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Favoritos</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{favorites.length}</p>
                    <p className="text-sm text-gray-500 mt-1">Negocios guardados</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Listas</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{lists.length}</p>
                    <p className="text-sm text-gray-500 mt-1">Colecciones personales</p>
                </article>
                <article className="card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversaciones</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{openConversationsCount}</p>
                    <p className="text-sm text-gray-500 mt-1">Hilos abiertos</p>
                </article>
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <article className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl font-bold text-gray-900">Mis favoritos</h2>
                        <Link to="/businesses" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                            Explorar
                        </Link>
                    </div>
                    {favorites.length === 0 ? (
                        <p className="text-sm text-gray-500">Aun no has guardado negocios.</p>
                    ) : (
                        <div className="space-y-3">
                            {favorites.map((favorite) => (
                                <div key={favorite.businessId} className="rounded-xl border border-gray-100 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-semibold text-gray-900">{favorite.business.name}</p>
                                        <button
                                            type="button"
                                            className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                                            onClick={() => void handleRemoveFavorite(favorite.businessId)}
                                            disabled={favoritesActionLoading === `favorite-${favorite.businessId}`}
                                        >
                                            {favoritesActionLoading === `favorite-${favorite.businessId}` ? 'Quitando...' : 'Quitar'}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {favorite.business.province?.name || favorite.business.address}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Guardado: {formatDateTimeDo(favorite.createdAt)}
                                    </p>
                                    <Link
                                        to={`/businesses/${favorite.business.slug}`}
                                        className="inline-flex mt-3 text-xs font-semibold text-primary-700 hover:text-primary-800"
                                    >
                                        Ver negocio
                                    </Link>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-display text-xl font-bold text-gray-900">Mis listas</h2>
                        <span className="text-xs text-gray-500">{lists.length} listas</span>
                    </div>
                    {lists.length === 0 ? (
                        <p className="text-sm text-gray-500">Crea listas guardando negocios desde su detalle.</p>
                    ) : (
                        <div className="space-y-3">
                            {lists.map((list) => (
                                <div key={list.id} className="rounded-xl border border-gray-100 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-semibold text-gray-900">{list.name}</p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5">
                                                {list._count?.items ?? list.items.length} items
                                            </span>
                                            <button
                                                type="button"
                                                className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                                                onClick={() => void handleDeleteList(list.id)}
                                                disabled={favoritesActionLoading === `delete-list-${list.id}`}
                                            >
                                                {favoritesActionLoading === `delete-list-${list.id}` ? 'Eliminando...' : 'Borrar'}
                                            </button>
                                        </div>
                                    </div>
                                    {list.description ? (
                                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{list.description}</p>
                                    ) : null}
                                    {list.items.length > 0 ? (
                                        <div className="mt-2 space-y-2">
                                            {list.items.slice(0, 3).map((item) => (
                                                <div key={item.businessId} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
                                                    <Link
                                                        to={`/businesses/${item.business.slug}`}
                                                        className="text-xs font-medium text-gray-700 hover:text-primary-700"
                                                    >
                                                        {item.business.name}
                                                    </Link>
                                                    <button
                                                        type="button"
                                                        className="text-[11px] text-red-700 hover:text-red-800 disabled:opacity-50"
                                                        onClick={() => void handleRemoveFromList(list.id, item.businessId)}
                                                        disabled={favoritesActionLoading === `remove-item-${list.id}-${item.businessId}`}
                                                    >
                                                        {favoritesActionLoading === `remove-item-${list.id}-${item.businessId}` ? 'Quitando...' : 'Quitar'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500 mt-2">Sin negocios aun.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>

            <section className="card p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-xl font-bold text-gray-900">Mensajeria con negocios</h2>
                    <Link to="/businesses" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                        Escribir a negocio
                    </Link>
                </div>

                {conversations.length === 0 ? (
                    <p className="text-sm text-gray-500">No tienes conversaciones todavia.</p>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                            {conversations.map((conversation) => (
                                <button
                                    type="button"
                                    key={conversation.id}
                                    className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                        selectedConversationId === conversation.id
                                            ? 'border-primary-300 bg-primary-50/50'
                                            : 'border-gray-100 hover:border-primary-100'
                                    }`}
                                    onClick={() => setSelectedConversationId(conversation.id)}
                                >
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
                                        Actualizado: {formatDateTimeDo(conversation.updatedAt)}
                                    </p>
                                </button>
                            ))}
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                            {conversationErrorMessage ? (
                                <p className="text-xs text-red-700 mb-2">{conversationErrorMessage}</p>
                            ) : null}
                            {conversationInfoMessage ? (
                                <p className="text-xs text-green-700 mb-2">{conversationInfoMessage}</p>
                            ) : null}

                            {conversationThreadLoading ? (
                                <p className="text-sm text-gray-500">Cargando conversacion...</p>
                            ) : selectedConversationThread ? (
                                <>
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-3">
                                        {selectedConversationThread.messages.length > 0 ? (
                                            selectedConversationThread.messages.map((message) => (
                                                <div
                                                    key={message.id}
                                                    className={`rounded-lg px-3 py-2 text-sm ${
                                                        message.senderRole === 'CUSTOMER'
                                                            ? 'bg-primary-100 text-primary-900'
                                                            : 'bg-white border border-gray-200 text-gray-700'
                                                    }`}
                                                >
                                                    <p className="text-[11px] uppercase tracking-wide mb-1 text-gray-500">
                                                        {message.senderRole === 'CUSTOMER'
                                                            ? 'Tu'
                                                            : message.senderUser?.name || 'Negocio'}
                                                    </p>
                                                    <p className="whitespace-pre-wrap">{message.content}</p>
                                                    <p className="text-[11px] mt-1 text-gray-500">
                                                        {formatDateTimeDo(message.createdAt)}
                                                    </p>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-gray-500">Sin mensajes en este chat.</p>
                                        )}
                                    </div>

                                    <form onSubmit={handleSendConversationReply} className="space-y-2">
                                        <textarea
                                            className="input-field text-sm"
                                            rows={3}
                                            placeholder="Escribe una respuesta..."
                                            value={conversationReply}
                                            onChange={(event) => setConversationReply(event.target.value)}
                                        />
                                        <button
                                            type="submit"
                                            className="btn-primary text-sm"
                                            disabled={conversationReplySending}
                                        >
                                            {conversationReplySending ? 'Enviando...' : 'Responder'}
                                        </button>
                                    </form>
                                </>
                            ) : (
                                <p className="text-sm text-gray-500">Selecciona una conversacion para ver el hilo.</p>
                            )}
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
