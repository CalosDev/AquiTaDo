import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { crmApi, organizationApi } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/error';
import { PageFeedbackStack } from '../../components/PageFeedbackStack';
import { EmptyState, SectionCard, SummaryCard } from '../../components/ui';
import { useOrganization } from '../../context/useOrganization';
import { useTimedMessage } from '../../hooks/useTimedMessage';
import { formatCurrencyDo, formatDateDo, formatDateTimeDo, formatNumberDo } from '../../lib/market';

type OrganizationRole = 'OWNER' | 'MANAGER' | 'STAFF';
type OrganizationPlan = 'FREE' | 'GROWTH' | 'SCALE';
type OrganizationSubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
type CustomerSegment = 'NUEVO' | 'FRECUENTE' | 'VIP';
type SalesLeadStage = 'LEAD' | 'QUOTED' | 'BOOKED' | 'PAID' | 'LOST';

interface PortfolioBusinessOption {
    id: string;
    name: string;
    slug?: string;
}

interface OrganizationDetails {
    id: string;
    name: string;
    slug: string;
    plan: OrganizationPlan;
    subscriptionStatus: OrganizationSubscriptionStatus;
    subscriptionRenewsAt?: string | null;
    actorRole: OrganizationRole;
    ownerUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
    _count?: {
        businesses: number;
        members: number;
        invites: number;
    };
}

interface OrganizationMember {
    organizationId: string;
    userId: string;
    role: OrganizationRole;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
        role: string;
    };
}

interface OrganizationInvite {
    id: string;
    email: string;
    role: OrganizationRole;
    expiresAt: string;
    createdAt: string;
    invitedByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface OrganizationUsageSnapshot {
    organizationId: string;
    organizationName: string;
    plan: OrganizationPlan;
    limits: Record<string, number | null>;
    usage: Record<string, number>;
    remaining: Record<string, number | null>;
}

interface OrganizationAuditLog {
    id: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    createdAt: string;
    actorUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
    metadata?: unknown;
}

interface OrganizationActivityItem {
    id: string;
    category: string;
    categoryTone: string;
    title: string;
    description: string;
    actorLabel: string;
    createdAt: string;
}

interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface CustomerSnapshot {
    user: {
        id: string;
        name: string;
        email: string;
        phone?: string | null;
        createdAt: string;
    };
    segment: CustomerSegment;
    stats: {
        totalBookings: number;
        pendingBookings: number;
        confirmedBookings: number;
        completedBookings: number;
        canceledBookings: number;
        noShowBookings: number;
        totalPurchases: number;
        totalSpent: number;
        totalConversations: number;
        lastActivityAt?: string | null;
    };
}

interface CustomerHistory {
    customer: {
        id: string;
        name: string;
        email: string;
        phone?: string | null;
        createdAt: string;
    };
    segment: CustomerSegment;
    summary: {
        totalBookings: number;
        totalTransactions: number;
        totalConversations: number;
        totalSpent: number;
    };
    bookings: Array<{
        id: string;
        status: string;
        scheduledFor: string;
        partySize?: number | null;
        business?: {
            id: string;
            name: string;
            slug: string;
        } | null;
        promotion?: {
            id: string;
            title: string;
            couponCode?: string | null;
        } | null;
        createdAt: string;
    }>;
    transactions: Array<{
        id: string;
        status: string;
        grossAmount: string | number;
        currency: string;
        createdAt: string;
        business?: {
            id: string;
            name: string;
            slug: string;
        } | null;
        booking?: {
            id: string;
            status: string;
            scheduledFor: string;
        } | null;
    }>;
    conversations: Array<{
        id: string;
        subject?: string | null;
        status: string;
        lastMessageAt: string;
        business?: {
            id: string;
            name: string;
            slug: string;
        } | null;
        convertedBooking?: {
            id: string;
            status: string;
            scheduledFor: string;
        } | null;
        messages: Array<{
            id: string;
            content: string;
            senderRole: string;
            createdAt: string;
            senderUser?: {
                id: string;
                name: string;
                email: string;
            } | null;
        }>;
    }>;
}

interface SalesLead {
    id: string;
    stage: SalesLeadStage;
    title: string;
    notes?: string | null;
    estimatedValue?: string | number | null;
    expectedCloseAt?: string | null;
    closedAt?: string | null;
    lostReason?: string | null;
    createdAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
    };
    customerUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
    conversation?: {
        id: string;
        status: string;
        lastMessageAt?: string | null;
    } | null;
    booking?: {
        id: string;
        status: string;
        scheduledFor?: string | null;
    } | null;
    createdByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface PipelineSummary {
    total: number;
    byStage: Record<SalesLeadStage, number>;
}

interface LeadStageDraft {
    stage: SalesLeadStage;
    lostReason: string;
}

interface OrganizationWorkspaceProps {
    activeOrganizationId: string | null;
    organizationName?: string | null;
    businesses: PortfolioBusinessOption[];
    selectedBusinessId: string;
}

const DEFAULT_PIPELINE_SUMMARY: PipelineSummary = {
    total: 0,
    byStage: {
        LEAD: 0,
        QUOTED: 0,
        BOOKED: 0,
        PAID: 0,
        LOST: 0,
    },
};

const PIPELINE_STAGES: SalesLeadStage[] = ['LEAD', 'QUOTED', 'BOOKED', 'PAID', 'LOST'];

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

function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function toIsoDateTime(value: string): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return undefined;
    }

    return parsed.toISOString();
}

