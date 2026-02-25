import { useCallback, useEffect, useMemo, useState } from 'react';
import { usersApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { useAuth } from '../context/useAuth';

type ProfileType = 'USER' | 'BUSINESS_OWNER' | 'ADMIN';

interface UserProfileBase {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    avatarUrl?: string | null;
    role: 'USER' | 'BUSINESS_OWNER' | 'ADMIN';
    createdAt: string;
    updatedAt: string;
}

interface UserReview {
    id: string;
    rating: number;
    comment?: string | null;
    moderationStatus: 'APPROVED' | 'FLAGGED';
    createdAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
    };
}

interface UserBooking {
    id: string;
    status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
    scheduledFor: string;
    quotedAmount?: string | number | null;
    depositAmount?: string | number | null;
    currency: string;
    createdAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
    };
}

interface UserProfileSummary {
    reviewCount: number;
    bookingCount: number;
    recentReviews: UserReview[];
    recentBookings: UserBooking[];
}

interface BusinessProfileOrganization {
    id: string;
    name: string;
    slug: string;
    plan: string;
    subscriptionStatus: string;
    createdAt: string;
    myRole: 'OWNER' | 'MANAGER' | 'STAFF';
    _count: {
        members: number;
        businesses: number;
    };
    businesses: Array<{
        id: string;
        name: string;
        slug: string;
        verified: boolean;
        verificationStatus: string;
        createdAt: string;
        _count: {
            reviews: number;
            bookings: number;
        };
    }>;
}

interface AdminFlaggedReview {
    id: string;
    rating: number;
    comment?: string | null;
    moderationReason?: string | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
    };
    business: {
        id: string;
        name: string;
    };
}

interface AdminLatestOrganization {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    subscriptionStatus: string;
    plan: string;
    _count: {
        businesses: number;
        members: number;
    };
}

interface ProfilePayload {
    profileType: ProfileType;
    user: UserProfileBase;
    userProfile: UserProfileSummary;
    businessProfile?: {
        organizations: BusinessProfileOrganization[];
    };
    adminProfile?: {
        metrics: {
            totalUsers: number;
            totalOrganizations: number;
            totalBusinesses: number;
            totalReviews: number;
            totalBookings: number;
            totalTransactions: number;
        };
        flaggedReviews: AdminFlaggedReview[];
        latestOrganizations: AdminLatestOrganization[];
    };
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString('es-DO');
}

function formatMoney(value: string | number | null | undefined, currency = 'DOP') {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
}

function getRoleBadge(profileType: ProfileType) {
    if (profileType === 'ADMIN') {
        return 'bg-red-100 text-red-700';
    }
    if (profileType === 'BUSINESS_OWNER') {
        return 'bg-blue-100 text-blue-700';
    }
    return 'bg-emerald-100 text-emerald-700';
}

