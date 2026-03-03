import type { Dispatch, FormEvent, SetStateAction } from 'react';

interface BusinessOption {
    id: string;
    name: string;
}

type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED';

interface CampaignForm {
    businessId: string;
    name: string;
    dailyBudget: string;
    totalBudget: string;
    bidAmount: string;
    startsAt: string;
    endsAt: string;
    status: 'DRAFT' | 'ACTIVE';
}

interface AdCampaign {
    id: string;
    name: string;
    status: CampaignStatus;
    dailyBudget: number;
    totalBudget: number;
    bidAmount: number;
    spentAmount: number;
    impressions: number;
    clicks: number;
    ctr: number;
    startsAt: string;
    endsAt: string;
    business: { id: string; name: string };
}

interface AdWalletTopup {
    id: string;
    amount: number;
    currency: string;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
    paidAt?: string | null;
    createdAt: string;
    failureReason?: string | null;
}

interface TopupStatus {
    label: string;
    className: string;
}

interface DashboardAdsTabProps {
    businesses: BusinessOption[];
    adsLoading: boolean;
    loadAdCampaigns: () => Promise<void>;
    adsWalletBalance: number;
    handleCreateAdsWalletTopup: (event: FormEvent) => Promise<void>;
    adsWalletTopupAmount: string;
    setAdsWalletTopupAmount: Dispatch<SetStateAction<string>>;
    creatingAdsWalletTopup: boolean;
    adsWalletTopups: AdWalletTopup[];
    resolveAdsWalletTopupStatus: (status: AdWalletTopup['status']) => TopupStatus;
    formatCurrency: (value: string | number | null | undefined) => string;
    formatDateTime: (value?: string | null) => string;
    handleCreateCampaign: (event: FormEvent) => Promise<void>;
    campaignForm: CampaignForm;
    setCampaignForm: Dispatch<SetStateAction<CampaignForm>>;
    creatingCampaign: boolean;
    campaigns: AdCampaign[];
    updatingCampaignId: string | null;
    handleCampaignStatus: (campaignId: string, status: CampaignStatus) => Promise<void>;
}

