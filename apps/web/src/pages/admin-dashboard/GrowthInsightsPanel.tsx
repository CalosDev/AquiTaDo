import { AppCard, EmptyState } from '../../components/ui';
import type { GrowthInsightsSnapshot, TrendDirection, TrendMetricSnapshot } from './types';

const OPERATIONS_RHYTHMS = [
    {
        cadence: 'Diario',
        owner: 'Soporte',
        title: 'Recovery y email',
        detail: 'Revisar badge Email, Recovery 24h, expirados y alertas con SLA de 24h.',
    },
    {
        cadence: 'Diario',
        owner: 'Trust & Safety',
        title: 'Premoderacion',
        detail: 'Mirar release rate, top razones y casos HIGH antes de abrir mas volumen a KYC.',
    },
    {
        cadence: 'Semanal',
        owner: 'Growth',
        title: 'Discovery lista/mapa',
        detail: 'Comparar seleccion en mapa, CTR a fichas y cambios de filtros contra la ventana previa.',
    },
    {
        cadence: 'Semanal',
        owner: 'Producto',
        title: 'Onboarding de negocios',
        detail: 'Revisar caidas por paso, alertas de friccion y microcopy del paso con mayor abandono.',
    },
] as const;

type GrowthInsightsPanelProps = {
    growthInsights: GrowthInsightsSnapshot | null;
    marketTrackedBusinesses: number;
    marketConversionRate: number;
    loading: boolean;
    refreshing: boolean;
    onRefresh: () => void;
};