export function Profile() {
    const { refreshProfile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [payload, setPayload] = useState<ProfilePayload | null>(null);
    const [form, setForm] = useState({
        name: '',
        phone: '',
        avatarUrl: '',
    });

    const initials = useMemo(() => {
        const source = form.name || payload?.user.name || 'U';
        return source
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('');
    }, [form.name, payload?.user.name]);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        try {
            const response = await usersApi.getMyProfileDetails();
            const loaded = response.data as ProfilePayload;
            setPayload(loaded);
            setForm({
                name: loaded.user.name || '',
                phone: loaded.user.phone || '',
                avatarUrl: loaded.user.avatarUrl || '',
            });
        } catch (error) {
            setPayload(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar tu perfil'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await usersApi.updateMyProfile({
                name: form.name.trim(),
                phone: form.phone.trim() || undefined,
                avatarUrl: form.avatarUrl.trim() || undefined,
            });
            await Promise.all([loadProfile(), refreshProfile()]);
            setSuccessMessage('Perfil actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar tu perfil'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h1 className="font-display text-3xl font-bold text-gray-900">Mi Perfil</h1>
                    <p className="text-sm text-gray-500">Vista personalizada segun tu rol en la plataforma.</p>
                </div>
                {payload?.profileType && (
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${getRoleBadge(payload.profileType)}`}>
                        {payload.profileType}
                    </span>
                )}
            </div>

            {errorMessage && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                </div>
            )}

            {successMessage && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {successMessage}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
            ) : !payload ? null : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        <div className="card p-5 xl:col-span-2">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Datos de cuenta</h2>
                            <form className="space-y-3" onSubmit={handleSubmit}>
                                <input
                                    className="input-field text-sm"
                                    placeholder="Nombre"
                                    value={form.name}
                                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                                />
                                <input
                                    className="input-field text-sm"
                                    type="tel"
                                    placeholder="Telefono"
                                    value={form.phone}
                                    onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
                                />
                                <input
                                    className="input-field text-sm"
                                    type="url"
                                    placeholder="URL de foto de perfil"
                                    value={form.avatarUrl}
                                    onChange={(event) => setForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                                />
                                <button type="submit" className="btn-primary text-sm" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </form>
                        </div>

                        <div className="card p-5">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Resumen</h2>
                            <div className="flex items-center gap-3 mb-4">
                                {form.avatarUrl ? (
                                    <img
                                        src={form.avatarUrl}
                                        alt={payload.user.name}
                                        className="w-14 h-14 rounded-full object-cover border border-gray-200"
                                    />
                                ) : (
                                    <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 font-semibold flex items-center justify-center">
                                        {initials}
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold text-gray-900">{payload.user.name}</p>
                                    <p className="text-xs text-gray-500">{payload.user.email}</p>
                                </div>
                            </div>
                            <div className="space-y-1 text-sm text-gray-600">
                                <p>Resenas publicadas: <strong className="text-gray-900">{payload.userProfile.reviewCount}</strong></p>
                                <p>Reservas creadas: <strong className="text-gray-900">{payload.userProfile.bookingCount}</strong></p>
                                <p>Creado: <strong className="text-gray-900">{formatDateTime(payload.user.createdAt)}</strong></p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="card p-5">
                            <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Mis resenas</h3>
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {payload.userProfile.recentReviews.length > 0 ? payload.userProfile.recentReviews.map((review) => (
                                    <div key={review.id} className="rounded-xl border border-gray-100 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium text-gray-900">{review.business.name}</p>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{review.rating}/5</span>
                                        </div>
                                        <p className="text-xs text-gray-500">{formatDateTime(review.createdAt)} · {review.moderationStatus}</p>
                                        <p className="text-sm text-gray-700 mt-1">{review.comment?.trim() || '(Sin comentario)'}</p>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">Aun no tienes resenas publicadas.</p>
                                )}
                            </div>
                        </div>

                        <div className="card p-5">
                            <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Mis reservas</h3>
                            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                {payload.userProfile.recentBookings.length > 0 ? payload.userProfile.recentBookings.map((booking) => (
                                    <div key={booking.id} className="rounded-xl border border-gray-100 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-medium text-gray-900">{booking.business.name}</p>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{booking.status}</span>
                                        </div>
                                        <p className="text-xs text-gray-500">{formatDateTime(booking.scheduledFor)}</p>
                                        <p className="text-sm text-gray-700 mt-1">
                                            Cotizado: {formatMoney(booking.quotedAmount, booking.currency)}
                                            {' · '}
                                            Deposito: {formatMoney(booking.depositAmount, booking.currency)}
                                        </p>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">Aun no tienes reservas registradas.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile && (
                        <div className="card p-5">
                            <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Perfil de negocio</h3>
                            <div className="space-y-3">
                                {payload.businessProfile.organizations.length > 0 ? payload.businessProfile.organizations.map((organization) => (
                                    <div key={organization.id} className="rounded-xl border border-gray-100 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-gray-900">{organization.name}</p>
                                                <p className="text-xs text-gray-500">{organization.plan} · {organization.subscriptionStatus} · Rol {organization.myRole}</p>
                                            </div>
                                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                                                {organization._count.businesses} negocios · {organization._count.members} miembros
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {organization.businesses.map((business) => (
                                                <div key={business.id} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                                    <p className="font-medium text-gray-900">{business.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {business.verified ? 'Verificado' : business.verificationStatus}
                                                        {' · '}
                                                        {business._count.reviews} resenas
                                                        {' · '}
                                                        {business._count.bookings} reservas
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">No tienes organizaciones vinculadas.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {payload.profileType === 'ADMIN' && payload.adminProfile && (
                        <div className="space-y-6">
                            <div className="card p-5">
                                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Perfil admin</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">Usuarios</p>
                                        <p className="text-2xl font-semibold text-gray-900">{payload.adminProfile.metrics.totalUsers}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">Organizaciones</p>
                                        <p className="text-2xl font-semibold text-gray-900">{payload.adminProfile.metrics.totalOrganizations}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">Negocios</p>
                                        <p className="text-2xl font-semibold text-gray-900">{payload.adminProfile.metrics.totalBusinesses}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">Resenas</p>
                                        <p className="text-2xl font-semibold text-gray-900">{payload.adminProfile.metrics.totalReviews}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">Reservas</p>
                                        <p className="text-2xl font-semibold text-gray-900">{payload.adminProfile.metrics.totalBookings}</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                                        <p className="text-xs text-gray-500">Transacciones</p>
                                        <p className="text-2xl font-semibold text-gray-900">{payload.adminProfile.metrics.totalTransactions}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="card p-5">
                                    <h4 className="font-display text-base font-semibold text-gray-900 mb-3">Resenas en riesgo</h4>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {payload.adminProfile.flaggedReviews.length > 0 ? payload.adminProfile.flaggedReviews.map((review) => (
                                            <div key={review.id} className="rounded-xl border border-gray-100 p-3">
                                                <p className="font-medium text-gray-900">{review.business.name} · {review.user.name}</p>
                                                <p className="text-xs text-gray-500">{formatDateTime(review.createdAt)} · rating {review.rating}/5</p>
                                                <p className="text-sm text-gray-700 mt-1">{review.comment?.trim() || '(Sin comentario)'}</p>
                                                {review.moderationReason ? (
                                                    <p className="text-xs text-red-700 mt-1">{review.moderationReason}</p>
                                                ) : null}
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay resenas en riesgo.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="card p-5">
                                    <h4 className="font-display text-base font-semibold text-gray-900 mb-3">Ultimas organizaciones</h4>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {payload.adminProfile.latestOrganizations.length > 0 ? payload.adminProfile.latestOrganizations.map((organization) => (
                                            <div key={organization.id} className="rounded-xl border border-gray-100 p-3">
                                                <p className="font-medium text-gray-900">{organization.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {organization.plan} · {organization.subscriptionStatus} · {formatDateTime(organization.createdAt)}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {organization._count.businesses} negocios · {organization._count.members} miembros
                                                </p>
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay organizaciones recientes.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
