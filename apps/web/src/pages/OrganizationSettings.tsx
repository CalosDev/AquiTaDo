import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { organizationApi } from '../api/endpoints';
import { useOrganization } from '../context/useOrganization';

type OrgRole = 'OWNER' | 'MANAGER' | 'STAFF';
type OrgPlan = 'FREE' | 'GROWTH' | 'SCALE';
type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

const PLAN_LABELS: Record<OrgPlan, string> = {
    FREE: 'Free',
    GROWTH: 'Growth',
    SCALE: 'Scale',
};

const PLAN_DESCRIPTIONS: Record<OrgPlan, string> = {
    FREE: 'Hasta 1 negocio y 3 asientos',
    GROWTH: 'Hasta 5 negocios y 15 asientos',
    SCALE: 'Negocios y asientos ilimitados',
};

interface OrganizationDetail {
    id: string;
    name: string;
    slug: string;
    actorRole: OrgRole;
    isGlobalAdmin: boolean;
    _count?: {
        businesses: number;
        members: number;
        invites: number;
    };
}

interface OrganizationMember {
    organizationId: string;
    userId: string;
    role: OrgRole;
    user: {
        id: string;
        name: string;
        email: string;
    };
}

interface OrganizationInvite {
    id: string;
    organizationId: string;
    email: string;
    role: OrgRole;
    expiresAt: string;
    createdAt: string;
    token?: string;
}

interface OrganizationSubscription {
    id: string;
    name: string;
    slug: string;
    plan: OrgPlan;
    subscriptionStatus: SubscriptionStatus;
    subscriptionRenewsAt: string | null;
    actorRole: OrgRole;
    isGlobalAdmin: boolean;
    limits: {
        maxBusinesses: number | null;
        maxMembers: number | null;
    };
    usage: {
        businesses: number;
        members: number;
        pendingInvites: number;
        allocatedSeats: number;
    };
    remaining: {
        businesses: number | null;
        seats: number | null;
    };
}

interface OrganizationUsage {
    organizationId: string;
    organizationName: string;
    plan: OrgPlan;
    limits: {
        maxBusinesses: number | null;
        maxMembers: number | null;
    };
    usage: {
        businesses: number;
        members: number;
        pendingInvites: number;
        allocatedSeats: number;
    };
    remaining: {
        businesses: number | null;
        seats: number | null;
    };
}