function getRoleTone(role: OrganizationRole): string {
    switch (role) {
        case 'OWNER':
            return 'bg-primary-100 text-primary-700';
        case 'MANAGER':
            return 'bg-blue-100 text-blue-700';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

function getRoleLabel(role: OrganizationRole): string {
    switch (role) {
        case 'OWNER':
            return 'Owner';
        case 'MANAGER':
            return 'Manager';
        default:
            return 'Staff';
    }
}

function getSegmentTone(segment: CustomerSegment): string {
    switch (segment) {
        case 'VIP':
            return 'bg-primary-100 text-primary-700';
        case 'FRECUENTE':
            return 'bg-blue-100 text-blue-700';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

function getStageTone(stage: SalesLeadStage): string {
    switch (stage) {
        case 'PAID':
            return 'bg-primary-100 text-primary-700';
        case 'BOOKED':
            return 'bg-blue-100 text-blue-700';
        case 'QUOTED':
            return 'bg-violet-100 text-violet-700';
        case 'LOST':
            return 'bg-red-100 text-red-700';
        default:
            return 'bg-amber-100 text-amber-800';
    }
}

function getStageLabel(stage: SalesLeadStage): string {
    switch (stage) {
        case 'QUOTED':
            return 'Cotizado';
        case 'BOOKED':
            return 'Reservado';
        case 'PAID':
            return 'Pagado';
        case 'LOST':
            return 'Perdido';
        default:
            return 'Lead';
    }
}

function getSubscriptionTone(status: OrganizationSubscriptionStatus): string {
    switch (status) {
        case 'ACTIVE':
            return 'bg-primary-100 text-primary-700';
        case 'PAST_DUE':
            return 'bg-amber-100 text-amber-800';
        default:
            return 'bg-slate-200 text-slate-700';
    }
}

function getSubscriptionLabel(status: OrganizationSubscriptionStatus): string {
    switch (status) {
        case 'PAST_DUE':
            return 'Pago pendiente';
        case 'CANCELED':
            return 'Cancelada';
        default:
            return 'Activa';
    }
}

function getPlanLabel(plan: OrganizationPlan | string | null | undefined): string {
    switch (plan) {
        case 'FREE':
            return 'Free';
        case 'GROWTH':
            return 'Growth';
        case 'SCALE':
            return 'Scale';
        default:
            return 'plan actual';
    }
}

function getUsageLabel(key: string): string {
    switch (key) {
        case 'businesses':
            return 'Negocios';
        case 'allocatedSeats':
            return 'Asientos usados';
        case 'members':
            return 'Miembros';
        case 'pendingInvites':
            return 'Invites pendientes';
        case 'promotions':
            return 'Promociones';
        case 'adsCampaigns':
            return 'Campanas ads';
        case 'analyticsRetentionDays':
            return 'Retencion analytics';
        case 'imagesPerBusiness':
            return 'Imagenes por negocio';
        default:
            return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
    }
}

function formatUsageValue(value: number | null | undefined): string {
    if (value === null) {
        return 'Ilimitado';
    }
    if (value === undefined) {
        return '--';
    }
    return formatNumberDo(value);
}

function resolveManageableInviteRoles(actorRole?: OrganizationRole | null): OrganizationRole[] {
    if (actorRole === 'MANAGER') {
        return ['STAFF'];
    }
    if (actorRole === 'OWNER') {
        return ['MANAGER', 'STAFF'];
    }
    return [];
}

function getActivityCategoryTone(category: OrganizationActivityItem['category']): string {
    switch (category) {
        case 'Equipo':
            return 'bg-blue-100 text-blue-700';
        case 'Plan':
            return 'bg-amber-100 text-amber-800';
        case 'Negocio':
            return 'bg-primary-100 text-primary-700';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

function asRecordValue(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as Record<string, unknown>;
}

function readMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatOrganizationActivity(log: OrganizationAuditLog): OrganizationActivityItem | null {
    const metadata = asRecordValue(log.metadata);
    const actorLabel = log.actorUser?.name || 'Sistema AquiTa.do';
    const businessSlug = readMetadataString(metadata, 'businessSlug');
    const businessLabel = businessSlug ? ` ${businessSlug}` : ' este negocio';

    switch (log.action) {
        case 'organization.created': {
            const organizationName = readMetadataString(metadata, 'name');
            return {
                id: log.id,
                category: 'Equipo',
                categoryTone: getActivityCategoryTone('Equipo'),
                title: 'Se creo la organizacion',
                description: organizationName
                    ? `El espacio de trabajo quedo listo como ${organizationName}.`
                    : 'El espacio de trabajo quedo listo para empezar a operar.',
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'organization.updated': {
            const organizationName = readMetadataString(metadata, 'name');
            return {
                id: log.id,
                category: 'Equipo',
                categoryTone: getActivityCategoryTone('Equipo'),
                title: 'Se actualizo la organizacion',
                description: organizationName
                    ? `Se ajusto la informacion general y ahora se muestra como ${organizationName}.`
                    : 'Se actualizaron los datos generales de la organizacion.',
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'organization.subscription.updated': {
            const previousPlan = getPlanLabel(readMetadataString(metadata, 'previousPlan'));
            const newPlan = getPlanLabel(readMetadataString(metadata, 'newPlan'));
            const newStatus = readMetadataString(metadata, 'newStatus');
            return {
                id: log.id,
                category: 'Plan',
                categoryTone: getActivityCategoryTone('Plan'),
                title: 'Se actualizo el plan',
                description: newStatus
                    ? `El plan paso de ${previousPlan} a ${newPlan} con estado ${getSubscriptionLabel(newStatus as OrganizationSubscriptionStatus).toLowerCase()}.`
                    : `El plan paso de ${previousPlan} a ${newPlan}.`,
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'organization.invite.created': {
            const email = readMetadataString(metadata, 'email');
            const role = readMetadataString(metadata, 'role');
            return {
                id: log.id,
                category: 'Equipo',
                categoryTone: getActivityCategoryTone('Equipo'),
                title: 'Se envio una invitacion',
                description: email
                    ? `Se invito a ${email}${role ? ` como ${getRoleLabel(role as OrganizationRole).toLowerCase()}` : ''}.`
                    : 'Se genero una nueva invitacion para sumar a alguien al equipo.',
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'organization.invite.accepted': {
            const membershipRole = readMetadataString(metadata, 'membershipRole');
            return {
                id: log.id,
                category: 'Equipo',
                categoryTone: getActivityCategoryTone('Equipo'),
                title: 'Una invitacion fue aceptada',
                description: membershipRole
                    ? `La persona invitada ya se unio al equipo como ${getRoleLabel(membershipRole as OrganizationRole).toLowerCase()}.`
                    : 'La persona invitada ya forma parte del equipo.',
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'organization.member.role_updated': {
            const role = readMetadataString(metadata, 'role');
            return {
                id: log.id,
                category: 'Equipo',
                categoryTone: getActivityCategoryTone('Equipo'),
                title: 'Se actualizo un rol del equipo',
                description: role
                    ? `El miembro ahora tiene rol ${getRoleLabel(role as OrganizationRole).toLowerCase()}.`
                    : 'Se ajusto el rol de un miembro del equipo.',
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'organization.member.removed': {
            const previousRole = readMetadataString(metadata, 'previousRole');
            return {
                id: log.id,
                category: 'Equipo',
                categoryTone: getActivityCategoryTone('Equipo'),
                title: 'Se removio un miembro del equipo',
                description: previousRole
                    ? `La salida corresponde a un perfil ${getRoleLabel(previousRole as OrganizationRole).toLowerCase()}.`
                    : 'Se removio un acceso del equipo activo.',
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'business_claim_request.created':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se envio una solicitud de reclamacion',
                description: `Se registro una solicitud para reclamar${businessLabel}.`,
                actorLabel,
                createdAt: log.createdAt,
            };
        case 'business_claim_request.expired':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Vencio una solicitud de reclamacion',
                description: `La solicitud para reclamar${businessLabel} expiro sin completarse.`,
                actorLabel,
                createdAt: log.createdAt,
            };
        case 'business_claim_request.reviewed': {
            const status = readMetadataString(metadata, 'status');
            const statusMessage = status === 'APPROVED'
                ? 'fue aprobada'
                : status === 'REJECTED'
                    ? 'fue rechazada'
                    : 'quedo en revision';
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se reviso una solicitud de reclamacion',
                description: `La solicitud para reclamar${businessLabel} ${statusMessage}.`,
                actorLabel,
                createdAt: log.createdAt,
            };
        }
        case 'business_ownership.revoked':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se revoco un acceso de negocio',
                description: `Se retiro la administracion asociada a${businessLabel}.`,
                actorLabel,
                createdAt: log.createdAt,
            };
        case 'business.catalog.mark_claimed':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se asigno un negocio a la organizacion',
                description: 'El negocio ya forma parte del portafolio administrado por este equipo.',
                actorLabel,
                createdAt: log.createdAt,
            };
        case 'business.catalog.unclaim':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se desasigno un negocio del portafolio',
                description: 'Ese negocio dejo de estar conectado a la organizacion actual.',
                actorLabel,
                createdAt: log.createdAt,
            };
        case 'business.deleted':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se elimino un negocio',
                description: 'Un negocio del portafolio fue eliminado del directorio activo.',
                actorLabel,
                createdAt: log.createdAt,
            };
        case 'REVIEW_MODERATION_UPDATED':
            return {
                id: log.id,
                category: 'Negocio',
                categoryTone: getActivityCategoryTone('Negocio'),
                title: 'Se actualizo la moderacion de una resena',
                description: 'AquiTa.do actualizo el estado de una resena vinculada al negocio.',
                actorLabel,
                createdAt: log.createdAt,
            };
        default:
            return null;
    }
}

async function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        return false;
    }

    await navigator.clipboard.writeText(text);
    return true;
}

function buildInviteAcceptanceUrl(token: string): string {
    if (typeof window === 'undefined') {
        return token;
    }

    const url = new URL('/app/invite', window.location.origin);
    url.searchParams.set('token', token);
    return url.toString();
}

export function OrganizationWorkspace({
    activeOrganizationId,
    organizationName,
    businesses,
    selectedBusinessId,
}: OrganizationWorkspaceProps) {
    const { refreshOrganizations } = useOrganization();
    const [loading, setLoading] = useState(true);
    const [crmLoading, setCrmLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [actionKey, setActionKey] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [organization, setOrganization] = useState<OrganizationDetails | null>(null);
    const [members, setMembers] = useState<OrganizationMember[]>([]);
    const [invites, setInvites] = useState<OrganizationInvite[]>([]);
    const [usage, setUsage] = useState<OrganizationUsageSnapshot | null>(null);
    const [auditLogs, setAuditLogs] = useState<OrganizationAuditLog[]>([]);

    const [organizationNameDraft, setOrganizationNameDraft] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<OrganizationRole>('STAFF');
    const [lastInviteToken, setLastInviteToken] = useState('');
    const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, OrganizationRole>>({});

    const [customerSearchDraft, setCustomerSearchDraft] = useState('');
    const [customerSearch, setCustomerSearch] = useState('');
    const [crmBusinessFilter, setCrmBusinessFilter] = useState('');
    const [pipelineStageFilter, setPipelineStageFilter] = useState<SalesLeadStage | ''>('');
    const [customers, setCustomers] = useState<PaginatedResponse<CustomerSnapshot>>({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
    });
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerHistory, setCustomerHistory] = useState<CustomerHistory | null>(null);
    const [pipeline, setPipeline] = useState<SalesLead[]>([]);
    const [pipelineSummary, setPipelineSummary] = useState<PipelineSummary>(DEFAULT_PIPELINE_SUMMARY);
    const [leadStageDrafts, setLeadStageDrafts] = useState<Record<string, LeadStageDraft>>({});
    const [leadBusinessId, setLeadBusinessId] = useState('');
    const [leadTitle, setLeadTitle] = useState('');
    const [leadNotes, setLeadNotes] = useState('');
    const [leadEstimatedValue, setLeadEstimatedValue] = useState('');
    const [leadExpectedCloseAt, setLeadExpectedCloseAt] = useState('');

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const actorRole = organization?.actorRole ?? null;
    const canManageOrganization = actorRole === 'OWNER' || actorRole === 'MANAGER';
    const manageableInviteRoles = useMemo(
        () => resolveManageableInviteRoles(actorRole),
        [actorRole],
    );
    const selectedCustomer = useMemo(
        () => customers.data.find((customer) => customer.user.id === selectedCustomerId) || null,
        [customers.data, selectedCustomerId],
    );
    const dominantPipelineStage = useMemo(() => {
        const summaryEntry = PIPELINE_STAGES.reduce<{ stage: SalesLeadStage; count: number } | null>((current, stage) => {
            const count = pipelineSummary.byStage[stage] ?? 0;
            if (!current || count > current.count) {
                return { stage, count };
            }
            return current;
        }, null);

        return summaryEntry && summaryEntry.count > 0 ? summaryEntry : null;
    }, [pipelineSummary]);
    const openPipelineCount = useMemo(
        () => (
            (pipelineSummary.byStage.LEAD ?? 0) +
            (pipelineSummary.byStage.QUOTED ?? 0) +
            (pipelineSummary.byStage.BOOKED ?? 0)
        ),
        [pipelineSummary],
    );
    const orderedUsageKeys = useMemo(() => {
        const priority = [
            'businesses',
            'allocatedSeats',
            'members',
            'pendingInvites',
            'promotions',
            'adsCampaigns',
            'analyticsRetentionDays',
            'imagesPerBusiness',
        ];
        const keys = new Set<string>([
            ...priority,
            ...Object.keys(usage?.limits || {}),
            ...Object.keys(usage?.usage || {}),
            ...Object.keys(usage?.remaining || {}),
        ]);

        return Array.from(keys).filter((key) => (
            key in (usage?.limits || {}) || key in (usage?.usage || {}) || key in (usage?.remaining || {})
        ));
    }, [usage]);
    const organizationActivity = useMemo(
        () => auditLogs
            .map((auditLog) => formatOrganizationActivity(auditLog))
            .filter((activity): activity is OrganizationActivityItem => activity !== null),
        [auditLogs],
    );

    const loadOrganizationState = useCallback(async (options?: { silent?: boolean }) => {
        if (!activeOrganizationId) {
            setOrganization(null);
            setMembers([]);
            setInvites([]);
            setUsage(null);
            setAuditLogs([]);
            setOrganizationNameDraft('');
            setLoading(false);
            return;
        }

        if (!options?.silent) {
            setLoading(true);
        }

        try {
            const [
                organizationResponse,
                membersResponse,
                invitesResponse,
                usageResponse,
                auditLogsResponse,
            ] = await Promise.all([
                organizationApi.getById(activeOrganizationId),
                organizationApi.getMembers(activeOrganizationId),
                organizationApi.getInvites(activeOrganizationId),
                organizationApi.getUsage(activeOrganizationId),
                organizationApi.getAuditLogs(activeOrganizationId, { limit: 12 }),
            ]);

            const nextOrganization = (organizationResponse.data || null) as OrganizationDetails | null;
            const nextMembers = asArray<OrganizationMember>(membersResponse.data);

            setOrganization(nextOrganization);
            setMembers(nextMembers);
            setInvites(asArray<OrganizationInvite>(invitesResponse.data));
            setUsage((usageResponse.data || null) as OrganizationUsageSnapshot | null);
            setAuditLogs(asArray<OrganizationAuditLog>(auditLogsResponse.data));
            setOrganizationNameDraft(nextOrganization?.name || '');
            setMemberRoleDrafts(
                nextMembers.reduce<Record<string, OrganizationRole>>((drafts, member) => {
                    drafts[member.userId] = member.role;
                    return drafts;
                }, {}),
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar la organizacion activa'));
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId]);

    const loadCrmState = useCallback(async (options?: { silent?: boolean }) => {
        if (!activeOrganizationId) {
            setCustomers({
                data: [],
                total: 0,
                page: 1,
                limit: 0,
                totalPages: 0,
            });
            setPipeline([]);
            setPipelineSummary(DEFAULT_PIPELINE_SUMMARY);
            setCustomerHistory(null);
            setCrmLoading(false);
            return;
        }

        if (!options?.silent) {
            setCrmLoading(true);
        }

        try {
            const [
                customersResponse,
                pipelineResponse,
            ] = await Promise.all([
                crmApi.getCustomers({
                    search: customerSearch || undefined,
                    businessId: crmBusinessFilter || undefined,
                    page: 1,
                    limit: 8,
                }),
                crmApi.getPipeline({
                    businessId: crmBusinessFilter || undefined,
                    stage: pipelineStageFilter || undefined,
                    limit: 10,
                }),
            ]);

            const nextCustomers = parsePaginatedResponse<CustomerSnapshot>(customersResponse.data);
            const nextPipelinePayload = (pipelineResponse.data || {}) as {
                data?: SalesLead[];
                summary?: PipelineSummary;
            };
            const nextPipeline = asArray<SalesLead>(nextPipelinePayload.data);

            setCustomers(nextCustomers);
            setPipeline(nextPipeline);
            setPipelineSummary(nextPipelinePayload.summary || DEFAULT_PIPELINE_SUMMARY);
            setLeadStageDrafts(
                nextPipeline.reduce<Record<string, LeadStageDraft>>((drafts, lead) => {
                    drafts[lead.id] = {
                        stage: lead.stage,
                        lostReason: lead.lostReason || '',
                    };
                    return drafts;
                }, {}),
            );
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar CRM y pipeline'));
        } finally {
            setCrmLoading(false);
        }
    }, [activeOrganizationId, crmBusinessFilter, customerSearch, pipelineStageFilter]);

    const loadCustomerHistory = useCallback(async () => {
        if (!selectedCustomerId) {
            setCustomerHistory(null);
            setHistoryLoading(false);
            return;
        }

        setHistoryLoading(true);
        try {
            const response = await crmApi.getCustomerHistory(selectedCustomerId, {
                businessId: crmBusinessFilter || undefined,
            });
            setCustomerHistory((response.data || null) as CustomerHistory | null);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar el historial del cliente'));
        } finally {
            setHistoryLoading(false);
        }
    }, [crmBusinessFilter, selectedCustomerId]);

    useEffect(() => {
        if (!activeOrganizationId) {
            setLoading(false);
            setCrmLoading(false);
            setCrmBusinessFilter('');
            setLeadBusinessId('');
            return;
        }

        setCrmBusinessFilter(selectedBusinessId || '');
        setLeadBusinessId(selectedBusinessId || businesses[0]?.id || '');
    }, [activeOrganizationId, businesses, selectedBusinessId]);

    useEffect(() => {
        void loadOrganizationState();
    }, [loadOrganizationState]);

    useEffect(() => {
        void loadCrmState();
    }, [loadCrmState]);

    useEffect(() => {
        if (!crmLoading && customers.data.length > 0) {
            const exists = customers.data.some((customer) => customer.user.id === selectedCustomerId);
            if (!exists) {
                setSelectedCustomerId(customers.data[0]?.user.id || '');
            }
            return;
        }

        if (!crmLoading && customers.data.length === 0) {
            setSelectedCustomerId('');
            setCustomerHistory(null);
        }
    }, [crmLoading, customers.data, selectedCustomerId]);

    useEffect(() => {
        void loadCustomerHistory();
    }, [loadCustomerHistory]);

    useEffect(() => {
        if (manageableInviteRoles.length === 0) {
            return;
        }

        if (!manageableInviteRoles.includes(inviteRole)) {
            setInviteRole(manageableInviteRoles[0]);
        }
    }, [inviteRole, manageableInviteRoles]);

    const handleRefreshAll = async () => {
        await Promise.all([
            loadOrganizationState({ silent: true }),
            loadCrmState({ silent: true }),
        ]);
        if (selectedCustomerId) {
            await loadCustomerHistory();
        }
        setSuccessMessage('Workspace actualizado');
    };

    const handleOrganizationSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!activeOrganizationId) {
            return;
        }

        setActionKey('organization-update');
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await organizationApi.update(activeOrganizationId, {
                name: organizationNameDraft.trim(),
            });
            await loadOrganizationState({ silent: true });
            await refreshOrganizations(activeOrganizationId);
            setSuccessMessage('Nombre de organizacion actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la organizacion'));
        } finally {
            setActionKey('');
        }
    };

    const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!activeOrganizationId) {
            return;
        }

        setActionKey('organization-invite');
        setErrorMessage('');
        setSuccessMessage('');
        try {
            const response = await organizationApi.inviteMember(activeOrganizationId, {
                email: inviteEmail.trim(),
                role: inviteRole,
            });
            const payload = (response.data || {}) as { token?: string };
            setInviteEmail('');
            setLastInviteToken(payload.token || '');
            await loadOrganizationState({ silent: true });
            await refreshOrganizations(activeOrganizationId);
            setSuccessMessage('Invitacion creada. Copia el token y compartelo con tu equipo.');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la invitacion'));
        } finally {
            setActionKey('');
        }
    };

    const handleCopyInviteToken = async () => {
        if (!lastInviteToken) {
            return;
        }

        const inviteUrl = buildInviteAcceptanceUrl(lastInviteToken);

        try {
            const copied = await copyToClipboard(inviteUrl);
            setSuccessMessage(copied ? 'Enlace de invitacion copiado al portapapeles' : `Comparte este enlace: ${inviteUrl}`);
        } catch {
            setSuccessMessage(`Comparte este enlace: ${inviteUrl}`);
        }
    };

    const handleMemberRoleUpdate = async (member: OrganizationMember) => {
        if (!activeOrganizationId) {
            return;
        }

        const nextRole = memberRoleDrafts[member.userId];
        if (!nextRole || nextRole === member.role) {
            setSuccessMessage('Ese miembro ya tiene ese rol');
            return;
        }

        setActionKey(`member-role-${member.userId}`);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await organizationApi.updateMemberRole(activeOrganizationId, member.userId, {
                role: nextRole,
            });
            await loadOrganizationState({ silent: true });
            setSuccessMessage(`Rol actualizado para ${member.user.name}`);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar el rol del miembro'));
        } finally {
            setActionKey('');
        }
    };

    const handleMemberRemoval = async (member: OrganizationMember) => {
        if (!activeOrganizationId) {
            return;
        }

        const confirmed = window.confirm(`Se removera a ${member.user.name} del equipo activo. Deseas continuar?`);
        if (!confirmed) {
            return;
        }

        setActionKey(`member-remove-${member.userId}`);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await organizationApi.removeMember(activeOrganizationId, member.userId);
            await loadOrganizationState({ silent: true });
            await refreshOrganizations(activeOrganizationId);
            setSuccessMessage(`${member.user.name} fue removido del equipo`);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo remover al miembro'));
        } finally {
            setActionKey('');
        }
    };

    const handleCustomersSearch = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setCustomerSearch(customerSearchDraft.trim());
    };

    const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!leadBusinessId) {
            setErrorMessage('Selecciona un negocio para crear el lead');
            return;
        }

        setActionKey('crm-create-lead');
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await crmApi.createLead({
                businessId: leadBusinessId,
                customerUserId: selectedCustomerId || undefined,
                title: leadTitle.trim(),
                notes: leadNotes.trim() || undefined,
                estimatedValue: parseOptionalNumber(leadEstimatedValue),
                expectedCloseAt: toIsoDateTime(leadExpectedCloseAt),
            });
            setLeadTitle('');
            setLeadNotes('');
            setLeadEstimatedValue('');
            setLeadExpectedCloseAt('');
            await loadCrmState({ silent: true });
            if (selectedCustomerId) {
                await loadCustomerHistory();
            }
            setSuccessMessage('Lead agregado al pipeline');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear el lead'));
        } finally {
            setActionKey('');
        }
    };

    const handleLeadStageUpdate = async (lead: SalesLead) => {
        const draft = leadStageDrafts[lead.id];
        if (!draft) {
            return;
        }

        setActionKey(`lead-stage-${lead.id}`);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await crmApi.updateLeadStage(lead.id, {
                stage: draft.stage,
                lostReason: draft.stage === 'LOST' ? draft.lostReason.trim() || undefined : undefined,
            });
            await loadCrmState({ silent: true });
            if (selectedCustomerId) {
                await loadCustomerHistory();
            }
            setSuccessMessage(`Lead "${lead.title}" actualizado`);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la etapa del lead'));
        } finally {
            setActionKey('');
        }
    };

    if (loading) {
        return (
            <section className="section-shell p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-2">
                        <div className="h-3 w-28 rounded-full bg-slate-100 animate-pulse" />
                        <div className="h-8 w-72 rounded-full bg-slate-100 animate-pulse" />
                    </div>
                    <div className="h-10 w-32 rounded-full bg-slate-100 animate-pulse" />
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
                        <div key={index} className="rounded-3xl border border-slate-200 bg-white p-5">
                            <div className="h-5 w-44 rounded-full bg-slate-100 animate-pulse" />
                            <div className="mt-4 h-56 rounded-3xl bg-slate-50 animate-pulse" />
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    return (
        <section className="section-shell p-6 space-y-6">
            <PageFeedbackStack
                items={[
                    { id: 'organization-workspace-error', tone: 'danger', text: errorMessage },
                    { id: 'organization-workspace-success', tone: 'info', text: successMessage },
                ]}
            />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Organizacion + CRM</p>
                    <h2 className="font-display text-2xl font-bold text-slate-900">
                        Equipo, uso y relacion con clientes
                    </h2>
                    <p className="max-w-3xl text-sm text-slate-600">
                        Gestiona la organizacion activa, distribuye acceso, monitorea limites del plan y mueve oportunidades dentro del pipeline comercial.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="chip">
                        Organizacion: {organization?.name || organizationName || 'Sin contexto'}
                    </span>
                    {organization?.actorRole ? (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleTone(organization.actorRole)}`}>
                            {getRoleLabel(organization.actorRole)}
                        </span>
                    ) : null}
                    {organization?.subscriptionStatus ? (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSubscriptionTone(organization.subscriptionStatus)}`}>
                            {getSubscriptionLabel(organization.subscriptionStatus)}
                        </span>
                    ) : null}
                    <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={() => void handleRefreshAll()}
                        disabled={loading || crmLoading}
                    >
                        {loading || crmLoading ? 'Actualizando...' : 'Actualizar workspace'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    label="Negocios conectados"
                    value={formatNumberDo(organization?._count?.businesses ?? 0)}
                    delta="Portafolio administrado por esta organizacion"
                />
                <SummaryCard
                    label="Equipo activo"
                    value={formatNumberDo(organization?._count?.members ?? members.length)}
                    delta="Miembros con acceso a esta organizacion"
                />
                <SummaryCard
                    label="Invites pendientes"
                    value={formatNumberDo(invites.length)}
                    delta="Tokens activos esperando aceptacion"
                />
                <SummaryCard
                    label="Pipeline vivo"
                    value={formatNumberDo(pipelineSummary.total)}
                    delta="Leads visibles con el filtro actual"
                />
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Identidad operativa</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">Configuracion de la organizacion</h3>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            Plan {organization?.plan || usage?.plan || 'FREE'}
                        </span>
                    </div>

                    <form className="mt-5 space-y-4" onSubmit={(event) => void handleOrganizationSubmit(event)}>
                        <label className="block text-sm font-medium text-slate-700">
                            Nombre visible
                            <input
                                className="input-field mt-2"
                                value={organizationNameDraft}
                                onChange={(event) => setOrganizationNameDraft(event.target.value)}
                                placeholder="Nombre de la organizacion"
                                disabled={!canManageOrganization}
                            />
                        </label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Slug</p>
                                <p className="mt-2 text-sm font-medium text-slate-900">{organization?.slug || 'pendiente'}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owner principal</p>
                                <p className="mt-2 text-sm font-medium text-slate-900">{organization?.ownerUser?.name || 'Sin owner visible'}</p>
                                <p className="mt-1 text-xs text-slate-500">{organization?.ownerUser?.email || 'No disponible'}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <div>
                                <p className="text-sm font-medium text-slate-900">Renovacion y estado</p>
                                <p className="mt-1 text-sm text-slate-600">
                                    {organization?.subscriptionRenewsAt
                                        ? `Renueva el ${formatDateDo(organization.subscriptionRenewsAt)}`
                                        : 'Gestiona el plan y pagos en la seccion de billing que esta arriba.'}
                                </p>
                            </div>
                            <button
                                type="submit"
                                className="btn-primary text-sm"
                                disabled={!canManageOrganization || actionKey === 'organization-update' || !organizationNameDraft.trim()}
                            >
                                {actionKey === 'organization-update' ? 'Guardando...' : 'Guardar cambios'}
                            </button>
                        </div>
                    </form>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Capacidad del plan</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">Uso, limites y margen operativo</h3>
                        </div>
                        <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">
                            Billing enlazado
                        </span>
                    </div>

                    {usage ? (
                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                            {orderedUsageKeys.map((key) => {
                                const used = usage.usage[key];
                                const limit = usage.limits[key];
                                const remaining = usage.remaining[key];
                                const percentage = limit && limit > 0
                                    ? Math.min(100, Math.round((used / limit) * 100))
                                    : null;

                                return (
                                    <article key={key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-slate-900">{getUsageLabel(key)}</p>
                                            <span className="text-xs text-slate-500">
                                                {formatUsageValue(used)} / {formatUsageValue(limit)}
                                            </span>
                                        </div>
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                                            <div
                                                className="h-full rounded-full bg-primary-500 transition-all"
                                                style={{ width: `${percentage ?? 18}%` }}
                                            />
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                                            <span>Usado: {formatUsageValue(used)}</span>
                                            <span>Restante: {formatUsageValue(remaining)}</span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="mt-5 text-sm text-slate-600">
                            No hay snapshot de uso disponible todavia para esta organizacion.
                        </p>
                    )}
                </article>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Equipo interno</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">Miembros y permisos</h3>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {members.length} miembros
                        </span>
                    </div>

                    <div className="mt-5 space-y-3">
                        {members.length > 0 ? members.map((member) => (
                            <article key={member.userId} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-slate-900">{member.user.name}</p>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getRoleTone(member.role)}`}>
                                                {getRoleLabel(member.role)}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{member.user.email}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            En el equipo desde {formatDateDo(member.createdAt)}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <select
                                            className="input-field min-w-[9rem]"
                                            value={memberRoleDrafts[member.userId] || member.role}
                                            onChange={(event) => {
                                                const value = event.target.value as OrganizationRole;
                                                setMemberRoleDrafts((current) => ({
                                                    ...current,
                                                    [member.userId]: value,
                                                }));
                                            }}
                                            disabled={!canManageOrganization || member.role === 'OWNER'}
                                        >
                                            {(['OWNER', 'MANAGER', 'STAFF'] as OrganizationRole[]).map((role) => (
                                                <option key={role} value={role}>
                                                    {getRoleLabel(role)}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleMemberRoleUpdate(member)}
                                            disabled={!canManageOrganization || member.role === 'OWNER' || actionKey === `member-role-${member.userId}`}
                                        >
                                            {actionKey === `member-role-${member.userId}` ? 'Guardando...' : 'Aplicar rol'}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleMemberRemoval(member)}
                                            disabled={!canManageOrganization || member.role === 'OWNER' || actionKey === `member-remove-${member.userId}`}
                                        >
                                            {actionKey === `member-remove-${member.userId}` ? 'Removiendo...' : 'Remover'}
                                        </button>
                                    </div>
                                </div>
                            </article>
                        )) : (
                            <p className="text-sm text-slate-600">No hay miembros cargados para esta organizacion.</p>
                        )}
                    </div>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Invites</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Invitar y seguir accesos</h3>
                    </div>

                    <form className="mt-5 space-y-4" onSubmit={(event) => void handleInviteSubmit(event)}>
                        <label className="block text-sm font-medium text-slate-700">
                            Correo del miembro
                            <input
                                className="input-field mt-2"
                                type="email"
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                placeholder="equipo@negocio.com"
                                disabled={!canManageOrganization}
                            />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Rol inicial
                            <select
                                className="input-field mt-2"
                                value={inviteRole}
                                onChange={(event) => setInviteRole(event.target.value as OrganizationRole)}
                                disabled={!canManageOrganization || manageableInviteRoles.length === 0}
                            >
                                {manageableInviteRoles.length > 0 ? manageableInviteRoles.map((role) => (
                                    <option key={role} value={role}>
                                        {getRoleLabel(role)}
                                    </option>
                                )) : (
                                    <option value="STAFF">Sin permisos para invitar</option>
                                )}
                            </select>
                        </label>
                        <button
                            type="submit"
                            className="btn-primary text-sm w-full"
                            disabled={!canManageOrganization || !inviteEmail.trim() || actionKey === 'organization-invite'}
                        >
                            {actionKey === 'organization-invite' ? 'Creando invite...' : 'Crear invite'}
                        </button>
                    </form>

                    {lastInviteToken ? (
                        <div className="mt-5 rounded-2xl border border-primary-100 bg-primary-50/70 p-4">
                            <p className="text-sm font-semibold text-primary-900">Ultimo token emitido</p>
                            <p className="mt-2 break-all rounded-xl bg-white p-3 text-xs text-slate-700">
                                {buildInviteAcceptanceUrl(lastInviteToken)}
                            </p>
                            <button
                                type="button"
                                className="btn-secondary mt-3 text-sm"
                                onClick={() => void handleCopyInviteToken()}
                            >
                                Copiar enlace
                            </button>
                        </div>
                    ) : null}

                    <div className="mt-5 space-y-3">
                        <p className="text-sm font-semibold text-slate-900">Pendientes</p>
                        {invites.length > 0 ? invites.map((invite) => (
                            <article key={invite.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-slate-900">{invite.email}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Expira el {formatDateDo(invite.expiresAt)}
                                        </p>
                                    </div>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getRoleTone(invite.role)}`}>
                                        {getRoleLabel(invite.role)}
                                    </span>
                                </div>
                                {invite.invitedByUser?.name ? (
                                    <p className="mt-2 text-xs text-slate-500">
                                        Invitado por {invite.invitedByUser.name}
                                    </p>
                                ) : null}
                            </article>
                        )) : (
                            <p className="text-sm text-slate-600">No hay invites pendientes.</p>
                        )}
                    </div>
                </article>
            </div>

            <div className="space-y-3">
                <div className="space-y-2">
                    <p className="page-kicker">CRM comercial</p>
                    <h3 className="page-title-sm">Clientes y pipeline accionable</h3>
                    <p className="page-description">
                        Ordena el seguimiento comercial con filtros simples, historial accesible y oportunidades listas para mover entre etapas.
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        label="Clientes visibles"
                        value={formatNumberDo(customers.total)}
                        delta={customerSearch || crmBusinessFilter ? 'Con filtros activos' : 'Base completa de la organizacion'}
                    />
                    <SummaryCard
                        label="Cliente en foco"
                        value={selectedCustomer?.user.name || 'Sin seleccionar'}
                        delta={selectedCustomer ? `${formatNumberDo(selectedCustomer.stats.totalBookings)} reservas acumuladas` : 'Abre una ficha para ver historial'}
                    />
                    <SummaryCard
                        label="Leads abiertos"
                        value={formatNumberDo(openPipelineCount)}
                        delta={`${formatNumberDo(pipelineSummary.byStage.PAID ?? 0)} cerrados en pago`}
                    />
                    <SummaryCard
                        label="Etapa dominante"
                        value={dominantPipelineStage ? getStageLabel(dominantPipelineStage.stage) : 'Sin datos'}
                        delta={dominantPipelineStage ? `${formatNumberDo(dominantPipelineStage.count)} oportunidades` : 'Crea el primer lead'}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <SectionCard
                    title="Base de clientes"
                    description="Filtra por negocio o busqueda y abre una ficha sin saturar la vista principal."
                    density="compact"
                    actions={(
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {formatNumberDo(customers.total)} clientes
                        </span>
                    )}
                >
                    <form className="card-filter density-compact mb-4 flex flex-wrap gap-3" onSubmit={(event) => void handleCustomersSearch(event)}>
                        <input
                            className="input-field min-w-[12rem] flex-1"
                            value={customerSearchDraft}
                            onChange={(event) => setCustomerSearchDraft(event.target.value)}
                            placeholder="Buscar por nombre o correo"
                        />
                        <select
                            className="input-field min-w-[11rem]"
                            value={crmBusinessFilter}
                            onChange={(event) => setCrmBusinessFilter(event.target.value)}
                        >
                            <option value="">Todos los negocios</option>
                            {businesses.map((business) => (
                                <option key={business.id} value={business.id}>
                                    {business.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="submit"
                            className="btn-secondary text-sm"
                            disabled={crmLoading}
                        >
                            {crmLoading ? 'Buscando...' : 'Aplicar'}
                        </button>
                    </form>

                    <div className="card-list density-compact">
                        {customers.data.length > 0 ? customers.data.map((customer) => (
                            <button
                                type="button"
                                key={customer.user.id}
                                className={`w-full rounded-2xl border p-4 text-left transition-all ${
                                    selectedCustomerId === customer.user.id
                                        ? 'border-primary-300 bg-primary-50'
                                        : 'border-slate-200 bg-white hover:border-primary-200'
                                }`}
                                onClick={() => setSelectedCustomerId(customer.user.id)}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-slate-900">{customer.user.name}</p>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getSegmentTone(customer.segment)}`}>
                                                {customer.segment}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{customer.user.email}</p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Ultima actividad {customer.stats.lastActivityAt ? formatDateTimeDo(customer.stats.lastActivityAt) : 'sin actividad reciente'}
                                        </p>
                                    </div>
                                    <div className="text-right text-xs text-slate-500">
                                        <p>{formatNumberDo(customer.stats.totalBookings)} reservas</p>
                                        <p>{formatCurrencyDo(customer.stats.totalSpent)}</p>
                                    </div>
                                </div>
                            </button>
                        )) : (
                            <EmptyState
                                title="Sin clientes bajo este filtro"
                                body="Ajusta negocio o busqueda para recuperar actividad comercial relevante."
                            />
                        )}
                    </div>
                </SectionCard>

                <div className="space-y-5">
                    <SectionCard
                        title="Ficha del cliente seleccionado"
                        description="Resume valor, actividad y contexto del cliente sin obligarte a cambiar de pantalla."
                        density="compact"
                        actions={selectedCustomer ? (
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getSegmentTone(selectedCustomer.segment)}`}>
                                {selectedCustomer.segment}
                            </span>
                        ) : undefined}
                    >
                        {historyLoading ? (
                            <div className="space-y-3">
                                <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                                <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
                            </div>
                        ) : customerHistory ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <SummaryCard label="Reservas" value={formatNumberDo(customerHistory.summary.totalBookings)} />
                                    <SummaryCard label="Transacciones" value={formatNumberDo(customerHistory.summary.totalTransactions)} />
                                    <SummaryCard label="Conversaciones" value={formatNumberDo(customerHistory.summary.totalConversations)} />
                                    <SummaryCard label="Valor acumulado" value={formatCurrencyDo(customerHistory.summary.totalSpent)} />
                                </div>
                                <div className="card-filter density-compact grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contacto</p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">{customerHistory.customer.email}</p>
                                        <p className="mt-1 text-xs text-slate-500">{customerHistory.customer.phone || 'Sin telefono registrado'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Relacion comercial</p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">
                                            Cliente desde {formatDateDo(customerHistory.customer.createdAt)}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {selectedCustomer?.stats.lastActivityAt ? `Ultima actividad ${formatDateTimeDo(selectedCustomer.stats.lastActivityAt)}` : 'Sin actividad reciente'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <EmptyState
                                title="Selecciona un cliente"
                                body="Cuando abras una ficha veras su historial cruzado de reservas, pagos y conversaciones."
                            />
                        )}
                    </SectionCard>

                    <SectionCard
                        title="Actividad reciente"
                        description="Mantiene reservas, pagos y conversaciones visibles sin sobrecargar la ficha principal."
                        density="compact"
                    >
                        {historyLoading ? (
                            <div className="space-y-3">
                                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                            </div>
                        ) : customerHistory ? (
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                                <div className="card-list density-compact">
                                    <p className="text-sm font-semibold text-slate-900">Ultimas reservas</p>
                                    {customerHistory.bookings.slice(0, 3).map((booking) => (
                                        <div key={booking.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <p className="text-sm font-medium text-slate-900">{booking.business?.name || 'Negocio'}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {formatDateTimeDo(booking.scheduledFor)} | {booking.status}
                                            </p>
                                        </div>
                                    ))}
                                    {customerHistory.bookings.length === 0 ? (
                                        <EmptyState
                                            title="Sin reservas registradas"
                                            body="Apareceran aqui las ultimas reservas del cliente."
                                        />
                                    ) : null}
                                </div>
                                <div className="card-list density-compact">
                                    <p className="text-sm font-semibold text-slate-900">Pagos recientes</p>
                                    {customerHistory.transactions.slice(0, 3).map((transaction) => (
                                        <div key={transaction.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <p className="text-sm font-medium text-slate-900">{formatCurrencyDo(transaction.grossAmount, transaction.currency)}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {transaction.status} | {formatDateTimeDo(transaction.createdAt)}
                                            </p>
                                        </div>
                                    ))}
                                    {customerHistory.transactions.length === 0 ? (
                                        <EmptyState
                                            title="Sin pagos registrados"
                                            body="Los cobros del cliente apareceran aqui cuando existan."
                                        />
                                    ) : null}
                                </div>
                                <div className="card-list density-compact">
                                    <p className="text-sm font-semibold text-slate-900">Conversaciones</p>
                                    {customerHistory.conversations.slice(0, 3).map((conversation) => (
                                        <div key={conversation.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <p className="text-sm font-medium text-slate-900">{conversation.subject || 'Consulta directa'}</p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {conversation.status} | {formatDateTimeDo(conversation.lastMessageAt)}
                                            </p>
                                        </div>
                                    ))}
                                    {customerHistory.conversations.length === 0 ? (
                                        <EmptyState
                                            title="Sin conversaciones"
                                            body="Cuando el cliente escriba o responda, veras aqui su ultimo hilo."
                                        />
                                    ) : null}
                                </div>
                            </div>
                        ) : (
                            <EmptyState
                                title="Sin actividad para mostrar"
                                body="Selecciona un cliente para abrir su actividad reciente por canal."
                            />
                        )}
                    </SectionCard>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <SectionCard
                    title="Lead manual para el pipeline"
                    description="Crea oportunidades conectadas al negocio correcto y, si aplica, al cliente seleccionado."
                    density="compact"
                >
                    <form className="card-form density-compact grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => void handleCreateLead(event)}>
                        <label className="block text-sm font-medium text-slate-700">
                            Negocio
                            <select
                                className="input-field mt-2"
                                value={leadBusinessId}
                                onChange={(event) => setLeadBusinessId(event.target.value)}
                            >
                                <option value="">Selecciona un negocio</option>
                                {businesses.map((business) => (
                                    <option key={business.id} value={business.id}>
                                        {business.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                            Cliente enlazado
                            <input
                                className="input-field mt-2"
                                value={selectedCustomer?.user.name || 'Sin cliente seleccionado'}
                                disabled
                            />
                        </label>

                        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                            Titulo del lead
                            <input
                                className="input-field mt-2"
                                value={leadTitle}
                                onChange={(event) => setLeadTitle(event.target.value)}
                                placeholder="Ej: Evento corporativo de 40 personas"
                            />
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                            Valor estimado
                            <input
                                className="input-field mt-2"
                                value={leadEstimatedValue}
                                onChange={(event) => setLeadEstimatedValue(event.target.value)}
                                inputMode="decimal"
                                placeholder="12500"
                            />
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                            Cierre esperado
                            <input
                                className="input-field mt-2"
                                type="datetime-local"
                                value={leadExpectedCloseAt}
                                onChange={(event) => setLeadExpectedCloseAt(event.target.value)}
                            />
                        </label>

                        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                            Notas
                            <textarea
                                className="input-field mt-2 min-h-[110px]"
                                value={leadNotes}
                                onChange={(event) => setLeadNotes(event.target.value)}
                                placeholder="Contexto de la oportunidad, propuesta o siguientes pasos."
                            />
                        </label>

                        <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                            <p className="text-sm text-slate-600">
                                Si eliges un cliente, el lead queda conectado a su historial comercial.
                            </p>
                            <button
                                type="submit"
                                className="btn-primary text-sm"
                                disabled={!leadBusinessId || !leadTitle.trim() || actionKey === 'crm-create-lead'}
                            >
                                {actionKey === 'crm-create-lead' ? 'Creando lead...' : 'Crear lead'}
                            </button>
                        </div>
                    </form>
                </SectionCard>

                <SectionCard
                    title="Seguimiento de oportunidades"
                    description="Mantiene etapas claras, conteos visibles y cada lead como una unidad escaneable."
                    density="compact"
                    actions={(
                        <select
                            className="input-field min-w-[10rem]"
                            value={pipelineStageFilter}
                            onChange={(event) => setPipelineStageFilter(event.target.value as SalesLeadStage | '')}
                        >
                            <option value="">Todas las etapas</option>
                            {PIPELINE_STAGES.map((stage) => (
                                <option key={stage} value={stage}>
                                    {getStageLabel(stage)}
                                </option>
                            ))}
                        </select>
                    )}
                >
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        {PIPELINE_STAGES.map((stage) => (
                            <SummaryCard
                                key={stage}
                                label={getStageLabel(stage)}
                                value={formatNumberDo(pipelineSummary.byStage[stage] ?? 0)}
                            />
                        ))}
                    </div>

                    <div className="card-list density-compact mt-4">
                        {crmLoading ? (
                            <div className="space-y-3">
                                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                                <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                            </div>
                        ) : pipeline.length > 0 ? pipeline.map((lead) => {
                            const draft = leadStageDrafts[lead.id] || {
                                stage: lead.stage,
                                lostReason: lead.lostReason || '',
                            };

                            return (
                                <article key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-slate-900">{lead.title}</p>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStageTone(lead.stage)}`}>
                                                    {getStageLabel(lead.stage)}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                                <span>{lead.business.name}</span>
                                                <span>Creado {formatDateTimeDo(lead.createdAt)}</span>
                                                {lead.customerUser?.name ? <span>{lead.customerUser.name}</span> : null}
                                                {lead.conversation?.id ? <span>Inbox conectado</span> : null}
                                                {lead.booking?.id ? <span>Reserva ligada</span> : null}
                                            </div>
                                        </div>
                                        <div className="text-right text-xs text-slate-500">
                                            <p className="text-sm font-semibold text-slate-900">
                                                {lead.estimatedValue ? formatCurrencyDo(lead.estimatedValue) : 'Sin valor estimado'}
                                            </p>
                                            <p>{lead.expectedCloseAt ? `Cierre ${formatDateDo(lead.expectedCloseAt)}` : 'Sin fecha de cierre'}</p>
                                        </div>
                                    </div>

                                    {lead.notes ? (
                                        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-600">{lead.notes}</p>
                                    ) : null}

                                    <div className="card-filter density-compact mt-4 flex flex-wrap items-center gap-2">
                                        <select
                                            className="input-field min-w-[10rem]"
                                            value={draft.stage}
                                            onChange={(event) => {
                                                const stage = event.target.value as SalesLeadStage;
                                                setLeadStageDrafts((current) => ({
                                                    ...current,
                                                    [lead.id]: {
                                                        stage,
                                                        lostReason: current[lead.id]?.lostReason || '',
                                                    },
                                                }));
                                            }}
                                        >
                                            {PIPELINE_STAGES.map((stage) => (
                                                <option key={stage} value={stage}>
                                                    {getStageLabel(stage)}
                                                </option>
                                            ))}
                                        </select>

                                        {draft.stage === 'LOST' ? (
                                            <input
                                                className="input-field min-w-[12rem] flex-1"
                                                value={draft.lostReason}
                                                onChange={(event) => {
                                                    const lostReason = event.target.value;
                                                    setLeadStageDrafts((current) => ({
                                                        ...current,
                                                        [lead.id]: {
                                                            stage: 'LOST',
                                                            lostReason,
                                                        },
                                                    }));
                                                }}
                                                placeholder="Razon de perdida"
                                            />
                                        ) : null}

                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleLeadStageUpdate(lead)}
                                            disabled={actionKey === `lead-stage-${lead.id}`}
                                        >
                                            {actionKey === `lead-stage-${lead.id}` ? 'Guardando...' : 'Actualizar etapa'}
                                        </button>
                                    </div>
                                </article>
                            );
                        }) : (
                            <EmptyState
                                title="Sin oportunidades en este filtro"
                                body="Ajusta etapa o crea un lead manual para empezar a mover el pipeline."
                            />
                        )}
                    </div>
                </SectionCard>
            </div>

            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Actividad</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Actividad reciente del equipo</h3>
                        <p className="mt-2 text-sm text-slate-600">
                            Resume cambios de equipo, plan y portafolio sin exponer logs tecnicos ni payloads internos.
                        </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {organizationActivity.length} eventos recientes
                    </span>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {organizationActivity.length > 0 ? organizationActivity.map((activity) => {
                        return (
                            <article key={activity.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${activity.categoryTone}`}>
                                            {activity.category}
                                        </span>
                                        <p className="mt-2 font-medium text-slate-900">{activity.title}</p>
                                    </div>
                                    <p className="text-xs text-slate-500">{formatDateTimeDo(activity.createdAt)}</p>
                                </div>
                                <p className="mt-3 text-sm text-slate-600">{activity.description}</p>
                                <p className="mt-3 text-xs font-medium text-slate-500">{activity.actorLabel}</p>
                            </article>
                        );
                    }) : (
                        <EmptyState
                            title="Sin actividad reciente para mostrar"
                            body="Cuando haya cambios de equipo, plan o portafolio, apareceran resumidos aqui sin detalles tecnicos."
                        />
                    )}
                </div>
            </article>
        </section>
    );
}