export function DashboardAdsTab({
    businesses,
    adsLoading,
    loadAdCampaigns,
    adsWalletBalance,
    handleCreateAdsWalletTopup,
    adsWalletTopupAmount,
    setAdsWalletTopupAmount,
    creatingAdsWalletTopup,
    adsWalletTopups,
    resolveAdsWalletTopupStatus,
    formatCurrency,
    formatDateTime,
    handleCreateCampaign,
    campaignForm,
    setCampaignForm,
    creatingCampaign,
    campaigns,
    updatingCampaignId,
    handleCampaignStatus,
}: DashboardAdsTabProps) {
    return (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="card p-5 xl:col-span-1">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Ads Wallet</h3>
                <div className="rounded-xl border border-gray-100 p-3 mb-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500">Saldo disponible</p>
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => void loadAdCampaigns()}
                            disabled={adsLoading}
                        >
                            Refrescar
                        </button>
                    </div>
                    <p className={`text-2xl font-bold ${adsWalletBalance > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatCurrency(adsWalletBalance)}
                    </p>
                    <form onSubmit={(event) => void handleCreateAdsWalletTopup(event)} className="flex items-end gap-2">
                        <div className="flex-1">
                            <label htmlFor="ads-wallet-topup-amount" className="text-xs text-gray-500 block mb-1">Recargar saldo (DOP)</label>
                            <input
                                id="ads-wallet-topup-amount"
                                type="number"
                                min="1"
                                step="0.01"
                                className="input-field text-sm"
                                value={adsWalletTopupAmount}
                                onChange={(event) => setAdsWalletTopupAmount(event.target.value)}
                            />
                        </div>
                        <button type="submit" className="btn-primary text-sm" disabled={creatingAdsWalletTopup}>
                            {creatingAdsWalletTopup ? 'Conectando...' : 'Recargar'}
                        </button>
                    </form>
                    <p className="text-xs text-gray-500">Cada clic valido descuenta el CPC de la campana desde este saldo.</p>
                </div>

                <div className="mb-5">
                    <p className="text-xs text-gray-500 mb-2">Ultimas recargas</p>
                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                        {adsWalletTopups.length > 0 ? adsWalletTopups.slice(0, 8).map((topup) => {
                            const status = resolveAdsWalletTopupStatus(topup.status);
                            return (
                                <div key={topup.id} className="rounded-lg border border-gray-100 px-3 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-medium text-gray-900">{formatCurrency(topup.amount)}</p>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${status.className}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        {formatDateTime(topup.paidAt || topup.createdAt)}
                                    </p>
                                    {topup.failureReason ? (
                                        <p className="text-[11px] text-red-600 mt-1">{topup.failureReason}</p>
                                    ) : null}
                                </div>
                            );
                        }) : <p className="text-sm text-gray-500">Sin recargas registradas.</p>}
                    </div>
                </div>

                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Nueva campana</h3>
                <form onSubmit={(event) => void handleCreateCampaign(event)} className="space-y-3">
                    <select
                        className="input-field text-sm"
                        value={campaignForm.businessId}
                        onChange={(event) =>
                            setCampaignForm((previous) => ({
                                ...previous,
                                businessId: event.target.value,
                            }))
                        }
                    >
                        <option value="">Selecciona negocio</option>
                        {businesses.map((business) => (
                            <option key={business.id} value={business.id}>{business.name}</option>
                        ))}
                    </select>
                    <input
                        className="input-field text-sm"
                        placeholder="Nombre campana"
                        value={campaignForm.name}
                        onChange={(event) =>
                            setCampaignForm((previous) => ({
                                ...previous,
                                name: event.target.value,
                            }))
                        }
                    />
                    <div className="grid grid-cols-3 gap-2">
                        <input
                            type="number"
                            min="1"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="Diario"
                            value={campaignForm.dailyBudget}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    dailyBudget: event.target.value,
                                }))
                            }
                        />
                        <input
                            type="number"
                            min="1"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="Total"
                            value={campaignForm.totalBudget}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    totalBudget: event.target.value,
                                }))
                            }
                        />
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className="input-field text-sm"
                            placeholder="CPC"
                            value={campaignForm.bidAmount}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    bidAmount: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="datetime-local"
                            className="input-field text-sm"
                            value={campaignForm.startsAt}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    startsAt: event.target.value,
                                }))
                            }
                        />
                        <input
                            type="datetime-local"
                            className="input-field text-sm"
                            value={campaignForm.endsAt}
                            onChange={(event) =>
                                setCampaignForm((previous) => ({
                                    ...previous,
                                    endsAt: event.target.value,
                                }))
                            }
                        />
                    </div>
                    <select
                        className="input-field text-sm"
                        value={campaignForm.status}
                        onChange={(event) =>
                            setCampaignForm((previous) => ({
                                ...previous,
                                status: event.target.value as 'DRAFT' | 'ACTIVE',
                            }))
                        }
                    >
                        <option value="DRAFT">Borrador</option>
                        <option value="ACTIVE">Activa</option>
                    </select>
                    <button type="submit" className="btn-primary text-sm" disabled={creatingCampaign}>
                        {creatingCampaign ? 'Creando...' : 'Crear campana'}
                    </button>
                </form>
            </div>

            <div className="card p-5 xl:col-span-2">
                <h3 className="font-display text-lg font-semibold text-gray-900 mb-3">Campanas actuales</h3>
                <div className="space-y-2 max-h-[34rem] overflow-y-auto pr-1">
                    {adsLoading ? (
                        <p className="text-sm text-gray-500">Cargando campanas ads...</p>
                    ) : campaigns.length > 0 ? (
                        campaigns.map((campaign) => (
                            <div key={campaign.id} className="rounded-xl border border-gray-100 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="font-medium text-gray-900">{campaign.name}</p>
                                        <p className="text-xs text-gray-500">{campaign.business.name}</p>
                                    </div>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                        {campaign.status}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    CPC {formatCurrency(campaign.bidAmount)} -
                                    Presupuesto {formatCurrency(campaign.spentAmount)} / {formatCurrency(campaign.totalBudget)} -
                                    CTR {campaign.ctr}%
                                </p>
                                <div className="flex gap-2 mt-2">
                                    {campaign.status !== 'ACTIVE' && campaign.status !== 'ENDED' && (
                                        <button
                                            type="button"
                                            className="btn-primary text-xs"
                                            disabled={updatingCampaignId === campaign.id}
                                            onClick={() => void handleCampaignStatus(campaign.id, 'ACTIVE')}
                                        >
                                            Activar
                                        </button>
                                    )}
                                    {campaign.status === 'ACTIVE' && (
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={updatingCampaignId === campaign.id}
                                            onClick={() => void handleCampaignStatus(campaign.id, 'PAUSED')}
                                        >
                                            Pausar
                                        </button>
                                    )}
                                    {campaign.status !== 'ENDED' && (
                                        <button
                                            type="button"
                                            className="btn-secondary text-xs"
                                            disabled={updatingCampaignId === campaign.id}
                                            onClick={() => void handleCampaignStatus(campaign.id, 'ENDED')}
                                        >
                                            Finalizar
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">No hay campanas creadas.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