interface OrganizationAuditLog {
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    actorUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

export function OrganizationSettings() {
    const {
        organizations,
        activeOrganization,
        activeOrganizationId,
        setActiveOrganizationId,
        refreshOrganizations,
        loading: loadingOrganizations,
        error: organizationsError,
    } = useOrganization();

    const [organizationName, setOrganizationName] = useState('');
    const [editingName, setEditingName] = useState('');
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [invites, setInvites] = useState<OrganizationInvite[]>([]);
    const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
    const [usage, setUsage] = useState<OrganizationUsage | null>(null);
    const [auditLogs, setAuditLogs] = useState<OrganizationAuditLog[]>([]);
    const [subscriptionForm, setSubscriptionForm] = useState<{
        plan: OrgPlan;
        subscriptionStatus: SubscriptionStatus;
    }>({
        plan: 'FREE',
        subscriptionStatus: 'ACTIVE',
    });
    const [latestInviteToken, setLatestInviteToken] = useState('');
    const latestInviteLink = latestInviteToken
        ? `${window.location.origin}/invites/${latestInviteToken}`
        : '';
    const [inviteForm, setInviteForm] = useState({
        email: '',
        role: 'STAFF' as OrgRole,
    });
    const [organizationDetail, setOrganizationDetail] = useState<OrganizationDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [processing, setProcessing] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const actorRole = organizationDetail?.actorRole ?? null;
    const isGlobalAdmin = organizationDetail?.isGlobalAdmin ?? false;

    const canManageOrganization = isGlobalAdmin || actorRole === 'OWNER' || actorRole === 'MANAGER';
    const canManageMembers = canManageOrganization;
    const canManageSubscription = isGlobalAdmin || actorRole === 'OWNER';

    const inviteRoleOptions = useMemo(() => {
        if (isGlobalAdmin) {
            return ['OWNER', 'MANAGER', 'STAFF'] as OrgRole[];
        }

        if (actorRole === 'OWNER') {
            return ['MANAGER', 'STAFF'] as OrgRole[];
        }

        return ['STAFF'] as OrgRole[];
    }, [actorRole, isGlobalAdmin]);

    const memberRoleOptions = useCallback((targetMemberRole: OrgRole): OrgRole[] => {
        if (isGlobalAdmin) {
            if (targetMemberRole === 'OWNER') {
                return ['OWNER', 'MANAGER', 'STAFF'];
            }
            return ['MANAGER', 'STAFF'];
        }

        if (actorRole === 'OWNER') {
            return ['MANAGER', 'STAFF'];
        }

        return ['STAFF'];
    }, [actorRole, isGlobalAdmin]);

    const loadOrganizationDetail = useCallback(async () => {
        if (!activeOrganizationId) {
            setOrganizationDetail(null);
            setMembers([]);
            setInvites([]);
            setSubscription(null);
            setUsage(null);
            setAuditLogs([]);
            setEditingName('');
            return;
        }

        setLoadingDetail(true);
        setErrorMessage('');

        try {
            const [
                detailResponse,
                membersResponse,
                invitesResponse,
                subscriptionResponse,
                usageResponse,
                auditLogsResponse,
            ] = await Promise.all([
                organizationApi.getById(activeOrganizationId),
                organizationApi.getMembers(activeOrganizationId),
                organizationApi.getInvites(activeOrganizationId),
                organizationApi.getSubscription(activeOrganizationId),
                organizationApi.getUsage(activeOrganizationId),
                organizationApi.getAuditLogs(activeOrganizationId, { limit: 40 }),
            ]);

            setOrganizationDetail(detailResponse.data);
            setMembers(membersResponse.data || []);
            setInvites(invitesResponse.data || []);
            setSubscription(subscriptionResponse.data || null);
            setUsage(usageResponse.data || null);
            setAuditLogs(auditLogsResponse.data || []);
            setSubscriptionForm({
                plan: (subscriptionResponse.data?.plan as OrgPlan) ?? 'FREE',
                subscriptionStatus:
                    (subscriptionResponse.data?.subscriptionStatus as SubscriptionStatus) ?? 'ACTIVE',
            });
            setEditingName(detailResponse.data.name || '');
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo cargar la organización activa'));
        } finally {
            setLoadingDetail(false);
        }
    }, [activeOrganizationId]);

    useEffect(() => {
        void loadOrganizationDetail();
    }, [loadOrganizationDetail]);

    useEffect(() => {
        if (inviteRoleOptions.length > 0 && !inviteRoleOptions.includes(inviteForm.role)) {
            setInviteForm((previous) => ({ ...previous, role: inviteRoleOptions[0] }));
        }
    }, [inviteForm.role, inviteRoleOptions]);

    const handleCreateOrganization = async (event: React.FormEvent) => {
        event.preventDefault();
        const normalizedName = organizationName.trim();
        if (!normalizedName) {
            setErrorMessage('El nombre de la organización es obligatorio');
            return;
        }

        setProcessing('create-organization');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            const response = await organizationApi.create({ name: normalizedName });
            const createdOrganizationId = response.data.id as string;
            await refreshOrganizations(createdOrganizationId);
            setActiveOrganizationId(createdOrganizationId);
            setOrganizationName('');
            setSuccessMessage('Organización creada exitosamente');
            await loadOrganizationDetail();
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo crear la organización'));
        } finally {
            setProcessing(null);
        }
    };

