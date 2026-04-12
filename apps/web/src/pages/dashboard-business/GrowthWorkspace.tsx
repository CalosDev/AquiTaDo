import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { adsApi, categoryApi, locationApi, promotionsApi } from '../../api/endpoints';
import { getApiErrorMessage } from '../../api/error';
import { PageFeedbackStack } from '../../components/PageFeedbackStack';
import { useTimedMessage } from '../../hooks/useTimedMessage';
import { formatCurrencyDo, formatDateDo, formatDateTimeDo, formatNumberDo } from '../../lib/market';

type DiscountType = 'PERCENTAGE' | 'FIXED';
type PromotionLifecycleStatus = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'ALL';
type AdCampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED';

interface PortfolioBusinessOption {
    id: string;
    name: string;
    slug?: string;
}

interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface PromotionItem {
    id: string;
    slug: string;
    title: string;
    description?: string | null;
    discountType: DiscountType;
    discountValue: string | number;
    couponCode?: string | null;
    startsAt: string;
    endsAt: string;
    maxRedemptions?: number | null;
    isFlashOffer: boolean;
    isActive: boolean;
    createdAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
        verified: boolean;
    };
    createdByUser?: {
        id: string;
        name: string;
        email: string;
    } | null;
}

interface AdCampaignItem {
    id: string;
    name: string;
    status: AdCampaignStatus;
    dailyBudget: number;
    totalBudget: number;
    bidAmount: number;
    spentAmount: number;
    impressions: number;
    clicks: number;
    ctr: number;
    startsAt: string;
    endsAt: string;
    createdAt: string;
    updatedAt: string;
    business: {
        id: string;
        name: string;
        slug: string;
        verified: boolean;
        province?: {
            id: string;
            name: string;
            slug: string;
        } | null;
    };
    targetProvince?: {
        id: string;
        name: string;
        slug: string;
    } | null;
    targetCategory?: {
        id: string;
        name: string;
        slug: string;
    } | null;
}

interface CategoryOption {
    id: string;
    name: string;
    slug: string;
}

interface ProvinceOption {
    id: string;
    name: string;
    slug: string;
}

interface GrowthWorkspaceProps {
    activeOrganizationId: string | null;
    businesses: PortfolioBusinessOption[];
    selectedBusinessId: string;
}

interface PromotionDraft {
    businessId: string;
    title: string;
    description: string;
    discountType: DiscountType;
    discountValue: string;
    couponCode: string;
    startsAt: string;
    endsAt: string;
    maxRedemptions: string;
    isFlashOffer: boolean;
    isActive: boolean;
}

interface CampaignDraft {
    businessId: string;
    name: string;
    targetProvinceId: string;
    targetCategoryId: string;
    dailyBudget: string;
    totalBudget: string;
    bidAmount: string;
    startsAt: string;
    endsAt: string;
    status: AdCampaignStatus;
}

const EMPTY_PROMOTION_DRAFT: PromotionDraft = {
    businessId: '',
    title: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    couponCode: '',
    startsAt: '',
    endsAt: '',
    maxRedemptions: '',
    isFlashOffer: false,
    isActive: true,
};

const EMPTY_CAMPAIGN_DRAFT: CampaignDraft = {
    businessId: '',
    name: '',
    targetProvinceId: '',
    targetCategoryId: '',
    dailyBudget: '',
    totalBudget: '',
    bidAmount: '',
    startsAt: '',
    endsAt: '',
    status: 'DRAFT',
};

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

