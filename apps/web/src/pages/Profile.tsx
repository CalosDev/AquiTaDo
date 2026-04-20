import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { uploadApi, usersApi } from '../api/endpoints';
import { getApiErrorMessage } from '../api/error';
import { ChangePasswordCard } from '../components/ChangePasswordCard';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import {
    ActionBar,
    AppCard,
    DashboardContentLayout,
    DataTableWrapper,
    EmptyState,
    FieldHint,
    FormSection,
    InfoList,
    InlineNotice,
    InsightCard,
    LoadingState,
    MetricCard,
    PageIntroCompact,
    PageShell,
    QueueCard,
    SplitPanelLayout,
    StatGroup,
    StatusCard,
    StickyFormActions,
    Toolbar,
} from '../components/ui';
import type { UserRole } from '../auth/roles';
import { useAuth } from '../context/useAuth';
import { useTimedMessage } from '../hooks/useTimedMessage';
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

interface MetricItem {
    label: string;
    value: ReactNode;
    delta?: ReactNode;
}

interface StatItem {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
}

function formatDateTime(value: string) {
    return formatDateTimeDo(value);
}

function formatMoney(value: string | number | null | undefined, currency = 'DOP') {
    return formatCurrencyDo(value, currency);
}

function humanizeEnum(value: string | null | undefined) {
    if (!value) {
        return 'No definido';
    }

    return value
        .toLowerCase()
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function getProfileTypeLabel(profileType: ProfileType) {
    if (profileType === 'ADMIN') {
        return 'Administrador';
    }
    if (profileType === 'BUSINESS_OWNER') {
        return 'Dueno de negocio';
    }
    return 'Cliente';
}

function getProfileDescription(profileType: ProfileType | null) {
    if (profileType === 'ADMIN') {
        return 'Cuida tu acceso, revisa la operacion general y mantente cerca de lo que necesita atencion.';
    }
    if (profileType === 'BUSINESS_OWNER') {
        return 'Actualiza tu cuenta, revisa tu relacion con el negocio y manten ordenado tu acceso diario.';
    }
    return 'Gestiona tu cuenta, tu historial y las acciones rapidas que mas usas desde un mismo lugar.';
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

function getBookingStatusLabel(status: UserBooking['status']) {
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

function getBookingStatusTone(status: UserBooking['status']) {
    switch (status) {
        case 'COMPLETED':
            return 'bg-emerald-100 text-emerald-700';
        case 'CONFIRMED':
            return 'bg-sky-100 text-sky-700';
        case 'CANCELED':
        case 'NO_SHOW':
            return 'bg-rose-100 text-rose-700';
        default:
            return 'bg-amber-100 text-amber-800';
    }
}

function getModerationLabel(status: UserReview['moderationStatus']) {
    return status === 'APPROVED' ? 'Visible' : 'En revision';
}

function getModerationTone(status: UserReview['moderationStatus']) {
    return status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800';
}

function getVerificationLabel(verified: boolean, verificationStatus: string) {
    if (verified) {
        return 'Verificado';
    }

    return humanizeEnum(verificationStatus);
}

function getVerificationTone(verified: boolean) {
    return verified ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700';
}

function getProfileHighlights(payload: ProfilePayload): MetricItem[] {
    if (payload.profileType === 'ADMIN' && payload.adminProfile) {
        return [
            {
                label: 'Usuarios activos',
                value: payload.adminProfile.metrics.totalUsers,
                delta: 'Cuentas vivas en la plataforma',
            },
            {
                label: 'Negocios publicados',
                value: payload.adminProfile.metrics.totalBusinesses,
                delta: 'Fichas visibles y operando',
            },
            {
                label: 'Organizaciones',
                value: payload.adminProfile.metrics.totalOrganizations,
                delta: 'Equipos y marcas gestionadas',
            },
        ];
    }

    if (payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile) {
        const organizationCount = payload.businessProfile.organizations.length;
        const businessCount = payload.businessProfile.organizations.reduce(
            (total, organization) => total + organization._count.businesses,
            0,
        );

        return [
            {
                label: 'Organizaciones',
                value: organizationCount,
                delta: 'Equipos donde participas hoy',
            },
            {
                label: 'Negocios a cargo',
                value: businessCount,
                delta: 'Fichas bajo tu supervision',
            },
            {
                label: 'Miembro desde',
                value: formatDateTime(payload.user.createdAt),
                delta: 'Antiguedad de tu cuenta',
            },
        ];
    }

    return [
        {
            label: 'Resenas publicadas',
            value: payload.userProfile.reviewCount,
            delta: 'Tu voz dentro del directorio',
        },
        {
            label: 'Reservas creadas',
            value: payload.userProfile.bookingCount,
            delta: 'Seguimiento de tus solicitudes',
        },
        {
            label: 'Miembro desde',
            value: formatDateTime(payload.user.createdAt),
            delta: 'Tiempo usando AquiTaDo',
        },
    ];
}

function getProfileSnapshot(payload: ProfilePayload): StatItem[] {
    if (payload.profileType === 'ADMIN' && payload.adminProfile) {
        return [
            {
                label: 'Moderacion',
                value: payload.adminProfile.metrics.totalReviews,
                detail: 'Resenas controladas desde operaciones',
            },
            {
                label: 'Reservas',
                value: payload.adminProfile.metrics.totalBookings,
                detail: 'Solicitudes monitoreadas en la plataforma',
            },
            {
                label: 'Transacciones',
                value: payload.adminProfile.metrics.totalTransactions,
                detail: 'Movimientos registrados en el sistema',
            },
        ];
    }

    if (payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile) {
        const memberCount = payload.businessProfile.organizations.reduce(
            (total, organization) => total + organization._count.members,
            0,
        );

        return [
            {
                label: 'Equipo',
                value: memberCount,
                detail: 'Personas vinculadas a tus organizaciones',
            },
            {
                label: 'Rol actual',
                value: humanizeEnum(payload.businessProfile.organizations[0]?.myRole ?? 'owner'),
                detail: 'Tu tipo de acceso predominante hoy',
            },
            {
                label: 'Ultima actualizacion',
                value: formatDateTime(payload.user.updatedAt),
                detail: 'Cambio mas reciente en tu cuenta',
            },
        ];
    }

    return [
        {
            label: 'Correo',
            value: 'Activo',
            detail: 'Tu cuenta puede recibir mensajes y recuperacion',
        },
        {
            label: 'Ultima actualizacion',
            value: formatDateTime(payload.user.updatedAt),
            detail: 'Refleja cambios en datos o foto de perfil',
        },
        {
            label: 'Acceso',
            value: 'Listo',
            detail: 'Tu cuenta esta preparada para seguir explorando',
        },
    ];
}

function getProfileInfoItems(payload: ProfilePayload, name: string, phone: string) {
    return [
        {
            label: 'Nombre visible',
            value: name.trim() || payload.user.name,
        },
        {
            label: 'Correo',
            value: payload.user.email,
            hint: 'Lo usamos para acceso, soporte y avisos de seguridad.',
        },
        {
            label: 'Telefono',
            value: phone.trim() || 'Todavia no lo has agregado',
            hint: 'Solo se muestra en experiencias donde ayuda a coordinar mejor.',
        },
        {
            label: 'Tipo de cuenta',
            value: getProfileTypeLabel(payload.profileType),
            hint: 'Define la vista y permisos que ves dentro de la plataforma.',
        },
    ];
}

function getAdminMetricCards(adminProfile: NonNullable<ProfilePayload['adminProfile']>): MetricItem[] {
    const { metrics } = adminProfile;

    return [
        {
            label: 'Usuarios',
            value: metrics.totalUsers,
            delta: 'Cuentas registradas',
        },
        {
            label: 'Organizaciones',
            value: metrics.totalOrganizations,
            delta: 'Equipos activos',
        },
        {
            label: 'Negocios',
            value: metrics.totalBusinesses,
            delta: 'Catalogo vivo',
        },
        {
            label: 'Resenas',
            value: metrics.totalReviews,
            delta: 'Contenido bajo seguimiento',
        },
        {
            label: 'Reservas',
            value: metrics.totalBookings,
            delta: 'Solicitudes monitoreadas',
        },
        {
            label: 'Transacciones',
            value: metrics.totalTransactions,
            delta: 'Movimientos registrados',
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

    const heroProfileType = useMemo(
        () => payload?.profileType ?? resolveProfileTypeFromRole(user?.role),
        [payload?.profileType, user?.role],
    );

    const profileHighlights = useMemo(
        () => (payload ? getProfileHighlights(payload) : []),
        [payload],
    );
    const profileSnapshot = useMemo(
        () => (payload ? getProfileSnapshot(payload) : []),
        [payload],
    );
    const profileInfoItems = useMemo(
        () => (payload ? getProfileInfoItems(payload, form.name, form.phone) : []),
        [form.name, form.phone, payload],
    );
    const adminMetricCards = useMemo(
        () => (payload?.profileType === 'ADMIN' && payload.adminProfile ? getAdminMetricCards(payload.adminProfile) : []),
        [payload],
    );

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

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

    const topActions = (
        <ActionBar>
            <button type="button" className="btn-secondary text-sm" onClick={() => void loadProfile()} disabled={loading}>
                Recargar datos
            </button>
            {heroProfileType === 'ADMIN' ? (
                <>
                    <Link to="/security" className="btn-secondary text-sm">
                        Abrir seguridad
                    </Link>
                    <Link to="/admin" className="btn-primary text-sm">
                        Ir al panel admin
                    </Link>
                </>
            ) : heroProfileType === 'BUSINESS_OWNER' ? (
                <>
                    <Link to="/businesses" className="btn-secondary text-sm">
                        Ver catalogo
                    </Link>
                    <Link to="/dashboard" className="btn-primary text-sm">
                        Ir al panel negocio
                    </Link>
                </>
            ) : (
                <Link to="/businesses" className="btn-primary text-sm">
                    Explorar negocios
                </Link>
            )}
        </ActionBar>
    );

    return (
        <PageShell width="wide" className="py-10">
            <PageFeedbackStack
                items={[
                    { id: 'profile-error', tone: 'danger', text: errorMessage },
                    { id: 'profile-success', tone: 'info', text: successMessage },
                ]}
            />

            <AppCard className="space-y-5">
                <PageIntroCompact
                    eyebrow={heroProfileType ? getProfileTypeLabel(heroProfileType) : 'Tu cuenta'}
                    title="Mi perfil"
                    description={getProfileDescription(heroProfileType)}
                />

                <Toolbar
                    leading={(
                        <p className="max-w-3xl text-sm leading-6 text-slate-600">
                            Desde aqui puedes mantener tus datos al dia, cuidar tu acceso y revisar el contexto que mas importa segun tu rol.
                        </p>
                    )}
                    trailing={topActions}
                />

                {loading ? (
                    <LoadingState label="Cargando tu perfil..." />
                ) : payload ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {profileHighlights.map((item) => (
                            <MetricCard key={item.label} label={item.label} value={item.value} delta={item.delta} />
                        ))}
                    </div>
                ) : null}
            </AppCard>

            {loading ? (
                <AppCard>
                    <LoadingState label="Preparando tu espacio..." />
                </AppCard>
            ) : !payload ? null : (
                <>
                    <DashboardContentLayout
                        primary={(
                            <div className="space-y-5">
                                <AppCard
                                    title="Datos de cuenta"
                                    description="Actualiza tu nombre, telefono y foto sin entrar a pantallas tecnicas."
                                >
                                    <form className="space-y-5" onSubmit={handleSubmit}>
                                        <FormSection
                                            title="Informacion personal"
                                            description="Estos datos ayudan a identificarte mejor dentro de la plataforma."
                                        >
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div>
                                                    <label htmlFor="profile-name" className="mb-1 block text-sm font-medium text-slate-700">
                                                        Nombre visible
                                                    </label>
                                                    <input
                                                        id="profile-name"
                                                        className="input-field text-sm"
                                                        placeholder="Tu nombre"
                                                        value={form.name}
                                                        onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor="profile-phone" className="mb-1 block text-sm font-medium text-slate-700">
                                                        Telefono
                                                    </label>
                                                    <input
                                                        id="profile-phone"
                                                        className="input-field text-sm"
                                                        type="tel"
                                                        placeholder="Tu telefono"
                                                        value={form.phone}
                                                        onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                            <FieldHint>
                                                Tu correo se mantiene como llave de acceso y soporte, por eso lo mostramos en el resumen y no aqui.
                                            </FieldHint>
                                        </FormSection>

                                        <FormSection
                                            title="Foto de perfil"
                                            description="Una imagen clara ayuda a que la cuenta se sienta mas cercana y facil de reconocer."
                                        >
                                            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
                                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                                    <div className="flex items-center gap-4">
                                                        {currentAvatarUrl ? (
                                                            <img
                                                                src={currentAvatarUrl}
                                                                alt={payload.user.name}
                                                                className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                                                            />
                                                        ) : (
                                                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
                                                                {initials}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">
                                                                {form.name.trim() || payload.user.name}
                                                            </p>
                                                            <p className="text-sm text-slate-500">{payload.user.email}</p>
                                                        </div>
                                                    </div>

                                                    <ActionBar>
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
                                                    </ActionBar>
                                                </div>

                                                <FieldHint className="mt-3">
                                                    Aceptamos JPG, PNG y WebP de hasta 5 MB.
                                                </FieldHint>
                                            </div>
                                        </FormSection>

                                        <StickyFormActions>
                                            <button type="submit" className="btn-primary text-sm" disabled={saving}>
                                                {saving ? 'Guardando...' : 'Guardar cambios'}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-secondary text-sm"
                                                onClick={() => void loadProfile()}
                                                disabled={saving}
                                            >
                                                Volver a cargar
                                            </button>
                                        </StickyFormActions>
                                    </form>
                                </AppCard>

                                <ChangePasswordCard />
                            </div>
                        )}
                        secondary={(
                            <div className="space-y-5">
                                <StatusCard
                                    title="Resumen de tu cuenta"
                                    description="Una vista corta para saber como esta tu acceso ahora mismo."
                                >
                                    <div className="mb-4 flex items-center gap-4">
                                        {currentAvatarUrl ? (
                                            <img
                                                src={currentAvatarUrl}
                                                alt={payload.user.name}
                                                className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-lg font-semibold text-primary-700">
                                                {initials}
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900">
                                                {form.name.trim() || payload.user.name}
                                            </p>
                                            <p className="text-sm text-slate-500">{payload.user.email}</p>
                                        </div>
                                    </div>

                                    <InfoList items={profileInfoItems} />
                                </StatusCard>

                                <InsightCard
                                    title="Panorama rapido"
                                    description="Tres puntos para ubicarte rapido sin leer demasiado."
                                >
                                    <StatGroup items={profileSnapshot} />
                                </InsightCard>
                            </div>
                        )}
                    />

                    {payload.profileType === 'USER' ? (
                        <SplitPanelLayout
                            primary={(
                                <DataTableWrapper
                                    title="Tus resenas recientes"
                                    description="Lo ultimo que has compartido dentro del directorio."
                                    footer="Mantener tus resenas claras ayuda a otros usuarios a decidir mejor."
                                >
                                    {payload.userProfile.recentReviews.length > 0 ? (
                                        <div className="space-y-3">
                                            {payload.userProfile.recentReviews.map((review) => (
                                                <div
                                                    key={review.id}
                                                    className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">{review.business.name}</p>
                                                            <p className="mt-1 text-xs text-slate-500">{formatDateTime(review.createdAt)}</p>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getModerationTone(review.moderationStatus)}`}>
                                                                {getModerationLabel(review.moderationStatus)}
                                                            </span>
                                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                                {review.rating}/5
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="mt-3 text-sm leading-6 text-slate-600">
                                                        {review.comment?.trim() || 'Sin comentario adicional.'}
                                                    </p>
                                                    <div className="mt-4">
                                                        <Link
                                                            to={`/businesses/${review.business.slug}`}
                                                            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                                                        >
                                                            Ver negocio
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            title="Todavia no has publicado resenas"
                                            body="Cuando compartas tu experiencia con un negocio, aparecera aqui para que la retomes rapido."
                                        />
                                    )}
                                </DataTableWrapper>
                            )}
                            secondary={(
                                <QueueCard
                                    title="Tus reservas recientes"
                                    description="Seguimiento corto de tus solicitudes mas nuevas."
                                >
                                    {payload.userProfile.recentBookings.length > 0 ? (
                                        <div className="space-y-3">
                                            {payload.userProfile.recentBookings.map((booking) => (
                                                <div
                                                    key={booking.id}
                                                    className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">{booking.business.name}</p>
                                                            <p className="mt-1 text-xs text-slate-500">{formatDateTime(booking.scheduledFor)}</p>
                                                        </div>
                                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getBookingStatusTone(booking.status)}`}>
                                                            {getBookingStatusLabel(booking.status)}
                                                        </span>
                                                    </div>
                                                    <p className="mt-3 text-sm leading-6 text-slate-600">
                                                        Cotizado: {formatMoney(booking.quotedAmount, booking.currency)}
                                                        {' | '}
                                                        Deposito: {formatMoney(booking.depositAmount, booking.currency)}
                                                    </p>
                                                    <div className="mt-4">
                                                        <Link
                                                            to={`/businesses/${booking.business.slug}`}
                                                            className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                                                        >
                                                            Ver negocio
                                                        </Link>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            title="Todavia no has creado reservas"
                                            body="Cuando hagas una solicitud desde un negocio, podras retomarla aqui."
                                        />
                                    )}
                                </QueueCard>
                            )}
                        />
                    ) : null}

                    {payload.profileType === 'BUSINESS_OWNER' && payload.businessProfile ? (
                        <AppCard
                            title="Tus organizaciones"
                            description="Un resumen limpio de los equipos y negocios donde participas."
                        >
                            {payload.businessProfile.organizations.length > 0 ? (
                                <div className="space-y-4">
                                    {payload.businessProfile.organizations.map((organization) => (
                                        <QueueCard
                                            key={organization.id}
                                            title={organization.name}
                                            description={`${humanizeEnum(organization.plan)} | ${humanizeEnum(organization.subscriptionStatus)} | Rol ${humanizeEnum(organization.myRole)}`}
                                            actions={(
                                                <Link to="/dashboard" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                                                    Abrir panel
                                                </Link>
                                            )}
                                        >
                                            <StatGroup
                                                items={[
                                                    {
                                                        label: 'Negocios',
                                                        value: organization._count.businesses,
                                                        detail: 'Fichas bajo esta organizacion',
                                                    },
                                                    {
                                                        label: 'Miembros',
                                                        value: organization._count.members,
                                                        detail: 'Personas con acceso hoy',
                                                    },
                                                    {
                                                        label: 'Creada',
                                                        value: formatDateTime(organization.createdAt),
                                                        detail: 'Fecha en que se activo la organizacion',
                                                    },
                                                ]}
                                            />

                                            <div className="mt-4 space-y-3">
                                                {organization.businesses.length > 0 ? (
                                                    organization.businesses.map((business) => (
                                                        <div
                                                            key={business.id}
                                                            className="rounded-[20px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5"
                                                        >
                                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                                <div>
                                                                    <p className="text-sm font-semibold text-slate-900">{business.name}</p>
                                                                    <p className="mt-1 text-xs text-slate-500">
                                                                        Creado el {formatDateTime(business.createdAt)}
                                                                    </p>
                                                                </div>
                                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getVerificationTone(business.verified)}`}>
                                                                    {getVerificationLabel(business.verified, business.verificationStatus)}
                                                                </span>
                                                            </div>
                                                            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                                                <div className="rounded-[18px] border border-slate-200/70 bg-slate-50 px-3 py-3">
                                                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Resenas</p>
                                                                    <p className="mt-2 text-sm font-semibold text-slate-900">{business._count.reviews}</p>
                                                                </div>
                                                                <div className="rounded-[18px] border border-slate-200/70 bg-slate-50 px-3 py-3">
                                                                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Reservas</p>
                                                                    <p className="mt-2 text-sm font-semibold text-slate-900">{business._count.bookings}</p>
                                                                </div>
                                                            </div>
                                                            <div className="mt-4">
                                                                <Link
                                                                    to={`/businesses/${business.slug}`}
                                                                    className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                                                                >
                                                                    Ver ficha publica
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <EmptyState
                                                        title="Esta organizacion aun no tiene negocios visibles"
                                                        body="Cuando registres o reclames una ficha, aparecera aqui con su estado actual."
                                                    />
                                                )}
                                            </div>
                                        </QueueCard>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    title="Aun no tienes organizaciones vinculadas"
                                    body="Cuando se te asigne una organizacion o reclames un negocio, lo veras aqui."
                                    action={(
                                        <Link to="/register-business" className="btn-primary inline-flex text-sm">
                                            Registrar negocio
                                        </Link>
                                    )}
                                />
                            )}
                        </AppCard>
                    ) : null}

                    {payload.profileType === 'ADMIN' && payload.adminProfile ? (
                        <div className="space-y-5">
                            <StatusCard
                                title="Seguridad y acceso"
                                description="Separamos el control sensible para que esta vista siga operativa y legible."
                            >
                                <InlineNotice
                                    tone="warning"
                                    title="Acceso administrativo"
                                    body="La configuracion de seguridad avanzada vive en una pantalla aparte para que el perfil no se convierta en una consola tecnica."
                                    action={(
                                        <Link to="/security" className="btn-secondary text-sm">
                                            Abrir seguridad
                                        </Link>
                                    )}
                                />
                            </StatusCard>

                            <AppCard
                                title="Vista operativa"
                                description="Lo principal del ecosistema en un solo barrido visual."
                            >
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {adminMetricCards.map((metric) => (
                                        <MetricCard key={metric.label} label={metric.label} value={metric.value} delta={metric.delta} />
                                    ))}
                                </div>
                            </AppCard>

                            <SplitPanelLayout
                                primary={(
                                    <DataTableWrapper
                                        title="Resenas que requieren atencion"
                                        description="Contenido que conviene revisar antes de que afecte la calidad del catalogo."
                                        footer="Esta vista resume lo urgente; la moderacion completa sigue en el panel admin."
                                    >
                                        {payload.adminProfile.flaggedReviews.length > 0 ? (
                                            <div className="space-y-3">
                                                {payload.adminProfile.flaggedReviews.map((review) => (
                                                    <div
                                                        key={review.id}
                                                        className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5"
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold text-slate-900">
                                                                    {review.business.name}
                                                                </p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    Por {review.user.name} | {formatDateTime(review.createdAt)}
                                                                </p>
                                                            </div>
                                                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                                                {review.rating}/5
                                                            </span>
                                                        </div>
                                                        <p className="mt-3 text-sm leading-6 text-slate-600">
                                                            {review.comment?.trim() || 'Sin comentario adicional.'}
                                                        </p>
                                                        {review.moderationReason ? (
                                                            <p className="mt-3 text-sm font-medium text-rose-700">{review.moderationReason}</p>
                                                        ) : null}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState
                                                title="No hay resenas pendientes en este momento"
                                                body="La cola esta limpia por ahora."
                                            />
                                        )}
                                    </DataTableWrapper>
                                )}
                                secondary={(
                                    <InsightCard
                                        title="Organizaciones recientes"
                                        description="Marcas y equipos nuevos que conviene mirar de cerca."
                                    >
                                        {payload.adminProfile.latestOrganizations.length > 0 ? (
                                            <div className="space-y-3">
                                                {payload.adminProfile.latestOrganizations.map((organization) => (
                                                    <div
                                                        key={organization.id}
                                                        className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4 shadow-sm shadow-slate-900/5"
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <p className="text-sm font-semibold text-slate-900">{organization.name}</p>
                                                                <p className="mt-1 text-xs text-slate-500">
                                                                    {humanizeEnum(organization.plan)} | {humanizeEnum(organization.subscriptionStatus)}
                                                                </p>
                                                            </div>
                                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                                {formatDateTime(organization.createdAt)}
                                                            </span>
                                                        </div>
                                                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                                                            <div className="rounded-[18px] border border-slate-200/70 bg-slate-50 px-3 py-3">
                                                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Negocios</p>
                                                                <p className="mt-2 text-sm font-semibold text-slate-900">{organization._count.businesses}</p>
                                                            </div>
                                                            <div className="rounded-[18px] border border-slate-200/70 bg-slate-50 px-3 py-3">
                                                                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Miembros</p>
                                                                <p className="mt-2 text-sm font-semibold text-slate-900">{organization._count.members}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <EmptyState
                                                title="No hay organizaciones recientes"
                                                body="Cuando entren nuevas marcas o equipos las veras aqui."
                                            />
                                        )}
                                    </InsightCard>
                                )}
                            />
                        </div>
                    ) : null}
                </>
            )}
        </PageShell>
    );
}