export function GrowthInsightsPanel({
    growthInsights,
    marketTrackedBusinesses,
    marketConversionRate,
    loading,
    refreshing,
    onRefresh,
}: GrowthInsightsPanelProps) {
    return (
        <AppCard
            title="Insights de mercado y growth"
            description="Alertas accionables, tendencias y señales de conversion para operar con criterio."
            actions={(
                <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={onRefresh}
                    disabled={refreshing}
                >
                    {refreshing ? 'Actualizando...' : 'Refrescar insights'}
                </button>
            )}
        >

            {loading ? (
                <EmptyState
                    title="Cargando insights"
                    body="Estamos reuniendo alertas, tendencias y oportunidades para el equipo."
                />
            ) : (
                <div className="space-y-4">
                    {growthInsights?.actionableAlerts?.length ? (
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                            {growthInsights.actionableAlerts.map((alert) => (
                                <div
                                    key={`${alert.metricKey}-${alert.title}`}
                                    className={`rounded-xl border p-3 ${alertLevelClass(alert.level)}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-semibold">{alert.title}</p>
                                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold">
                                            {alert.level}
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm opacity-90">{alert.description}</p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                                        <span className="rounded-full bg-white/80 px-2 py-0.5">
                                            Owner: {alert.owner}
                                        </span>
                                        <span className="rounded-full bg-white/80 px-2 py-0.5">
                                            SLA: {alert.slaHours}h
                                        </span>
                                        <span className="rounded-full bg-white/80 px-2 py-0.5">
                                            Cadencia: {alert.cadence}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide opacity-70">
                                        Playbook: {alert.playbookSection}
                                    </p>
                                    <p className="mt-1 text-sm opacity-90">
                                        Siguiente accion: {alert.recommendedAction}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h4 className="font-medium text-gray-900">Cadencia operativa</h4>
                            <span className="text-xs text-gray-500">Rutina sugerida con owners visibles</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {OPERATIONS_RHYTHMS.map((item) => (
                                <div key={`${item.cadence}-${item.title}`} className="rounded-xl bg-slate-50 px-3 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                            {item.cadence}
                                        </span>
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                                            {item.owner}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-sm font-semibold text-slate-900">{item.title}</p>
                                    <p className="mt-1 text-xs text-slate-600">{item.detail}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {growthInsights?.trendComparisons ? (
                        <div className="rounded-xl border border-gray-100 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <h4 className="font-medium text-gray-900">Tendencias vs ventana previa</h4>
                                <span className="text-xs text-gray-500">
                                    {growthInsights.trendComparisons.comparisonLabel}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                                <TrendCard
                                    label="Recovery completado"
                                    metric={growthInsights.trendComparisons.activation.recoveryCompletionRatePct}
                                    suffix=" pp"
                                    valueSuffix="%"
                                />
                                <TrendCard
                                    label="Seleccion en mapa"
                                    metric={growthInsights.trendComparisons.discovery.mapSelectionRatePct}
                                    suffix=" pp"
                                    valueSuffix="%"
                                />
                                <TrendCard
                                    label="Release rate premoderacion"
                                    metric={growthInsights.trendComparisons.moderation.releaseRatePct}
                                    suffix=" pp"
                                    valueSuffix="%"
                                />
                                <TrendCard
                                    label="Onboarding completado"
                                    metric={growthInsights.trendComparisons.onboarding.completionRatePct}
                                    suffix=" pp"
                                    valueSuffix="%"
                                />
                            </div>
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <MetricSummaryCard label="Negocios trackeados" value={marketTrackedBusinesses} />
                        <MetricSummaryCard label="Conversion global" value={`${marketConversionRate}%`} valueClassName="text-primary-700" />
                        <MetricSummaryCard
                            label="Search a WhatsApp"
                            value={`${growthInsights?.conversionFunnels.searchToWhatsApp.conversionRate ?? 0}%`}
                            valueClassName="text-primary-700"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <MetricSummaryCard
                            label="Shares ficha"
                            value={growthInsights?.activationMetrics.shareClicks ?? 0}
                            detail="Compartidos nativos o copiados"
                        />
                        <MetricSummaryCard
                            label="Recovery"
                            value={growthInsights?.activationMetrics.passwordResetRequests ?? 0}
                            detail={`Completados ${growthInsights?.activationMetrics.passwordResetCompletions ?? 0}`}
                        />
                        <MetricSummaryCard
                            label="Google OAuth"
                            value={growthInsights?.activationMetrics.googleAuthSuccesses ?? 0}
                            detail={`Login ${growthInsights?.activationMetrics.googleAuthLoginSuccesses ?? 0} | Registro ${growthInsights?.activationMetrics.googleAuthRegistrationSuccesses ?? 0}`}
                        />
                        <MetricSummaryCard
                            label="CTA sticky"
                            value={(growthInsights?.activationMetrics.stickyPhoneClicks ?? 0) + (growthInsights?.activationMetrics.stickyWhatsAppClicks ?? 0)}
                            detail={`Telefono ${growthInsights?.activationMetrics.stickyPhoneClicks ?? 0} | WhatsApp ${growthInsights?.activationMetrics.stickyWhatsAppClicks ?? 0}`}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                        <MetricSummaryCard
                            label="Descubrimiento lista/mapa"
                            value={(growthInsights?.discoveryMetrics.mapViewChanges ?? 0) + (growthInsights?.discoveryMetrics.listViewChanges ?? 0)}
                            detail={`Mapa ${growthInsights?.discoveryMetrics.mapViewChanges ?? 0} | Lista ${growthInsights?.discoveryMetrics.listViewChanges ?? 0}`}
                        />
                        <MetricSummaryCard
                            label="Filtros y orden"
                            value={(growthInsights?.discoveryMetrics.listingFilterApplies ?? 0) + (growthInsights?.discoveryMetrics.listingSortChanges ?? 0)}
                            detail={`Filtros ${growthInsights?.discoveryMetrics.listingFilterApplies ?? 0} | Orden ${growthInsights?.discoveryMetrics.listingSortChanges ?? 0}`}
                        />
                        <MetricSummaryCard
                            label="Premoderacion resuelta"
                            value={`${growthInsights?.moderationMetrics.releaseRatePct ?? 0}%`}
                            detail={`Liberados ${growthInsights?.moderationMetrics.premoderationReleased ?? 0} | Confirmados ${growthInsights?.moderationMetrics.premoderationConfirmed ?? 0}`}
                        />
                        <MetricSummaryCard
                            label="Onboarding negocios"
                            value={`${growthInsights?.onboardingMetrics.completionRatePct ?? 0}%`}
                            detail={`Inicios ${growthInsights?.onboardingMetrics.step1Sessions ?? 0} | Completados ${growthInsights?.onboardingMetrics.completedSessions ?? 0}`}
                        />
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <SimpleKeyValueList
                            title="Top categorias buscadas"
                            emptyMessage="Sin datos de categorias."
                            items={growthInsights?.topSearchedCategories?.slice(0, 8).map((item) => ({
                                key: `${item.categoryId || 'none'}-${item.categoryName}`,
                                label: item.categoryName,
                                value: item.searches,
                            })) ?? []}
                        />

                        <div className="rounded-xl border border-gray-100 p-3">
                            <h4 className="font-medium text-gray-900 mb-2">Brechas oferta-demanda</h4>
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                {growthInsights?.demandSupplyGaps?.length ? growthInsights.demandSupplyGaps.slice(0, 8).map((gap) => (
                                    <div key={`${gap.provinceId || 'all'}-${gap.categoryId || 'all'}`} className="rounded-lg bg-gray-50 px-2 py-1.5">
                                        <p className="text-sm text-gray-900">
                                            {gap.provinceName} · {gap.categoryName}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            Demanda {gap.demandSearches} · Oferta {gap.supplyBusinesses} · Ratio {gap.demandSupplyRatio}
                                        </p>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">Sin brechas registradas.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-gray-100 p-3">
                            <h4 className="font-medium text-gray-900 mb-2">Uso del listado</h4>
                            <div className="space-y-2">
                                <InfoRow label="Clicks a fichas desde listado" value={growthInsights?.discoveryMetrics.listingResultClicks ?? 0} />
                                <InfoRow label="Selecciones en mapa" value={growthInsights?.discoveryMetrics.mapSelections ?? 0} />
                                <InfoRow label="Clicks patrocinados" value={growthInsights?.discoveryMetrics.sponsoredResultClicks ?? 0} />
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 p-3">
                            <h4 className="font-medium text-gray-900 mb-2">Top razones de premoderacion</h4>
                            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                {growthInsights?.moderationMetrics.topReasons?.length ? growthInsights.moderationMetrics.topReasons.map((item) => (
                                    <div key={item.reason} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                                        <span className="text-gray-700">{item.reason}</span>
                                        <span className="font-medium text-gray-900">{item.count}</span>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500">Sin suficientes eventos de premoderacion todavia.</p>
                                )}
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                Flaggeados {growthInsights?.moderationMetrics.premoderationFlagged ?? 0}
                                {' '}| Negocios unicos {growthInsights?.moderationMetrics.uniqueFlaggedBusinesses ?? 0}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 p-3">
                        <h4 className="font-medium text-gray-900 mb-2">Funnel onboarding de negocios</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                            <FunnelStepCard label="Paso 1" value={growthInsights?.onboardingMetrics.step1Sessions ?? 0} />
                            <FunnelStepCard label="Paso 2" value={growthInsights?.onboardingMetrics.step2Sessions ?? 0} />
                            <FunnelStepCard label="Paso 3" value={growthInsights?.onboardingMetrics.step3Sessions ?? 0} />
                            <FunnelStepCard label="Paso 4" value={growthInsights?.onboardingMetrics.step4Sessions ?? 0} />
                            <FunnelStepCard label="Publicados" value={growthInsights?.onboardingMetrics.completedSessions ?? 0} highlight />
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 p-3">
                        <h4 className="font-medium text-gray-900 mb-2">A/B test contacto a WhatsApp</h4>
                        <div className="space-y-2">
                            {growthInsights?.abTesting?.variants?.length ? growthInsights.abTesting.variants.map((variant) => (
                                <div key={variant.variantKey} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2">
                                    <span className="text-sm text-gray-700">{variant.variantKey}</span>
                                    <span className="text-sm text-gray-900">
                                        {variant.conversionRate}% ({variant.whatsappClicks}/{variant.contactClicks})
                                    </span>
                                </div>
                            )) : (
                                <p className="text-sm text-gray-500">Sin variantes activas.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AppCard>
    );
}

function TrendCard({
    label,
    metric,
    suffix = '',
    valueSuffix = '',
}: {
    label: string;
    metric: TrendMetricSnapshot;
    suffix?: string;
    valueSuffix?: string;
}) {
    return (
        <div className="rounded-xl bg-slate-50 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500">{label}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${trendDirectionClass(metric.direction)}`}>
                    {formatTrendDelta(metric, suffix, 2)}
                </span>
            </div>
            <p className="mt-2 text-xl font-semibold text-slate-900">
                {metric.current}{valueSuffix}
            </p>
            <p className="mt-1 text-xs text-gray-500">
                Antes {metric.previous}{valueSuffix}
            </p>
        </div>
    );
}

function MetricSummaryCard({
    label,
    value,
    detail,
    valueClassName = 'text-slate-900',
}: {
    label: string;
    value: string | number;
    detail?: string;
    valueClassName?: string;
}) {
    return (
        <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-semibold ${valueClassName}`}>{value}</p>
            {detail ? <p className="mt-1 text-xs text-gray-500">{detail}</p> : null}
        </div>
    );
}

function SimpleKeyValueList({
    title,
    items,
    emptyMessage,
}: {
    title: string;
    items: Array<{ key: string; label: string; value: number }>;
    emptyMessage: string;
}) {
    return (
        <div className="rounded-xl border border-gray-100 p-3">
            <h4 className="font-medium text-gray-900 mb-2">{title}</h4>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {items.length ? items.map((item) => (
                    <div key={item.key} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate pr-2">{item.label}</span>
                        <span className="text-gray-900 font-medium">{item.value}</span>
                    </div>
                )) : (
                    <p className="text-sm text-gray-500">{emptyMessage}</p>
                )}
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: number }) {
    return (
        <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{label}</span>
            <span className="font-medium text-gray-900">{value}</span>
        </div>
    );
}

function FunnelStepCard({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: number;
    highlight?: boolean;
}) {
    return (
        <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-primary-50' : 'bg-gray-50'}`}>
            <p className={`text-xs ${highlight ? 'text-primary-700' : 'text-gray-500'}`}>{label}</p>
            <p className={`text-lg font-semibold ${highlight ? 'text-primary-900' : 'text-gray-900'}`}>{value}</p>
        </div>
    );
}

function alertLevelClass(level: 'HIGH' | 'MEDIUM'): string {
    return level === 'HIGH'
        ? 'border-red-200 bg-red-50 text-red-900'
        : 'border-amber-200 bg-amber-50 text-amber-900';
}

function trendDirectionClass(direction: TrendDirection): string {
    if (direction === 'up') {
        return 'bg-sky-100 text-sky-700';
    }
    if (direction === 'down') {
        return 'bg-slate-200 text-slate-700';
    }
    return 'bg-gray-100 text-gray-600';
}

function formatTrendNumber(value: number, precision = 0): string {
    const normalized = precision === 0
        ? Math.round(value).toString()
        : value.toFixed(precision);

    return normalized
        .replace(/\.0+$/, '')
        .replace(/(\.\d*[1-9])0+$/, '$1');
}

function formatTrendDelta(
    metric: TrendMetricSnapshot,
    suffix = '',
    precision = 0,
): string {
    const sign = metric.delta > 0 ? '+' : '';
    return `${sign}${formatTrendNumber(metric.delta, precision)}${suffix}`;
}