function toDateTimeLocal(value?: string | null): string {
    if (!value) {
        return '';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    const timezoneOffsetMs = parsed.getTimezoneOffset() * 60_000;
    return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function getPromotionLifecycle(promotion: PromotionItem): PromotionLifecycleStatus {
    const now = Date.now();
    const startsAt = new Date(promotion.startsAt).getTime();
    const endsAt = new Date(promotion.endsAt).getTime();

    if (!promotion.isActive || endsAt < now) {
        return 'EXPIRED';
    }

    if (startsAt > now) {
        return 'SCHEDULED';
    }

    return 'ACTIVE';
}

function getPromotionStatusTone(status: PromotionLifecycleStatus): string {
    switch (status) {
        case 'ACTIVE':
            return 'bg-primary-100 text-primary-700';
        case 'SCHEDULED':
            return 'bg-blue-100 text-blue-700';
        case 'EXPIRED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-slate-100 text-slate-700';
    }
}

function getPromotionStatusLabel(status: PromotionLifecycleStatus): string {
    switch (status) {
        case 'SCHEDULED':
            return 'Programada';
        case 'EXPIRED':
            return 'Expirada';
        default:
            return 'Activa';
    }
}

function getCampaignTone(status: AdCampaignStatus): string {
    switch (status) {
        case 'ACTIVE':
            return 'bg-primary-100 text-primary-700';
        case 'PAUSED':
            return 'bg-amber-100 text-amber-800';
        case 'ENDED':
        case 'REJECTED':
            return 'bg-slate-200 text-slate-700';
        default:
            return 'bg-blue-100 text-blue-700';
    }
}

function getCampaignLabel(status: AdCampaignStatus): string {
    switch (status) {
        case 'ACTIVE':
            return 'Activa';
        case 'PAUSED':
            return 'Pausada';
        case 'ENDED':
            return 'Finalizada';
        case 'REJECTED':
            return 'Rechazada';
        default:
            return 'Borrador';
    }
}

export function GrowthWorkspace({
    activeOrganizationId,
    businesses,
    selectedBusinessId,
}: GrowthWorkspaceProps) {
    const [loading, setLoading] = useState(true);
    const [actionKey, setActionKey] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [promotionStatusFilter, setPromotionStatusFilter] = useState<PromotionLifecycleStatus>('ALL');
    const [promotionBusinessFilter, setPromotionBusinessFilter] = useState('');
    const [campaignStatusFilter, setCampaignStatusFilter] = useState<AdCampaignStatus | ''>('');
    const [campaignBusinessFilter, setCampaignBusinessFilter] = useState('');
    const [editingPromotionId, setEditingPromotionId] = useState('');

    const [promotions, setPromotions] = useState<PaginatedResponse<PromotionItem>>({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
    });
    const [campaigns, setCampaigns] = useState<PaginatedResponse<AdCampaignItem>>({
        data: [],
        total: 0,
        page: 1,
        limit: 0,
        totalPages: 0,
    });
    const [categories, setCategories] = useState<CategoryOption[]>([]);
    const [provinces, setProvinces] = useState<ProvinceOption[]>([]);
    const [promotionDraft, setPromotionDraft] = useState<PromotionDraft>(EMPTY_PROMOTION_DRAFT);
    const [campaignDraft, setCampaignDraft] = useState<CampaignDraft>(EMPTY_CAMPAIGN_DRAFT);

    useTimedMessage(errorMessage, setErrorMessage, 6500);
    useTimedMessage(successMessage, setSuccessMessage, 4500);

    const promotionSummary = useMemo(() => {
        const rows = promotions.data;
        return {
            active: rows.filter((promotion) => getPromotionLifecycle(promotion) === 'ACTIVE').length,
            scheduled: rows.filter((promotion) => getPromotionLifecycle(promotion) === 'SCHEDULED').length,
            flash: rows.filter((promotion) => promotion.isFlashOffer).length,
        };
    }, [promotions.data]);

    const campaignSummary = useMemo(() => ({
        active: campaigns.data.filter((campaign) => campaign.status === 'ACTIVE').length,
        draft: campaigns.data.filter((campaign) => campaign.status === 'DRAFT').length,
        totalClicks: campaigns.data.reduce((sum, campaign) => sum + Number(campaign.clicks || 0), 0),
        totalSpent: campaigns.data.reduce((sum, campaign) => sum + Number(campaign.spentAmount || 0), 0),
    }), [campaigns.data]);

    const loadGrowthState = useCallback(async () => {
        if (!activeOrganizationId) {
            setPromotions({ data: [], total: 0, page: 1, limit: 0, totalPages: 0 });
            setCampaigns({ data: [], total: 0, page: 1, limit: 0, totalPages: 0 });
            setCategories([]);
            setProvinces([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const promotionParams: { businessId?: string; status?: PromotionLifecycleStatus; limit?: number } = { limit: 8 };
            if (promotionBusinessFilter) {
                promotionParams.businessId = promotionBusinessFilter;
            }
            if (promotionStatusFilter !== 'ALL') {
                promotionParams.status = promotionStatusFilter;
            }

            const campaignParams: { businessId?: string; status?: AdCampaignStatus; limit?: number } = { limit: 8 };
            if (campaignBusinessFilter) {
                campaignParams.businessId = campaignBusinessFilter;
            }
            if (campaignStatusFilter) {
                campaignParams.status = campaignStatusFilter;
            }

            const [
                promotionsResponse,
                campaignsResponse,
                categoriesResponse,
                provincesResponse,
            ] = await Promise.all([
                promotionsApi.getMine(promotionParams),
                adsApi.getMyCampaigns(campaignParams),
                categoryApi.getAll(),
                locationApi.getProvinces(),
            ]);

            setPromotions(parsePaginatedResponse<PromotionItem>(promotionsResponse.data));
            setCampaigns(parsePaginatedResponse<AdCampaignItem>(campaignsResponse.data));
            setCategories(asArray<CategoryOption>(categoriesResponse.data));
            setProvinces(asArray<ProvinceOption>(provincesResponse.data));
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo cargar promociones y ads'));
        } finally {
            setLoading(false);
        }
    }, [activeOrganizationId, campaignBusinessFilter, campaignStatusFilter, promotionBusinessFilter, promotionStatusFilter]);

    useEffect(() => {
        if (!activeOrganizationId) {
            setPromotionBusinessFilter('');
            setCampaignBusinessFilter('');
            setPromotionDraft(EMPTY_PROMOTION_DRAFT);
            setCampaignDraft(EMPTY_CAMPAIGN_DRAFT);
            return;
        }

        setPromotionBusinessFilter(selectedBusinessId || '');
        setCampaignBusinessFilter(selectedBusinessId || '');
        setPromotionDraft((current) => ({
            ...current,
            businessId: selectedBusinessId || businesses[0]?.id || '',
        }));
        setCampaignDraft((current) => ({
            ...current,
            businessId: selectedBusinessId || businesses[0]?.id || '',
        }));
    }, [activeOrganizationId, businesses, selectedBusinessId]);

    useEffect(() => {
        void loadGrowthState();
    }, [loadGrowthState]);

    const handleResetPromotionDraft = () => {
        setEditingPromotionId('');
        setPromotionDraft({
            ...EMPTY_PROMOTION_DRAFT,
            businessId: selectedBusinessId || businesses[0]?.id || '',
        });
    };

    const handlePromotionSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!promotionDraft.businessId) {
            setErrorMessage('Selecciona un negocio para la promocion');
            return;
        }

        const payload = {
            businessId: promotionDraft.businessId,
            title: promotionDraft.title.trim(),
            description: promotionDraft.description.trim() || undefined,
            discountType: promotionDraft.discountType,
            discountValue: Number(promotionDraft.discountValue),
            couponCode: promotionDraft.couponCode.trim() || undefined,
            startsAt: toIsoDateTime(promotionDraft.startsAt) || '',
            endsAt: toIsoDateTime(promotionDraft.endsAt) || '',
            maxRedemptions: parseOptionalNumber(promotionDraft.maxRedemptions),
            isFlashOffer: promotionDraft.isFlashOffer,
            isActive: promotionDraft.isActive,
        };

        setActionKey('promotion-submit');
        setErrorMessage('');
        setSuccessMessage('');
        try {
            if (editingPromotionId) {
                await promotionsApi.update(editingPromotionId, payload);
                setSuccessMessage('Promocion actualizada');
            } else {
                await promotionsApi.create(payload);
                setSuccessMessage('Promocion creada');
            }
            handleResetPromotionDraft();
            await loadGrowthState();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo guardar la promocion'));
        } finally {
            setActionKey('');
        }
    };

    const handlePromotionEdit = (promotion: PromotionItem) => {
        setEditingPromotionId(promotion.id);
        setPromotionDraft({
            businessId: promotion.business.id,
            title: promotion.title,
            description: promotion.description || '',
            discountType: promotion.discountType,
            discountValue: String(promotion.discountValue ?? ''),
            couponCode: promotion.couponCode || '',
            startsAt: toDateTimeLocal(promotion.startsAt),
            endsAt: toDateTimeLocal(promotion.endsAt),
            maxRedemptions: promotion.maxRedemptions ? String(promotion.maxRedemptions) : '',
            isFlashOffer: promotion.isFlashOffer,
            isActive: promotion.isActive,
        });
    };

    const handlePromotionDelete = async (promotion: PromotionItem) => {
        const confirmed = window.confirm(`Se eliminara la promocion "${promotion.title}". Deseas continuar?`);
        if (!confirmed) {
            return;
        }

        setActionKey(`promotion-delete-${promotion.id}`);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await promotionsApi.delete(promotion.id);
            if (editingPromotionId === promotion.id) {
                handleResetPromotionDraft();
            }
            await loadGrowthState();
            setSuccessMessage('Promocion eliminada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo eliminar la promocion'));
        } finally {
            setActionKey('');
        }
    };

    const handleCampaignSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!campaignDraft.businessId) {
            setErrorMessage('Selecciona un negocio para la campana');
            return;
        }

        setActionKey('campaign-create');
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await adsApi.createCampaign({
                businessId: campaignDraft.businessId,
                name: campaignDraft.name.trim(),
                targetProvinceId: campaignDraft.targetProvinceId || undefined,
                targetCategoryId: campaignDraft.targetCategoryId || undefined,
                dailyBudget: Number(campaignDraft.dailyBudget),
                totalBudget: Number(campaignDraft.totalBudget),
                bidAmount: Number(campaignDraft.bidAmount),
                startsAt: toIsoDateTime(campaignDraft.startsAt) || '',
                endsAt: toIsoDateTime(campaignDraft.endsAt) || '',
                status: campaignDraft.status,
            });
            setCampaignDraft({
                ...EMPTY_CAMPAIGN_DRAFT,
                businessId: selectedBusinessId || businesses[0]?.id || '',
            });
            await loadGrowthState();
            setSuccessMessage('Campana creada');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo crear la campana'));
        } finally {
            setActionKey('');
        }
    };

    const handleCampaignStatusUpdate = async (campaignId: string, status: AdCampaignStatus) => {
        setActionKey(`campaign-status-${campaignId}`);
        setErrorMessage('');
        setSuccessMessage('');
        try {
            await adsApi.updateCampaignStatus(campaignId, { status });
            await loadGrowthState();
            setSuccessMessage('Estado de campana actualizado');
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'No se pudo actualizar la campana'));
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
                    <div className="h-10 w-36 rounded-full bg-slate-100 animate-pulse" />
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
                    { id: 'growth-workspace-error', tone: 'danger', text: errorMessage },
                    { id: 'growth-workspace-success', tone: 'info', text: successMessage },
                ]}
            />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Promociones + ads</p>
                    <h2 className="font-display text-2xl font-bold text-slate-900">Crecimiento comercial desde el panel</h2>
                    <p className="max-w-3xl text-sm text-slate-600">
                        Crea ofertas, pauta interna y manten tu adquisicion activa sin salir del dashboard owner.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="chip">Promos {formatNumberDo(promotions.total)}</span>
                    <span className="chip">Campanas {formatNumberDo(campaigns.total)}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Promos activas</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(promotionSummary.active)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flash</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(promotionSummary.flash)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campanas activas</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatNumberDo(campaignSummary.active)}</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gasto acumulado</p>
                    <p className="mt-3 text-3xl font-bold text-slate-900">{formatCurrencyDo(campaignSummary.totalSpent)}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatNumberDo(campaignSummary.totalClicks)} clicks</p>
                </article>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Promocion</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">{editingPromotionId ? 'Editar oferta' : 'Crear oferta'}</h3>
                        </div>
                        {editingPromotionId ? (
                            <button type="button" className="btn-secondary text-sm" onClick={handleResetPromotionDraft}>
                                Nueva
                            </button>
                        ) : null}
                    </div>

                    <form className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => void handlePromotionSubmit(event)}>
                        <label className="block text-sm font-medium text-slate-700">
                            Negocio
                            <select className="input-field mt-2" value={promotionDraft.businessId} onChange={(event) => setPromotionDraft((current) => ({ ...current, businessId: event.target.value }))}>
                                <option value="">Selecciona un negocio</option>
                                {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Tipo
                            <select className="input-field mt-2" value={promotionDraft.discountType} onChange={(event) => setPromotionDraft((current) => ({ ...current, discountType: event.target.value as DiscountType }))}>
                                <option value="PERCENTAGE">Porcentaje</option>
                                <option value="FIXED">Monto fijo</option>
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                            Titulo
                            <input className="input-field mt-2" value={promotionDraft.title} onChange={(event) => setPromotionDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ej: 20% en brunch" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                            Descripcion
                            <textarea className="input-field mt-2 min-h-[90px]" value={promotionDraft.description} onChange={(event) => setPromotionDraft((current) => ({ ...current, description: event.target.value }))} />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Valor
                            <input className="input-field mt-2" value={promotionDraft.discountValue} onChange={(event) => setPromotionDraft((current) => ({ ...current, discountValue: event.target.value }))} inputMode="decimal" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Cupon
                            <input className="input-field mt-2" value={promotionDraft.couponCode} onChange={(event) => setPromotionDraft((current) => ({ ...current, couponCode: event.target.value.toUpperCase() }))} />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Inicio
                            <input className="input-field mt-2" type="datetime-local" value={promotionDraft.startsAt} onChange={(event) => setPromotionDraft((current) => ({ ...current, startsAt: event.target.value }))} />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Fin
                            <input className="input-field mt-2" type="datetime-local" value={promotionDraft.endsAt} onChange={(event) => setPromotionDraft((current) => ({ ...current, endsAt: event.target.value }))} />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Max redenciones
                            <input className="input-field mt-2" value={promotionDraft.maxRedemptions} onChange={(event) => setPromotionDraft((current) => ({ ...current, maxRedemptions: event.target.value }))} inputMode="numeric" />
                        </label>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={promotionDraft.isFlashOffer} onChange={(event) => setPromotionDraft((current) => ({ ...current, isFlashOffer: event.target.checked }))} />
                                Flash
                            </label>
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={promotionDraft.isActive} onChange={(event) => setPromotionDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                                Activa
                            </label>
                        </div>
                        <div className="md:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                className="btn-primary text-sm"
                                disabled={actionKey === 'promotion-submit' || !promotionDraft.businessId || !promotionDraft.title.trim() || !promotionDraft.discountValue.trim() || !promotionDraft.startsAt || !promotionDraft.endsAt}
                            >
                                {actionKey === 'promotion-submit' ? 'Guardando...' : editingPromotionId ? 'Actualizar promocion' : 'Crear promocion'}
                            </button>
                        </div>
                    </form>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Ofertas publicables</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">Promociones creadas</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select className="input-field min-w-[10rem]" value={promotionStatusFilter} onChange={(event) => setPromotionStatusFilter(event.target.value as PromotionLifecycleStatus)}>
                                <option value="ALL">Todas</option>
                                <option value="ACTIVE">Activas</option>
                                <option value="SCHEDULED">Programadas</option>
                                <option value="EXPIRED">Expiradas</option>
                            </select>
                            <select className="input-field min-w-[10rem]" value={promotionBusinessFilter} onChange={(event) => setPromotionBusinessFilter(event.target.value)}>
                                <option value="">Todos los negocios</option>
                                {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {promotions.data.length > 0 ? promotions.data.map((promotion) => {
                            const lifecycle = getPromotionLifecycle(promotion);
                            return (
                                <article key={promotion.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-slate-900">{promotion.title}</p>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getPromotionStatusTone(lifecycle)}`}>{getPromotionStatusLabel(lifecycle)}</span>
                                                {promotion.isFlashOffer ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Flash</span> : null}
                                            </div>
                                            <p className="mt-1 text-sm text-slate-600">{promotion.business.name}</p>
                                            <p className="mt-1 text-xs text-slate-500">{formatDateDo(promotion.startsAt)} al {formatDateDo(promotion.endsAt)}</p>
                                        </div>
                                        <div className="text-right text-xs text-slate-500">
                                            <p className="font-semibold text-slate-900">{promotion.discountType === 'PERCENTAGE' ? `${promotion.discountValue}%` : formatCurrencyDo(promotion.discountValue)}</p>
                                            <p>{promotion.couponCode || 'Sin cupon'}</p>
                                        </div>
                                    </div>
                                    {promotion.description ? <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-600">{promotion.description}</p> : null}
                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-xs text-slate-500">Creada {formatDateTimeDo(promotion.createdAt)}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" className="btn-secondary text-sm" onClick={() => handlePromotionEdit(promotion)}>Editar</button>
                                            <button type="button" className="btn-secondary text-sm" onClick={() => void handlePromotionDelete(promotion)} disabled={actionKey === `promotion-delete-${promotion.id}`}>
                                                {actionKey === `promotion-delete-${promotion.id}` ? 'Eliminando...' : 'Eliminar'}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">No hay promociones para el filtro actual.</div>}
                    </div>
                </article>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Ads internos</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900">Crear campana</h3>
                    </div>

                    <form className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={(event) => void handleCampaignSubmit(event)}>
                        <label className="block text-sm font-medium text-slate-700">
                            Negocio
                            <select className="input-field mt-2" value={campaignDraft.businessId} onChange={(event) => setCampaignDraft((current) => ({ ...current, businessId: event.target.value }))}>
                                <option value="">Selecciona un negocio</option>
                                {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Estado
                            <select className="input-field mt-2" value={campaignDraft.status} onChange={(event) => setCampaignDraft((current) => ({ ...current, status: event.target.value as AdCampaignStatus }))}>
                                <option value="DRAFT">Borrador</option>
                                <option value="ACTIVE">Activa</option>
                                <option value="PAUSED">Pausada</option>
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                            Nombre
                            <input className="input-field mt-2" value={campaignDraft.name} onChange={(event) => setCampaignDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ej: Boost brunch Santo Domingo" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Provincia objetivo
                            <select className="input-field mt-2" value={campaignDraft.targetProvinceId} onChange={(event) => setCampaignDraft((current) => ({ ...current, targetProvinceId: event.target.value }))}>
                                <option value="">Todas</option>
                                {provinces.map((province) => <option key={province.id} value={province.id}>{province.name}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Categoria objetivo
                            <select className="input-field mt-2" value={campaignDraft.targetCategoryId} onChange={(event) => setCampaignDraft((current) => ({ ...current, targetCategoryId: event.target.value }))}>
                                <option value="">Todas</option>
                                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Diario
                            <input className="input-field mt-2" value={campaignDraft.dailyBudget} onChange={(event) => setCampaignDraft((current) => ({ ...current, dailyBudget: event.target.value }))} inputMode="decimal" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Total
                            <input className="input-field mt-2" value={campaignDraft.totalBudget} onChange={(event) => setCampaignDraft((current) => ({ ...current, totalBudget: event.target.value }))} inputMode="decimal" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Bid
                            <input className="input-field mt-2" value={campaignDraft.bidAmount} onChange={(event) => setCampaignDraft((current) => ({ ...current, bidAmount: event.target.value }))} inputMode="decimal" />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Inicio
                            <input className="input-field mt-2" type="datetime-local" value={campaignDraft.startsAt} onChange={(event) => setCampaignDraft((current) => ({ ...current, startsAt: event.target.value }))} />
                        </label>
                        <label className="block text-sm font-medium text-slate-700">
                            Fin
                            <input className="input-field mt-2" type="datetime-local" value={campaignDraft.endsAt} onChange={(event) => setCampaignDraft((current) => ({ ...current, endsAt: event.target.value }))} />
                        </label>
                        <div className="md:col-span-2 flex justify-end">
                            <button
                                type="submit"
                                className="btn-primary text-sm"
                                disabled={actionKey === 'campaign-create' || !campaignDraft.businessId || !campaignDraft.name.trim() || !campaignDraft.dailyBudget.trim() || !campaignDraft.totalBudget.trim() || !campaignDraft.bidAmount.trim() || !campaignDraft.startsAt || !campaignDraft.endsAt}
                            >
                                {actionKey === 'campaign-create' ? 'Creando...' : 'Crear campana'}
                            </button>
                        </div>
                    </form>
                </article>

                <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-700">Campanas</p>
                            <h3 className="mt-1 text-lg font-semibold text-slate-900">Estado y rendimiento</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <select className="input-field min-w-[10rem]" value={campaignStatusFilter} onChange={(event) => setCampaignStatusFilter(event.target.value as AdCampaignStatus | '')}>
                                <option value="">Todos los estados</option>
                                <option value="DRAFT">Borrador</option>
                                <option value="ACTIVE">Activa</option>
                                <option value="PAUSED">Pausada</option>
                                <option value="ENDED">Finalizada</option>
                                <option value="REJECTED">Rechazada</option>
                            </select>
                            <select className="input-field min-w-[10rem]" value={campaignBusinessFilter} onChange={(event) => setCampaignBusinessFilter(event.target.value)}>
                                <option value="">Todos los negocios</option>
                                {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3">
                        {campaigns.data.length > 0 ? campaigns.data.map((campaign) => (
                            <article key={campaign.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium text-slate-900">{campaign.name}</p>
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getCampaignTone(campaign.status)}`}>{getCampaignLabel(campaign.status)}</span>
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{campaign.business.name}</p>
                                        <p className="mt-1 text-xs text-slate-500">{formatDateDo(campaign.startsAt)} al {formatDateDo(campaign.endsAt)}</p>
                                    </div>
                                    <div className="text-right text-xs text-slate-500">
                                        <p>CTR {campaign.ctr}%</p>
                                        <p>{formatNumberDo(campaign.clicks)} clicks</p>
                                    </div>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                                    <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Diario</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrencyDo(campaign.dailyBudget)}</p></div>
                                    <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Total</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrencyDo(campaign.totalBudget)}</p></div>
                                    <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Gastado</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrencyDo(campaign.spentAmount)}</p></div>
                                    <div className="rounded-xl bg-white p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Bid</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrencyDo(campaign.bidAmount)}</p></div>
                                </div>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-slate-500">{campaign.targetProvince?.name || 'Todas las provincias'} | {campaign.targetCategory?.name || 'Todas las categorias'}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'] as AdCampaignStatus[]).map((status) => (
                                            <button key={status} type="button" className="btn-secondary text-sm" onClick={() => void handleCampaignStatusUpdate(campaign.id, status)} disabled={campaign.status === status || actionKey === `campaign-status-${campaign.id}`}>
                                                {campaign.status === status ? getCampaignLabel(status) : `Pasar a ${getCampaignLabel(status).toLowerCase()}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </article>
                        )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-600">No hay campanas para el filtro actual.</div>}
                    </div>
                </article>
            </div>
        </section>
    );
}