    const handleUpdateOrganization = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!activeOrganizationId) {
            return;
        }

        const normalizedName = editingName.trim();
        if (!normalizedName) {
            setErrorMessage('El nombre de la organización es obligatorio');
            return;
        }

        setProcessing('update-organization');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await organizationApi.update(activeOrganizationId, { name: normalizedName });
            await refreshOrganizations(activeOrganizationId);
            await loadOrganizationDetail();
            setSuccessMessage('Organización actualizada');
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo actualizar la organización'));
        } finally {
            setProcessing(null);
        }
    };

    const handleUpdateSubscription = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!activeOrganizationId) {
            return;
        }

        setProcessing('update-subscription');
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await organizationApi.updateSubscription(activeOrganizationId, {
                plan: subscriptionForm.plan,
                subscriptionStatus: subscriptionForm.subscriptionStatus,
            });
            await refreshOrganizations(activeOrganizationId);
            await loadOrganizationDetail();
            setSuccessMessage('Suscripción actualizada correctamente');
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo actualizar la suscripción'));
        } finally {
            setProcessing(null);
        }
    };

    const handleInviteMember = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!activeOrganizationId) {
            return;
        }

        if (!inviteForm.email.trim()) {
            setErrorMessage('El correo es obligatorio');
            return;
        }

        setProcessing('invite-member');
        setErrorMessage('');
        setSuccessMessage('');
        setLatestInviteToken('');

        try {
            const response = await organizationApi.inviteMember(activeOrganizationId, {
                email: inviteForm.email.trim().toLowerCase(),
                role: inviteForm.role,
            });
            setInviteForm({
                email: '',
                role: inviteRoleOptions[0] ?? 'STAFF',
            });
            await loadOrganizationDetail();
            setLatestInviteToken(response.data.token || '');
            setSuccessMessage('Invitación creada correctamente');
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo crear la invitación'));
        } finally {
            setProcessing(null);
        }
    };

    const handleUpdateMemberRole = async (member: OrganizationMember, role: OrgRole) => {
        if (!activeOrganizationId) {
            return;
        }

        setProcessing(`role-${member.userId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await organizationApi.updateMemberRole(activeOrganizationId, member.userId, { role });
            await loadOrganizationDetail();
            setSuccessMessage('Rol actualizado correctamente');
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo actualizar el rol'));
        } finally {
            setProcessing(null);
        }
    };

    const handleRemoveMember = async (member: OrganizationMember) => {
        if (!activeOrganizationId) {
            return;
        }

        if (!window.confirm(`¿Eliminar a ${member.user.name} de esta organización?`)) {
            return;
        }

        setProcessing(`remove-${member.userId}`);
        setErrorMessage('');
        setSuccessMessage('');

        try {
            await organizationApi.removeMember(activeOrganizationId, member.userId);
            await loadOrganizationDetail();
            setSuccessMessage('Miembro removido correctamente');
        } catch (requestError) {
            setErrorMessage(getApiErrorMessage(requestError, 'No se pudo remover al miembro'));
        } finally {
            setProcessing(null);
        }
    };

    const formatCapacity = (value: number | null) => (value === null ? 'Ilimitado' : String(value));

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 animate-fade-in">
            <h1 className="font-display text-3xl font-bold text-gray-900 mb-2">Organización</h1>
            <p className="text-gray-500 mb-6">Gestiona equipos, roles e invitaciones</p>

            {(organizationsError || errorMessage) && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage || organizationsError}
                </div>
            )}

            {successMessage && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {successMessage}
                </div>
            )}

            {latestInviteToken && (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Invitación generada:{' '}
                    <a href={latestInviteLink} className="underline font-medium break-all">
                        {latestInviteLink}
                    </a>
                </div>
            )}

            <div className="card p-5 mb-6">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Organización activa</label>
                <select
                    className="input-field"
                    value={activeOrganizationId || ''}
                    onChange={(event) => {
                        const value = event.target.value || null;
                        setActiveOrganizationId(value);
                        setSuccessMessage('');
                        setErrorMessage('');
                    }}
                    disabled={loadingOrganizations}
                >
                    {organizations.length === 0 && <option value="">Sin organización</option>}
                    {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                            {organization.name}
                        </option>
                    ))}
                </select>
            </div>

            {organizations.length === 0 && (
                <div className="card p-6 mb-6">
                    <h2 className="font-display text-xl font-semibold text-gray-900 mb-2">Crea tu primera organización</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Necesitas una organización para operar el dashboard multi-tenant.
                    </p>
                    <form onSubmit={handleCreateOrganization} className="flex flex-col sm:flex-row gap-3">
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Nombre de la organización"
                            value={organizationName}
                            onChange={(event) => setOrganizationName(event.target.value)}
                        />
                        <button
                            type="submit"
                            className="btn-primary sm:w-auto"
                            disabled={processing === 'create-organization'}
                        >
                            {processing === 'create-organization' ? 'Creando...' : 'Crear organización'}
                        </button>
                    </form>
                </div>
            )}

            {activeOrganization && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="card p-6">
                            <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">Datos de organización</h2>
                            {loadingDetail ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                </div>
                            ) : (
                                <>
                                    <form onSubmit={handleUpdateOrganization} className="space-y-3">
                                        <div>
                                            <label className="text-sm font-medium text-gray-700 mb-1 block">Nombre</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                value={editingName}
                                                onChange={(event) => setEditingName(event.target.value)}
                                                disabled={!canManageOrganization}
                                            />
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            Slug: <span className="font-mono">{organizationDetail?.slug || activeOrganization.slug}</span>
                                        </div>
                                        {canManageOrganization && (
                                            <button
                                                type="submit"
                                                className="btn-primary text-sm"
                                                disabled={processing === 'update-organization'}
                                            >
                                                {processing === 'update-organization' ? 'Guardando...' : 'Guardar cambios'}
                                            </button>
                                        )}
                                    </form>
                                    <div className="grid grid-cols-3 gap-3 mt-5">
                                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                                            <div className="text-xl font-bold text-primary-600">
                                                {organizationDetail?._count?.businesses ?? activeOrganization._count?.businesses ?? 0}
                                            </div>
                                            <div className="text-xs text-gray-500">Negocios</div>
                                        </div>
                                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                                            <div className="text-xl font-bold text-primary-600">
                                                {organizationDetail?._count?.members ?? activeOrganization._count?.members ?? 0}
                                            </div>
                                            <div className="text-xs text-gray-500">Miembros</div>
                                        </div>
                                        <div className="rounded-lg bg-gray-50 p-3 text-center">
                                            <div className="text-xl font-bold text-primary-600">
                                                {organizationDetail?._count?.invites ?? activeOrganization._count?.invites ?? 0}
                                            </div>
                                            <div className="text-xs text-gray-500">Invitaciones</div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="card p-6">
                            <h2 className="font-display text-xl font-semibold text-gray-900 mb-4">Miembros</h2>
                            {members.length === 0 ? (
                                <p className="text-sm text-gray-400">Aún no hay miembros.</p>
                            ) : (
                                <div className="space-y-3">
                                    {members.map((member) => {
                                        const canEditTarget = canManageMembers && member.role !== 'OWNER';
                                        const roleOptions = memberRoleOptions(member.role);
                                        return (
                                            <div key={member.userId} className="rounded-xl border border-gray-100 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-gray-900">{member.user.name}</p>
                                                    <p className="text-xs text-gray-500">{member.user.email}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="input-field text-sm min-w-[120px]"
                                                        value={member.role}
                                                        disabled={!canEditTarget || processing === `role-${member.userId}`}
                                                        onChange={(event) =>
                                                            void handleUpdateMemberRole(member, event.target.value as OrgRole)
                                                        }
                                                    >
                                                        {roleOptions.map((role) => (
                                                            <option key={role} value={role}>
                                                                {role}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {canEditTarget && (
                                                        <button
                                                            type="button"
                                                            className="text-xs bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                                                            onClick={() => void handleRemoveMember(member)}
                                                            disabled={processing === `remove-${member.userId}`}
                                                        >
                                                            {processing === `remove-${member.userId}` ? 'Eliminando...' : 'Eliminar'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="card p-6">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Plan SaaS</h2>
                            {subscription ? (
                                <form onSubmit={handleUpdateSubscription} className="space-y-3">
                                    <div className="rounded-xl bg-gray-50 p-3">
                                        <p className="text-xs text-gray-500 mb-1">Plan actual</p>
                                        <p className="text-sm font-semibold text-gray-900">
                                            {PLAN_LABELS[subscription.plan]} - {PLAN_DESCRIPTIONS[subscription.plan]}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600 mb-1 block">Plan</label>
                                        <select
                                            className="input-field text-sm"
                                            value={subscriptionForm.plan}
                                            disabled={!canManageSubscription}
                                            onChange={(event) =>
                                                setSubscriptionForm((previous) => ({
                                                    ...previous,
                                                    plan: event.target.value as OrgPlan,
                                                }))
                                            }
                                        >
                                            <option value="FREE">Free</option>
                                            <option value="GROWTH">Growth</option>
                                            <option value="SCALE">Scale</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600 mb-1 block">Estado</label>
                                        <select
                                            className="input-field text-sm"
                                            value={subscriptionForm.subscriptionStatus}
                                            disabled={!canManageSubscription}
                                            onChange={(event) =>
                                                setSubscriptionForm((previous) => ({
                                                    ...previous,
                                                    subscriptionStatus: event.target.value as SubscriptionStatus,
                                                }))
                                            }
                                        >
                                            <option value="ACTIVE">ACTIVE</option>
                                            <option value="PAST_DUE">PAST_DUE</option>
                                            <option value="CANCELED">CANCELED</option>
                                        </select>
                                    </div>
                                    {canManageSubscription ? (
                                        <button
                                            type="submit"
                                            className="btn-primary w-full text-sm"
                                            disabled={processing === 'update-subscription'}
                                        >
                                            {processing === 'update-subscription' ? 'Guardando...' : 'Actualizar plan'}
                                        </button>
                                    ) : (
                                        <p className="text-xs text-gray-500">
                                            Solo el owner de la organización puede cambiar el plan.
                                        </p>
                                    )}
                                </form>
                            ) : (
                                <p className="text-sm text-gray-500">No se pudo cargar la suscripción.</p>
                            )}
                        </div>

                        <div className="card p-6">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Uso y límites</h2>
                            {usage ? (
                                <div className="space-y-3 text-sm">
                                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                                        <span className="text-gray-600">Negocios</span>
                                        <span className="font-semibold text-gray-900">
                                            {usage.usage.businesses} / {formatCapacity(usage.limits.maxBusinesses)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                                        <span className="text-gray-600">Asientos usados</span>
                                        <span className="font-semibold text-gray-900">
                                            {usage.usage.allocatedSeats} / {formatCapacity(usage.limits.maxMembers)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                                        <span className="text-gray-600">Invitaciones pendientes</span>
                                        <span className="font-semibold text-gray-900">{usage.usage.pendingInvites}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">No hay información de uso disponible.</p>
                            )}
                        </div>

                        <div className="card p-6">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Invitar miembro</h2>
                            {canManageMembers ? (
                                <form onSubmit={handleInviteMember} className="space-y-3">
                                    <div>
                                        <label className="text-xs text-gray-600 mb-1 block">Correo</label>
                                        <input
                                            type="email"
                                            className="input-field text-sm"
                                            value={inviteForm.email}
                                            onChange={(event) =>
                                                setInviteForm((previous) => ({
                                                    ...previous,
                                                    email: event.target.value,
                                                }))
                                            }
                                            placeholder="persona@empresa.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-600 mb-1 block">Rol</label>
                                        <select
                                            className="input-field text-sm"
                                            value={inviteForm.role}
                                            onChange={(event) =>
                                                setInviteForm((previous) => ({
                                                    ...previous,
                                                    role: event.target.value as OrgRole,
                                                }))
                                            }
                                        >
                                            {inviteRoleOptions.map((role) => (
                                                <option key={role} value={role}>
                                                    {role}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn-primary w-full text-sm"
                                        disabled={processing === 'invite-member'}
                                    >
                                        {processing === 'invite-member' ? 'Enviando...' : 'Generar invitación'}
                                    </button>
                                </form>
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Tu rol actual no puede gestionar invitaciones.
                                </p>
                            )}
                        </div>

                        <div className="card p-6">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Invitaciones activas</h2>
                            {invites.length === 0 ? (
                                <p className="text-sm text-gray-400">No hay invitaciones pendientes.</p>
                            ) : (
                                <div className="space-y-3">
                                    {invites.map((invite) => (
                                        <div key={invite.id} className="rounded-xl border border-gray-100 p-3">
                                            <p className="text-sm font-medium text-gray-900">{invite.email}</p>
                                            <p className="text-xs text-gray-500">Rol: {invite.role}</p>
                                            <p className="text-xs text-gray-400">
                                                Expira: {new Date(invite.expiresAt).toLocaleString('es-DO')}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="card p-6">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-4">Actividad reciente</h2>
                            {auditLogs.length === 0 ? (
                                <p className="text-sm text-gray-400">Aún no hay eventos auditados.</p>
                            ) : (
                                <div className="space-y-3">
                                    {auditLogs.slice(0, 8).map((log) => (
                                        <div key={log.id} className="rounded-xl border border-gray-100 p-3">
                                            <p className="text-sm font-medium text-gray-900">
                                                {log.action.split('.').join(' / ')}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {log.actorUser?.email || 'Sistema'} -{' '}
                                                {new Date(log.createdAt).toLocaleString('es-DO')}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="card p-6">
                            <h2 className="font-display text-lg font-semibold text-gray-900 mb-2">Siguiente paso</h2>
                            <p className="text-sm text-gray-500 mb-3">
                                Con organización activa puedes gestionar negocios desde tu dashboard.
                            </p>
                            <Link to="/dashboard" className="btn-secondary text-sm inline-block">
                                Ir al Dashboard
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
