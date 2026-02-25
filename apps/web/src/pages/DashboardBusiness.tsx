import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyticsApi, bookingsApi, businessApi, promotionsApi } from '../api/endpoints';
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
    startsAt: string;
    endsAt: string;
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

export function DashboardBusiness() {
    const { activeOrganizationId } = useOrganization();
    const [loading, setLoading] = useState(true);
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [metrics, setMetrics] = useState<DashboardPayload | null>(null);
    const [promotionForm, setPromotionForm] = useState<PromotionForm>(EMPTY_PROMOTION_FORM);
    const [creatingPromotion, setCreatingPromotion] = useState(false);
    const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
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

    useEffect(() => {
        void loadDashboard();
    }, [loadDashboard]);

    const verifiedBusinesses = useMemo(
        () => businesses.filter((business) => business.verified).length,
        [businesses],
    );

    const handleCreatePromotion = async (event: React.FormEvent) => {
        event.preventDefault();
        const discount = Number(promotionForm.discountValue);
        if (!promotionForm.businessId || !promotionForm.title.trim() || !Number.isFinite(discount) || discount <= 0) {
            setErrorMessage('Completa negocio, título y descuento válido');
            return;
        }

        if (!promotionForm.startsAt || !promotionForm.endsAt) {
            setErrorMessage('Debes indicar fecha de inicio y fin');
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
            setSuccessMessage('Promoción creada');
            setPromotionForm((previous) => ({
                ...EMPTY_PROMOTION_FORM,
                businessId: previous.businessId,
            }));
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

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <h1 className="font-display text-3xl font-bold text-gray-900">Dashboard SaaS</h1>
                    <p className="text-gray-500">Métricas, suscripción, promociones y reservas</p>
                </div>
                <Link to="/register-business" className="btn-accent">+ Nuevo Negocio</Link>
            </div>

            {errorMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
            {successMessage && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{successMessage}</div>}

            {loading ? (
                <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>
            ) : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Negocios</p><p className="text-2xl font-bold text-primary-600">{businesses.length}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Verificados</p><p className="text-2xl font-bold text-emerald-600">{verifiedBusinesses}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Vistas</p><p className="text-2xl font-bold text-sky-600">{metrics?.totals.views || 0}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Clics</p><p className="text-2xl font-bold text-indigo-600">{metrics?.totals.clicks || 0}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Conversiones</p><p className="text-2xl font-bold text-amber-600">{metrics?.totals.conversions || 0}</p></div>
                        <div className="card p-4 text-center"><p className="text-xs text-gray-500">Ingresos</p><p className="text-xl font-bold text-emerald-700">{formatCurrency(metrics?.totals.grossRevenue || 0)}</p></div>
                    </div>

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
                            <p className="text-sm text-gray-600 mt-2">
                                Tasa de conversión: <strong>{metrics?.totals.conversionRate || 0}%</strong>
                            </p>
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
                                        <p className="text-xs text-gray-500">
                                            {promotion.discountType === 'PERCENTAGE' ? `${asNumber(promotion.discountValue)}%` : formatCurrency(promotion.discountValue)}
                                            {promotion.couponCode ? ` · ${promotion.couponCode}` : ''}
                                        </p>
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

                    <div className="card p-5">
                        <h2 className="font-display text-lg font-semibold text-gray-900 mb-3">Negocios</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                            {businesses.map((business) => (
                                <Link key={business.id} to={`/businesses/${business.id}`} className="rounded-xl border border-gray-100 p-3 hover:border-primary-200 transition-colors">
                                    <p className="font-medium text-gray-900">{business.name}</p>
                                    <p className="text-xs text-gray-500">{business.verified ? 'Verificado' : 'Pendiente verificación'} · {business._count?.reviews || 0} reseñas</p>
                                </Link>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
