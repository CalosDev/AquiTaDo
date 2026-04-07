import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { uploadApi, usersApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { ChangePasswordCard } from '../components/ChangePasswordCard';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useAuth } from '../context/useAuth';
import type { UserRole } from '../auth/roles';
import { formatCurrencyDo, formatDateTimeDo } from '../lib/market';

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
    return formatDateTimeDo(value);
}

function formatMoney(value: string | number | null | undefined, currency = 'DOP') {
    return formatCurrencyDo(value, currency);
}

function getProfileHeroClass(profileType: ProfileType) {
    if (profileType === 'ADMIN') {
        return 'role-hero role-hero-admin';
    }
    if (profileType === 'BUSINESS_OWNER') {
        return 'role-hero role-hero-owner';
    }
    return 'role-hero role-hero-user';
}

function getProfileTypeLabel(profileType: ProfileType) {
    if (profileType === 'ADMIN') {
        return 'Administrador';
    }
    if (profileType === 'BUSINESS_OWNER') {
        return 'Propietario de negocio';
    }
    return 'Cliente';
}

function resolveProfileTypeFromRole(role: UserRole | undefined): ProfileType | null {
    if (role === 'ADMIN') {
        return 'ADMIN';
    }
    if (role === 'BUSINESS_OWNER') {
        return 'BUSINESS_OWNER';
    }
    if (role === 'USER') {
        return 'USER';
    }
    return null;
}

function getProfileHighlights(payload: ProfilePayload) {
    if (payload.profileType === 'ADMIN' && payload.adminProfile) {
        return [
            { label: 'Usuarios', value: String(payload.adminProfile.metrics.totalUsers) },
            { label: 'Negocios', value: String(payload.adminProfile.metrics.totalBusinesses) },
            { label: 'Organizaciones', value: String(payload.adminProfile.metrics.totalOrganizations) },
        ];
    }

    if (payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile) {
        const organizationCount = payload.businessProfile.organizations.length;
        const businessCount = payload.businessProfile.organizations.reduce(
            (total, organization) => total + organization._count.businesses,
            0,
        );

        return [
            { label: 'Organizaciones', value: String(organizationCount) },
            { label: 'Negocios', value: String(businessCount) },
            { label: 'Miembro desde', value: formatDateTime(payload.user.createdAt), compact: true },
        ];
    }

    return [
        { label: 'Reseñas', value: String(payload.userProfile.reviewCount) },
        { label: 'Reservas', value: String(payload.userProfile.bookingCount) },
        { label: 'Miembro desde', value: formatDateTime(payload.user.createdAt), compact: true },
    ];
}

function getProfileHighlightPlaceholders(profileType: ProfileType) {
    if (profileType === 'ADMIN') {
        return [
            { label: 'Usuarios', value: '', compact: false },
            { label: 'Negocios', value: '', compact: false },
            { label: 'Organizaciones', value: '', compact: false },
        ];
    }

    if (profileType === 'BUSINESS_OWNER') {
        return [
            { label: 'Organizaciones', value: '', compact: false },
            { label: 'Negocios', value: '', compact: false },
            { label: 'Miembro desde', value: '', compact: true },
        ];
    }

    return [
        { label: 'Reseñas', value: '', compact: false },
        { label: 'Reservas', value: '', compact: false },
        { label: 'Miembro desde', value: '', compact: true },
    ];
}

function getProfileSummaryRows(payload: ProfilePayload) {
    if (payload.profileType === 'ADMIN' && payload.adminProfile) {
        return [
            { label: 'Reseñas moderadas', value: String(payload.adminProfile.metrics.totalReviews) },
            { label: 'Reservas monitoreadas', value: String(payload.adminProfile.metrics.totalBookings) },
            { label: 'Transacciones registradas', value: String(payload.adminProfile.metrics.totalTransactions) },
        ];
    }

    if (payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile) {
        const organizationCount = payload.businessProfile.organizations.length;
        const memberCount = payload.businessProfile.organizations.reduce(
            (total, organization) => total + organization._count.members,
            0,
        );
        const businessCount = payload.businessProfile.organizations.reduce(
            (total, organization) => total + organization._count.businesses,
            0,
        );

        return [
            { label: 'Organizaciones activas', value: String(organizationCount) },
            { label: 'Equipo vinculado', value: String(memberCount) },
            { label: 'Negocios gestionados', value: String(businessCount) },
        ];
    }

    return [
        { label: 'Reseñas publicadas', value: String(payload.userProfile.reviewCount) },
        { label: 'Reservas creadas', value: String(payload.userProfile.bookingCount) },
        { label: 'Cuenta creada', value: formatDateTime(payload.user.createdAt) },
    ];
}

