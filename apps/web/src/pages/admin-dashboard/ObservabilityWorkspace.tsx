import {
    frontendAlertClass,
    frontendVitalClass,
    healthStatusClass,
    healthStatusLabel,
    type FrontendHealthSummary,
    type ObservabilitySummary,
} from './helpers';
import type { OperationalDashboardSnapshot } from './types';

type ObservabilityWorkspaceProps = {
    frontendHealthSummary: FrontendHealthSummary;
    observabilityLoading: boolean;
    observabilityRaw: string;
    observabilitySummary: ObservabilitySummary;
    operationalHealth: OperationalDashboardSnapshot | null;
    operationalHealthLoading: boolean;
    rawMetricsLoaded: boolean;
    rawMetricsLoading: boolean;
    onRefreshHealth: () => Promise<void>;
    onRefreshOperationalHealth: () => Promise<void>;
    onLoadRawMetrics: () => Promise<void>;
};

export function ObservabilityWorkspace({
    frontendHealthSummary,
    observabilityLoading,
    observabilityRaw,
    observabilitySummary,
    operationalHealth,
    operationalHealthLoading,
    rawMetricsLoaded,
    rawMetricsLoading,
    onRefreshHealth,
    onRefreshOperationalHealth,
    onLoadRawMetrics,
}: ObservabilityWorkspaceProps) {
    return (
        <div className="space-y-4">
            <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <h3 className="font-display font-semibold text-gray-900">Centro de operaciones</h3>
                    <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => {
                            void onRefreshOperationalHealth();
                            void onRefreshHealth();
                        }}
                        disabled={operationalHealthLoading || observabilityLoading}
                    >
                        {operationalHealthLoading ? 'Actualizando...' : 'Actualizar estado'}
                    </button>
                </div>

                {operationalHealth ? (
                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.status)}`}>
                                Plataforma {healthStatusLabel(operationalHealth.status)}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.database?.status)}`}>
                                DB {healthStatusLabel(operationalHealth.checks?.database?.status)}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.database?.pool?.status)}`}>
                                Pool DB {healthStatusLabel(operationalHealth.checks?.database?.pool?.status)}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.email?.status)}`}>
                                Email {healthStatusLabel(operationalHealth.checks?.email?.status)}
                            </span>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${healthStatusClass(operationalHealth.checks?.whatsapp?.status)}`}>
                                WhatsApp {healthStatusLabel(operationalHealth.checks?.whatsapp?.status)}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Saturacion DB</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {operationalHealth.checks?.database?.pool?.saturationPct ?? 0}%
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Uptime</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {Math.floor((operationalHealth.uptimeSeconds || 0) / 60)} min
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Latencia health</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {operationalHealth.responseTimeMs ?? 0} ms
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Recovery 24h</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {operationalHealth.passwordReset?.requestsLast24h ?? 0}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                    Completados {operationalHealth.passwordReset?.completionsLast24h ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Rate reset</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {operationalHealth.passwordReset?.completionRatePct ?? 0}%
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                    Activos {operationalHealth.passwordReset?.activeTokens ?? 0}
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <p className="text-xs text-gray-500">Reset expirados</p>
                                <p className="text-xl font-semibold text-gray-900">
                                    {operationalHealth.passwordReset?.expiredPendingTokens ?? 0}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                    Proveedor {operationalHealth.passwordReset?.providerConfigured ? 'configurado' : 'no configurado'}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500">
                        No hay datos operativos disponibles en este momento.
                    </p>
                )}
            </div>

            <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                        <h3 className="font-display font-semibold text-gray-900">Resumen operativo</h3>
                        <p className="mt-1 text-sm text-gray-600">
                            El resumen Prometheus se carga bajo demanda para mantener ligero el panel.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => {
                                void onRefreshHealth();
                                void onRefreshOperationalHealth();
                            }}
                            disabled={observabilityLoading}
                        >
                            {observabilityLoading ? 'Actualizando...' : 'Actualizar salud'}
                        </button>
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => void onLoadRawMetrics()}
                            disabled={rawMetricsLoading}
                        >
                            {rawMetricsLoading
                                ? 'Cargando raw...'
                                : rawMetricsLoaded
                                    ? 'Actualizar raw'
                                    : 'Cargar raw metrics'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Requests totales</p>
                        <p className="text-xl font-semibold text-gray-900">
                            {rawMetricsLoaded ? observabilitySummary.totalRequests : '--'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Errores 5xx</p>
                        <p className="text-xl font-semibold text-red-700">
                            {rawMetricsLoaded ? observabilitySummary.errors5xx : '--'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Latencia promedio</p>
                        <p className="text-xl font-semibold text-primary-700">
                            {rawMetricsLoaded ? `${observabilitySummary.averageLatencyMs} ms` : '--'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Rate limit hits</p>
                        <p className="text-xl font-semibold text-amber-700">
                            {rawMetricsLoaded ? observabilitySummary.rateLimitHits : '--'}
                        </p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Fallas externas</p>
                        <p className="text-xl font-semibold text-purple-700">
                            {rawMetricsLoaded ? observabilitySummary.externalFailures : '--'}
                        </p>
                    </div>
                </div>
                {!rawMetricsLoaded ? (
                    <p className="mt-3 text-xs text-gray-500">
                        Las metricas raw solo se consultan cuando las necesitas para evitar una carga pesada en cada visita al panel.
                    </p>
                ) : null}
            </div>

            <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                        <h3 className="font-display font-semibold text-gray-900">Salud frontend</h3>
                        <p className="mt-1 text-sm text-gray-600">
                            Errores cliente, web vitals y rutas calientes de las ultimas 24 horas.
                        </p>
                    </div>
                    <div className="text-xs text-gray-500">
                        {frontendHealthSummary.generatedAt
                            ? `Actualizado ${new Date(frontendHealthSummary.generatedAt).toLocaleString()}`
                            : 'Sin muestras recientes'}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Route views</p>
                        <p className="text-xl font-semibold text-gray-900">{frontendHealthSummary.totalRouteViews}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Errores cliente</p>
                        <p className="text-xl font-semibold text-red-700">{frontendHealthSummary.totalClientErrors}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Vitals no saludables</p>
                        <p className="text-xl font-semibold text-amber-700">{frontendHealthSummary.totalPoorVitals}</p>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <p className="text-xs text-gray-500">Alertas activas</p>
                        <p className="text-xl font-semibold text-gray-900">{frontendHealthSummary.alerts.length}</p>
                    </div>
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3">
                        <p className="text-xs text-red-600">Alertas criticas</p>
                        <p className="text-xl font-semibold text-red-700">{frontendHealthSummary.criticalAlerts}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                        <p className="text-xs text-amber-700">Alertas warn</p>
                        <p className="text-xl font-semibold text-amber-800">{frontendHealthSummary.warnAlerts}</p>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <h4 className="font-display text-sm font-semibold text-gray-900">Alertas prioritarias</h4>
                        <div className="mt-3 space-y-3">
                            {frontendHealthSummary.alerts.length > 0 ? (
                                frontendHealthSummary.alerts.map((alert) => (
                                    <div
                                        key={`${alert.kind}-${alert.route}-${alert.role}-${alert.metric ?? alert.source ?? 'general'}`}
                                        className={`rounded-xl border px-3 py-3 ${frontendAlertClass(alert.level)}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium">{alert.message}</p>
                                            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                                                {alert.level}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs opacity-80">
                                            {alert.route} · {alert.role}
                                            {alert.metric ? ` · ${alert.metric}` : ''}
                                            {alert.source ? ` · ${alert.source}` : ''}
                                            {typeof alert.value === 'number' ? ` · ${alert.value}` : ''}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">
                                    No hay alertas activas en el frontend.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <h4 className="font-display text-sm font-semibold text-gray-900">Rutas mas vistas</h4>
                        <div className="mt-3 space-y-3">
                            {frontendHealthSummary.busiestRoutes.length > 0 ? (
                                frontendHealthSummary.busiestRoutes.slice(0, 5).map((entry) => (
                                    <div key={`${entry.route}-${entry.role}`} className="rounded-xl border border-white bg-white px-3 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-gray-900">{entry.route}</p>
                                            <span className="text-sm font-semibold text-primary-700">{entry.count}</span>
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">
                                            {entry.role} · {entry.lastSeenAt ? new Date(entry.lastSeenAt).toLocaleString() : 'sin fecha'}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Aun no hay suficientes vistas de rutas reportadas.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <h4 className="font-display text-sm font-semibold text-gray-900">Web vitals delicados</h4>
                        <div className="mt-3 space-y-3">
                            {frontendHealthSummary.poorVitals.length > 0 ? (
                                frontendHealthSummary.poorVitals.slice(0, 5).map((entry) => (
                                    <div key={`${entry.route}-${entry.role}-${entry.metric}-${entry.rating}`} className="rounded-xl border border-white bg-white px-3 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-gray-900">{entry.metric}</p>
                                            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${frontendVitalClass(entry.rating)}`}>
                                                {entry.rating}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">
                                            {entry.route} · {entry.role}
                                        </p>
                                        <p className="mt-2 text-xs text-gray-600">
                                            Peor valor {entry.worstValue} · Ultimo {entry.latestValue} · muestras {entry.count}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">
                                    No hay web vitals en estado delicado.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                        <h3 className="font-display font-semibold text-gray-900">Raw metrics (Prometheus)</h3>
                        <p className="mt-1 text-sm text-gray-600">
                            Usa esta vista solo cuando necesites diagnostico fino o exportar el texto completo de Prometheus.
                        </p>
                    </div>
                    {!rawMetricsLoaded ? (
                        <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => void onLoadRawMetrics()}
                            disabled={rawMetricsLoading}
                        >
                            {rawMetricsLoading ? 'Cargando raw...' : 'Cargar raw metrics'}
                        </button>
                    ) : null}
                </div>
                {rawMetricsLoaded ? (
                    <pre className="max-h-[420px] overflow-auto rounded-xl border border-gray-100 bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                        {observabilityRaw || 'Sin datos de metricas'}
                    </pre>
                ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                        Las metricas raw aun no se han cargado en esta sesion.
                    </div>
                )}
            </div>
        </div>
    );
}
