import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { favoritesApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import {
    ActionBar,
    AppCard,
    EmptyState,
    LoadingState,
    MetricCard,
    PageIntroCompact,
    PageShell,
    SplitPanelLayout,
} from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useTimedMessage } from '../hooks/useTimedMessage';
import { formatDateTimeDo } from '../lib/market';
import { CustomerActivityWorkspace } from './customer-dashboard/CustomerActivityWorkspace';

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

function FavoriteRow({
    favorite,
    busy,
    onRemove,
}: {
    favorite: FavoriteBusinessItem;
    busy: boolean;
    onRemove: () => Promise<void>;
}) {
    return (
        <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{favorite.business.name}</p>
                    <p className="mt-1 text-sm text-slate-600">
                        {favorite.business.province?.name || favorite.business.address}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                        Guardado el {formatDateTimeDo(favorite.createdAt)}
                    </p>
                </div>
                <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void onRemove()}
                    disabled={busy}
                >
                    {busy ? 'Quitando...' : 'Quitar'}
                </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link to={`/businesses/${favorite.business.slug}`} className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                    Ver negocio
                </Link>
            </div>
        </div>
    );
}

function ListRow({
    list,
    actionLoading,
    onDelete,
    onRemoveItem,
}: {
    list: UserBusinessList;
    actionLoading: string | null;
    onDelete: () => Promise<void>;
    onRemoveItem: (businessId: string) => Promise<void>;
}) {
    const itemCount = list._count?.items ?? list.items.length;

    return (
        <div className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">{list.name}</p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            {itemCount} guardados
                        </span>
                    </div>
                    {list.description ? <p className="mt-2 text-sm text-slate-600">{list.description}</p> : null}
                </div>

                <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void onDelete()}
                    disabled={actionLoading === `delete-list-${list.id}`}
                >
                    {actionLoading === `delete-list-${list.id}` ? 'Eliminando...' : 'Eliminar lista'}
                </button>
            </div>

            {list.items.length > 0 ? (
                <div className="mt-4 space-y-2">
                    {list.items.slice(0, 3).map((item) => (
                        <div
                            key={item.businessId}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200/70 bg-slate-50 px-3 py-3"
                        >
                            <div className="min-w-0">
                                <Link
                                    to={`/businesses/${item.business.slug}`}
                                    className="truncate text-sm font-medium text-slate-700 hover:text-primary-700"
                                >
                                    {item.business.name}
                                </Link>
                                <p className="text-xs text-slate-500">Agregado a tu coleccion</p>
                            </div>

                            <button
                                type="button"
                                className="text-xs font-semibold text-rose-700 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void onRemoveItem(item.businessId)}
                                disabled={actionLoading === `remove-item-${list.id}-${item.businessId}`}
                            >
                                {actionLoading === `remove-item-${list.id}-${item.businessId}` ? 'Quitando...' : 'Quitar'}
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-4 text-sm text-slate-500">Todavia no has agregado negocios a esta lista.</p>
            )}
        </div>
    );
}

export function CustomerDashboard() {
    const { user } = useAuth();
    const [favoritesActionLoading, setFavoritesActionLoading] = useState<string | null>(null);
    const [favoritesInfoMessage, setFavoritesInfoMessage] = useState('');
    const [favoritesErrorMessage, setFavoritesErrorMessage] = useState('');

    useTimedMessage(favoritesInfoMessage, setFavoritesInfoMessage, 4500);
    useTimedMessage(favoritesErrorMessage, setFavoritesErrorMessage, 6500);

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
    const firstName = user?.name?.split(' ')[0] ?? 'Usuario';

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

    return (
        <PageShell width="wide" className="py-10 animate-fade-in">
            <PageFeedbackStack
                items={[
                    { id: 'customer-dashboard-error', tone: 'danger', text: error },
                    { id: 'customer-dashboard-favorites-error', tone: 'danger', text: favoritesErrorMessage },
                    { id: 'customer-dashboard-favorites-info', tone: 'info', text: favoritesInfoMessage },
                ]}
            />

            <AppCard className="space-y-5">
                <PageIntroCompact
                    eyebrow="Panel cliente"
                    title={`Hola, ${firstName}`}
                    description="Guarda negocios, arma listas por zona y vuelve rapido a los perfiles que quieres comparar con calma."
                />

                <ActionBar>
                    <Link className="btn-primary" to="/businesses">
                        Explorar negocios
                    </Link>
                    <Link className="btn-secondary" to="/profile">
                        Ajustar perfil
                    </Link>
                </ActionBar>

                {loading ? (
                    <LoadingState label="Cargando tu panel..." />
                ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <MetricCard
                            label="Favoritos guardados"
                            value={favorites.length}
                            delta={favorites.length > 0 ? 'Negocios que quieres revisar despues' : 'Empieza guardando tus lugares clave'}
                        />
                        <MetricCard
                            label="Listas activas"
                            value={lists.length}
                            delta={lists.length > 0 ? 'Colecciones listas para comparar opciones' : 'Crea una lista para ordenar tu busqueda'}
                        />
                    </div>
                )}
            </AppCard>

            <SplitPanelLayout
                primary={loading ? (
                    <AppCard title="Tus favoritos" description="Una vista corta de los negocios que quieres revisar, comparar o retomar mas tarde.">
                        <div className="space-y-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
                                    <div className="h-4 w-40 rounded-full bg-slate-100 animate-pulse" />
                                    <div className="mt-3 h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                                    <div className="mt-4 h-10 rounded-2xl bg-slate-50 animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </AppCard>
                ) : (
                    <AppCard
                        title="Tus favoritos"
                        description="Una vista corta de los negocios que quieres revisar, comparar o retomar mas tarde."
                        actions={(
                            <Link to="/businesses" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                                Ver directorio
                            </Link>
                        )}
                    >
                        {favorites.length === 0 ? (
                            <EmptyState
                                title="Aun no has guardado negocios"
                                body="Explora el directorio y guarda los perfiles que quieras revisar con mas calma."
                                action={(
                                    <Link to="/businesses" className="btn-primary inline-flex text-sm">
                                        Empezar a explorar
                                    </Link>
                                )}
                            />
                        ) : (
                            <div className="space-y-3">
                                {favorites.map((favorite) => (
                                    <FavoriteRow
                                        key={favorite.businessId}
                                        favorite={favorite}
                                        busy={favoritesActionLoading === `favorite-${favorite.businessId}`}
                                        onRemove={() => handleRemoveFavorite(favorite.businessId)}
                                    />
                                ))}
                            </div>
                        )}
                    </AppCard>
                )}
                secondary={loading ? (
                    <AppCard title="Tus listas" description="Agrupa opciones por zona, plan o tipo de negocio para decidir mejor.">
                        <div className="space-y-3">
                            {Array.from({ length: 2 }).map((_, index) => (
                                <div key={index} className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5">
                                    <div className="h-4 w-32 rounded-full bg-slate-100 animate-pulse" />
                                    <div className="mt-3 h-3 w-24 rounded-full bg-slate-100 animate-pulse" />
                                    <div className="mt-4 h-20 rounded-2xl bg-slate-50 animate-pulse" />
                                </div>
                            ))}
                        </div>
                    </AppCard>
                ) : (
                    <AppCard
                        title="Tus listas"
                        description="Agrupa opciones por zona, plan o tipo de negocio para decidir mejor."
                        actions={<span className="chip">{lists.length} activas</span>}
                    >
                        {lists.length === 0 ? (
                            <EmptyState
                                title="Todavia no tienes listas"
                                body="Crea una lista desde cualquier negocio para comparar ideas sin perder el hilo."
                                action={(
                                    <Link to="/businesses" className="btn-secondary inline-flex text-sm">
                                        Ir al directorio
                                    </Link>
                                )}
                            />
                        ) : (
                            <div className="space-y-3">
                                {lists.map((list) => (
                                    <ListRow
                                        key={list.id}
                                        list={list}
                                        actionLoading={favoritesActionLoading}
                                        onDelete={() => handleDeleteList(list.id)}
                                        onRemoveItem={(businessId) => handleRemoveFromList(list.id, businessId)}
                                    />
                                ))}
                            </div>
                        )}
                    </AppCard>
                )}
            />

            <CustomerActivityWorkspace />
        </PageShell>
    );
}