function getAdminMetricCards(adminProfile: NonNullable<ProfilePayload['adminProfile']>) {
    const { metrics } = adminProfile;

    return [
        {
            label: 'Usuarios registrados',
            value: String(metrics.totalUsers),
            meta: 'Cuentas creadas en la plataforma',
        },
        {
            label: 'Organizaciones activas',
            value: String(metrics.totalOrganizations),
            meta: 'Equipos y marcas gestionadas',
        },
        {
            label: 'Negocios publicados',
            value: String(metrics.totalBusinesses),
            meta: 'Fichas vivas en el catálogo',
        },
        {
            label: 'Reseñas moderadas',
            value: String(metrics.totalReviews),
            meta: 'Contenido evaluado por confianza',
        },
        {
            label: 'Reservas monitoreadas',
            value: String(metrics.totalBookings),
            meta: 'Solicitudes de atención registradas',
        },
        {
            label: 'Transacciones registradas',
            value: String(metrics.totalTransactions),
            meta: 'Operaciones de cobro contabilizadas',
        },
    ];
}

export function Profile() {
    const { refreshProfile, user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarRemoving, setAvatarRemoving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [payload, setPayload] = useState<ProfilePayload | null>(null);
    const [form, setForm] = useState({
        name: '',
        phone: '',
    });

    const currentAvatarUrl = payload?.user.avatarUrl || null;

    const initials = useMemo(() => {
        const source = form.name || payload?.user.name || 'U';
        return source
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('');
    }, [form.name, payload?.user.name]);
    const profileHighlights = useMemo(
        () => (payload ? getProfileHighlights(payload) : []),
        [payload],
    );
    const profileSummaryRows = useMemo(
        () => (payload ? getProfileSummaryRows(payload) : []),
        [payload],
    );
    const heroProfileType = useMemo(
        () => payload?.profileType ?? resolveProfileTypeFromRole(user?.role),
        [payload?.profileType, user?.role],
    );
    const adminMetricCards = useMemo(
        () => (payload?.profileType === 'ADMIN' && payload.adminProfile ? getAdminMetricCards(payload.adminProfile) : []),
        [payload],
    );

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
            });
        } catch (error) {
            setPayload(null);
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar tu perfil'));
        } finally {
            setLoading(false);
        }
    }, []);

    const syncAvatarUrl = useCallback((nextAvatarUrl: string | null) => {
        setPayload((current) => (
            current
                ? {
                    ...current,
                    user: {
                        ...current.user,
                        avatarUrl: nextAvatarUrl,
                    },
                }
                : current
        ));
    }, []);

    useEffect(() => {
        void loadProfile();
    }, [loadProfile]);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await usersApi.updateMyProfile({
                name: form.name.trim(),
                phone: form.phone.trim() || undefined,
            });
            await Promise.all([loadProfile(), refreshProfile()]);
            setSuccessMessage('Perfil actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar tu perfil'));
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setAvatarUploading(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await uploadApi.uploadAvatar(file);
            const nextAvatarUrl = (response.data as { avatarUrl?: string | null }).avatarUrl ?? null;
            syncAvatarUrl(nextAvatarUrl);
            await refreshProfile();
            setSuccessMessage('Foto de perfil actualizada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo subir tu foto de perfil'));
        } finally {
            setAvatarUploading(false);
        }
    };

    const handleAvatarRemove = async () => {
        if (!currentAvatarUrl) {
            return;
        }

        setAvatarRemoving(true);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await uploadApi.deleteAvatar();
            syncAvatarUrl(null);
            await refreshProfile();
            setSuccessMessage('Foto de perfil eliminada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar tu foto de perfil'));
        } finally {
            setAvatarRemoving(false);
        }
    };

    return (
        <div className="page-shell max-w-6xl py-10">
            <PageFeedbackStack
                items={[
                    { id: 'profile-error', tone: 'danger', text: errorMessage },
                    { id: 'profile-success', tone: 'info', text: successMessage },
                ]}
            />

            {heroProfileType ? (
                <section className={`${getProfileHeroClass(heroProfileType)} mb-6`} aria-busy={loading}>
                    <div className="relative z-[1] flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <div className="kpi-chip-soft w-fit">{getProfileTypeLabel(heroProfileType)}</div>
                            <h1 className="mt-4 font-display text-3xl font-bold text-white md:text-4xl">Mi Perfil</h1>
                            <p className="mt-2 text-sm text-blue-100 md:text-base">
                                Vista personalizada según tu rol en la plataforma, con acceso rápido a tu actividad y configuraciones clave.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[32rem]">
                            {(payload ? profileHighlights : getProfileHighlightPlaceholders(heroProfileType)).map((item) => (
                                <article key={item.label} className="role-kpi-card">
                                    <p className="role-kpi-label">{item.label}</p>
                                    {payload ? (
                                        item.compact ? (
                                            <p className="role-kpi-compact">{item.value}</p>
                                        ) : (
                                            <p className="role-kpi-value">{item.value}</p>
                                        )
                                    ) : (
                                        <div className={item.compact ? 'role-kpi-skeleton-compact' : 'role-kpi-skeleton'} />
                                    )}
                                </article>
                            ))}
                        </div>
                    </div>
                </section>
            ) : (
                <div className="mb-6">
                    <h1 className="font-display text-3xl font-bold text-gray-900">Mi Perfil</h1>
                    <p className="text-sm text-gray-500">Vista personalizada según tu rol en la plataforma.</p>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                </div>
            ) : !payload ? null : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                        <div className="section-shell p-5 xl:col-span-2">
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
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <label
                                            className={`btn-secondary text-sm cursor-pointer ${
                                                avatarUploading || avatarRemoving ? 'pointer-events-none opacity-60' : ''
                                            }`}
                                        >
                                            <input
                                                className="hidden"
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp"
                                                onChange={handleAvatarUpload}
                                                disabled={avatarUploading || avatarRemoving}
                                            />
                                            {avatarUploading
                                                ? 'Subiendo foto...'
                                                : currentAvatarUrl
                                                    ? 'Cambiar foto'
                                                    : 'Subir foto'}
                                        </label>
                                        {currentAvatarUrl ? (
                                            <button
                                                type="button"
                                                className="btn-secondary text-sm"
                                                onClick={handleAvatarRemove}
                                                disabled={avatarUploading || avatarRemoving}
                                            >
                                                {avatarRemoving ? 'Quitando...' : 'Quitar foto'}
                                            </button>
                                        ) : null}
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">
                                        JPG, PNG o WebP. Máximo 5 MB. La foto se guarda desde el sistema, ya no por URL manual.
                                    </p>
                                </div>
                                <button type="submit" className="btn-primary text-sm" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </form>
                        </div>

                        <div className="section-shell p-5">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Resumen del rol</h2>
                            <div className="flex items-center gap-3 mb-4">
                                {currentAvatarUrl ? (
                                    <img
                                        src={currentAvatarUrl}
                                        alt={payload.user.name}
                                        className="w-14 h-14 rounded-full object-cover border border-gray-200"
                                    />
                                ) : (
                                    <div className="w-14 h-14 rounded-full bg-primary-100 text-primary-700 font-semibold flex items-center justify-center">
                                        {initials}
                                    </div>
                                )}
                                <div>
                                    <p className="font-semibold text-gray-900">{form.name.trim() || payload.user.name}</p>
                                    <p className="text-xs text-gray-500">{payload.user.email}</p>
                                </div>
                            </div>
                            <div className="dashboard-summary-list">
                                {profileSummaryRows.map((item) => (
                                    <div key={item.label} className="dashboard-summary-item">
                                        <span className="dashboard-summary-label">{item.label}</span>
                                        <strong className="dashboard-summary-value">{item.value}</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <ChangePasswordCard
                        title="Cambiar contraseña"
                        description="Actualiza tu contraseña de acceso. Al guardar, cerraremos tu sesión para que entres nuevamente con la nueva clave."
                    />

                    {payload.profileType === 'USER' && (
                        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                            <div className="section-shell p-5">
                                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Mis reseñas</h3>
                                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                    {payload.userProfile.recentReviews.length > 0 ? payload.userProfile.recentReviews.map((review) => (
                                        <div key={review.id} className="rounded-xl border border-gray-100 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="font-medium text-gray-900">{review.business.name}</p>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{review.rating}/5</span>
                                            </div>
                                            <p className="text-xs text-gray-500">{formatDateTime(review.createdAt)} - {review.moderationStatus}</p>
                                            <p className="text-sm text-gray-700 mt-1">{review.comment?.trim() || '(Sin comentario)'}</p>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">Aún no tienes reseñas publicadas.</p>
                                    )}
                                </div>
                            </div>

                            <div className="section-shell p-5">
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
                                                {' - '}
                                                Deposito: {formatMoney(booking.depositAmount, booking.currency)}
                                            </p>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-gray-500">Aún no tienes reservas registradas.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile && (
                        <div className="section-shell p-5">
                            <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Perfil de negocio</h3>
                            <div className="space-y-3">
                                {payload.businessProfile.organizations.length > 0 ? payload.businessProfile.organizations.map((organization) => (
                                    <div key={organization.id} className="rounded-xl border border-gray-100 p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="font-semibold text-gray-900">{organization.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {organization.plan} - {organization.subscriptionStatus} - Rol {organization.myRole}
                                                </p>
                                            </div>
                                            <span className="text-xs px-2 py-1 rounded-full bg-primary-100 text-primary-700">
                                                {organization._count.businesses} negocios - {organization._count.members} miembros
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {organization.businesses.map((business) => (
                                                <div key={business.id} className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                                                    <p className="font-medium text-gray-900">{business.name}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {business.verified ? 'Verificado' : business.verificationStatus}
                                                        {' - '}
                                                        {business._count.reviews} reseñas
                                                        {' - '}
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
                            <div className="section-shell p-5">
                                <h3 className="font-display text-lg font-semibold text-gray-900 mb-2">Seguridad de administrador</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    La configuración de 2FA y controles de sesión de admin se gestiona en una pantalla dedicada.
                                </p>
                                <Link to="/security" className="btn-secondary text-sm">
                                    Ir a Seguridad
                                </Link>
                            </div>

                            <div className="section-shell p-5">
                                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Panel administrativo</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {adminMetricCards.map((metric) => (
                                        <article key={metric.label} className="dashboard-stat-card">
                                            <p className="dashboard-stat-label">{metric.label}</p>
                                            <p className="dashboard-stat-value">{metric.value}</p>
                                            <p className="dashboard-stat-meta">{metric.meta}</p>
                                        </article>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="section-shell p-5">
                                    <h4 className="font-display text-base font-semibold text-gray-900 mb-3">Reseñas en riesgo</h4>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {payload.adminProfile.flaggedReviews.length > 0 ? payload.adminProfile.flaggedReviews.map((review) => (
                                            <div key={review.id} className="rounded-xl border border-gray-100 p-3">
                                                <p className="font-medium text-gray-900">{review.business.name} - {review.user.name}</p>
                                                <p className="text-xs text-gray-500">{formatDateTime(review.createdAt)} - rating {review.rating}/5</p>
                                                <p className="text-sm text-gray-700 mt-1">{review.comment?.trim() || '(Sin comentario)'}</p>
                                                {review.moderationReason ? (
                                                    <p className="text-xs text-red-700 mt-1">{review.moderationReason}</p>
                                                ) : null}
                                            </div>
                                        )) : (
                                            <p className="text-sm text-gray-500">No hay reseñas en riesgo.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="section-shell p-5">
                                    <h4 className="font-display text-base font-semibold text-gray-900 mb-3">Últimas organizaciones</h4>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {payload.adminProfile.latestOrganizations.length > 0 ? payload.adminProfile.latestOrganizations.map((organization) => (
                                            <div key={organization.id} className="rounded-xl border border-gray-100 p-3">
                                                <p className="font-medium text-gray-900">{organization.name}</p>
                                                <p className="text-xs text-gray-500">
                                                    {organization.plan} - {organization.subscriptionStatus} - {formatDateTime(organization.createdAt)}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {organization._count.businesses} negocios - {organization._count.members} miembros
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
