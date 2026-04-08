import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { favoritesApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useAuth } from '../context/useAuth';
import { formatDateTimeDo } from '../lib/market';

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

const EMPTY_FAVORITES: FavoriteBusinessItem[] = [];
const EMPTY_LISTS: UserBusinessList[] = [];

function EmptyPanel({
    title,
    description,
    primaryAction,
}: {
    title: string;
    description: string;
    primaryAction?: React.ReactNode;
}) {
    return (
        <div className="discovery-callout">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
            {primaryAction ? <div className="mt-4">{primaryAction}</div> : null}
        </div>
    );
}

export function CustomerDashboard() {
    const { user } = useAuth();
    const [favoritesActionLoading, setFavoritesActionLoading] = useState<string | null>(null);
    const [favoritesInfoMessage, setFavoritesInfoMessage] = useState('');
    const [favoritesErrorMessage, setFavoritesErrorMessage] = useState('');

    const dashboardQuery = useQuery({
        queryKey: ['customer-dashboard-lite'],
        queryFn: async () => {
            const [favoritesResponse, listsResponse] = await Promise.all([
                favoritesApi.getFavoriteBusinesses({ limit: 8 }),
                favoritesApi.getMyLists({ limit: 8 }),
            ]);

            return {
                favorites: (favoritesResponse.data?.data ?? []) as FavoriteBusinessItem[],
                lists: (listsResponse.data?.data ?? []) as UserBusinessList[],
            };
        },
    });

    const loading = dashboardQuery.isLoading;
    const error = dashboardQuery.error
        ? getApiErrorMessage(dashboardQuery.error, 'No se pudo cargar tu panel')
        : '';

    const favorites = dashboardQuery.data?.favorites ?? EMPTY_FAVORITES;
    const lists = dashboardQuery.data?.lists ?? EMPTY_LISTS;

    const reloadDashboard = async () => {
        await dashboardQuery.refetch();
    };

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

    if (loading) {
        return (
            <div className="page-shell py-10 animate-fade-in">
                <div className="h-10 w-56 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
                <div className="h-5 w-80 rounded-lg bg-gray-100 animate-pulse mb-8"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 2 }).map((_, index) => (
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
        <div className="page-shell space-y-8 animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'customer-dashboard-error', tone: 'danger', text: error },
                    { id: 'customer-dashboard-favorites-error', tone: 'danger', text: favoritesErrorMessage },
                    { id: 'customer-dashboard-favorites-info', tone: 'info', text: favoritesInfoMessage },
                ]}
            />

            <section className="role-hero role-hero-user">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-100">Panel cliente</p>
                <h1 className="mt-2 font-display text-3xl font-bold text-white">
                    Hola, {user?.name?.split(' ')[0] ?? 'Usuario'}
                </h1>
                <p className="mt-2 max-w-2xl text-blue-100">
                    Organiza tus negocios favoritos, compara listas y vuelve rapido a los perfiles que mas te interesan.
                </p>

                <div className="mt-5 role-kpi-grid">
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Favoritos</p>
                        <p className="role-kpi-value">{favorites.length}</p>
                    </article>
                    <article className="role-kpi-card">
                        <p className="role-kpi-label">Listas</p>
                        <p className="role-kpi-value">{lists.length}</p>
                    </article>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <Link className="btn-primary" to="/businesses">
                        Explorar negocios
                    </Link>
                    <Link className="btn-secondary" to="/profile">
                        Editar perfil
                    </Link>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <article className="section-shell p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Guardados</p>
                            <h2 className="font-display text-xl font-bold text-slate-900">Mis favoritos</h2>
                        </div>
                        <Link to="/businesses" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                            Explorar
                        </Link>
                    </div>

                    {favorites.length === 0 ? (
                        <EmptyPanel
                            title="Aun no has guardado negocios"
                            description="Explora el directorio, compara perfiles y guarda los lugares que quieras revisar despues."
                            primaryAction={(
                                <Link to="/businesses" className="btn-primary inline-flex text-sm">
                                    Empezar a explorar
                                </Link>
                            )}
                        />
                    ) : (
                        <div className="space-y-3">
                            {favorites.map((favorite) => (
                                <div key={favorite.businessId} className="panel-premium p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-slate-900">{favorite.business.name}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {favorite.business.province?.name || favorite.business.address}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
                                            onClick={() => void handleRemoveFavorite(favorite.businessId)}
                                            disabled={favoritesActionLoading === `favorite-${favorite.businessId}`}
                                        >
                                            {favoritesActionLoading === `favorite-${favorite.businessId}` ? 'Quitando...' : 'Quitar'}
                                        </button>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <p className="text-xs text-slate-400">
                                            Guardado: {formatDateTimeDo(favorite.createdAt)}
                                        </p>
                                        <Link
                                            to={`/businesses/${favorite.business.slug}`}
                                            className="text-xs font-semibold text-primary-700 hover:text-primary-800"
                                        >
                                            Ver negocio
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="section-shell p-6">
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Curacion</p>
                            <h2 className="font-display text-xl font-bold text-slate-900">Mis listas</h2>
                        </div>
                        <span className="chip">{lists.length} listas</span>
                    </div>

                    {lists.length === 0 ? (
                        <EmptyPanel
                            title="Tus listas aun estan vacias"
                            description="Crea listas desde el detalle de cada negocio para comparar opciones, guardar ideas por zona y armar tu shortlist con mas contexto."
                            primaryAction={(
                                <Link to="/businesses" className="btn-secondary inline-flex text-sm">
                                    Ir al directorio
                                </Link>
                            )}
                        />
                    ) : (
                        <div className="space-y-3">
                            {lists.map((list) => (
                                <div key={list.id} className="panel-premium p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-semibold text-slate-900">{list.name}</p>
                                            {list.description ? (
                                                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{list.description}</p>
                                            ) : null}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                                {list._count?.items ?? list.items.length} items
                                            </span>
                                            <button
                                                type="button"
                                                className="rounded-lg bg-red-100 px-2 py-1 text-xs text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50"
                                                onClick={() => void handleDeleteList(list.id)}
                                                disabled={favoritesActionLoading === `delete-list-${list.id}`}
                                            >
                                                {favoritesActionLoading === `delete-list-${list.id}` ? 'Eliminando...' : 'Borrar'}
                                            </button>
                                        </div>
                                    </div>

                                    {list.items.length > 0 ? (
                                        <div className="mt-3 space-y-2">
                                            {list.items.slice(0, 3).map((item) => (
                                                <div
                                                    key={item.businessId}
                                                    className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-2"
                                                >
                                                    <Link
                                                        to={`/businesses/${item.business.slug}`}
                                                        className="truncate text-xs font-medium text-slate-700 hover:text-primary-700"
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
                                        <p className="mt-3 text-xs text-slate-500">Sin negocios todavia.</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>
        </div>
    );
}

