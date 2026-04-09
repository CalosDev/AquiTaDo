import { Inject, Injectable } from '@nestjs/common';
import {
    Counter,
    Histogram,
    Registry,
    collectDefaultMetrics,
    register,
} from 'prom-client';
import { RedisService } from '../cache/redis.service';
import { FrontendSignalKind, TrackFrontendSignalDto } from './dto/frontend-observability.dto';

let defaultMetricsCollected = false;
const FRONTEND_OBSERVABILITY_TTL_SECONDS = 60 * 60 * 24 * 7;
const FRONTEND_HEALTH_WINDOW_MS = 1000 * 60 * 60 * 24;
const FRONTEND_ROUTE_VIEW_REDIS_KEY = 'observability:frontend:route-views:v1';
const FRONTEND_CLIENT_ERROR_REDIS_KEY = 'observability:frontend:client-errors:v1';
const FRONTEND_WEB_VITAL_REDIS_KEY = 'observability:frontend:web-vitals:v1';

type FrontendRouteViewSnapshot = {
    route: string;
    role: string;
    count: number;
    lastSeenAt: string | null;
};

type FrontendClientErrorSnapshot = {
    route: string;
    role: string;
    source: string;
    count: number;
    lastSeenAt: string | null;
};

type FrontendWebVitalSnapshot = {
    route: string;
    role: string;
    metric: string;
    rating: string;
    count: number;
    latestValue: number;
    worstValue: number;
    lastSeenAt: string | null;
};

type FrontendAlertSnapshot = {
    level: 'warn' | 'critical';
    kind: 'client-error' | 'web-vital';
    route: string;
    role: string;
    message: string;
    source?: string;
    metric?: string;
    rating?: string;
    value?: number;
    count?: number;
};

function getOrCreateCounter(
    registry: Registry,
    name: string,
    help: string,
    labelNames: string[],
): Counter<string> {
    const existing = registry.getSingleMetric(name);
    if (existing instanceof Counter) {
        return existing as Counter<string>;
    }

    return new Counter({
        name,
        help,
        labelNames,
        registers: [registry],
    });
}

function getOrCreateHistogram(
    registry: Registry,
    name: string,
    help: string,
    labelNames: string[],
    buckets: number[],
): Histogram<string> {
    const existing = registry.getSingleMetric(name);
    if (existing instanceof Histogram) {
        return existing as Histogram<string>;
    }

    return new Histogram({
        name,
        help,
        labelNames,
        buckets,
        registers: [registry],
    });
}

@Injectable()
export class ObservabilityService {
    private readonly maxDependencySamples = 180;
    private readonly defaultLatencyThresholdMs = 1_800;
    private readonly maxFrontendRouteSnapshots = 40;
    private readonly maxFrontendClientErrorSnapshots = 20;
    private readonly maxFrontendVitalSnapshots = 20;
    private readonly registry = register;
    private readonly requestCounter: Counter<string>;
    private readonly requestDurationHistogram: Histogram<string>;
    private readonly externalDependencyHistogram: Histogram<string>;
    private readonly externalDependencyCounter: Counter<string>;
    private readonly rateLimitCounter: Counter<string>;
    private readonly frontendRouteViewCounter: Counter<string>;
    private readonly frontendClientErrorCounter: Counter<string>;
    private readonly frontendWebVitalHistogram: Histogram<string>;
    private readonly dependencySamples = new Map<
    string,
    {
        latencies: number[];
        successCount: number;
        failureCount: number;
        lastSeenAt: number;
    }
    >();
    private readonly frontendRouteViewSamples = new Map<
    string,
    {
        route: string;
        role: string;
        count: number;
        lastSeenAt: number;
    }
    >();
    private readonly frontendClientErrorSamples = new Map<
    string,
    {
        route: string;
        role: string;
        source: string;
        count: number;
        lastSeenAt: number;
    }
    >();
    private readonly frontendWebVitalSamples = new Map<
    string,
    {
        route: string;
        role: string;
        metric: string;
        rating: string;
        count: number;
        latestValue: number;
        worstValue: number;
        lastSeenAt: number;
    }
    >();

    constructor(
        @Inject(RedisService)
        private readonly redisService: RedisService,
    ) {
        if (!defaultMetricsCollected) {
            collectDefaultMetrics({
                prefix: 'aquita_',
                register: this.registry,
            });
            defaultMetricsCollected = true;
        }

        this.requestCounter = getOrCreateCounter(
            this.registry,
            'aquita_http_requests_total',
            'Total HTTP requests',
            ['method', 'route', 'status'],
        );

        this.requestDurationHistogram = getOrCreateHistogram(
            this.registry,
            'aquita_http_request_duration_seconds',
            'HTTP request duration in seconds',
            ['method', 'route', 'status'],
            [0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3],
        );

        this.externalDependencyHistogram = getOrCreateHistogram(
            this.registry,
            'aquita_external_dependency_duration_seconds',
            'External dependency call duration in seconds',
            ['dependency', 'operation', 'success'],
            [0.01, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5, 3, 6, 10],
        );

        this.externalDependencyCounter = getOrCreateCounter(
            this.registry,
            'aquita_external_dependency_calls_total',
            'External dependency call count',
            ['dependency', 'operation', 'success'],
        );

        this.rateLimitCounter = getOrCreateCounter(
            this.registry,
            'aquita_rate_limit_hits_total',
            'Rate limit denials by policy and identifier',
            ['policy', 'identifier'],
        );

        this.frontendRouteViewCounter = getOrCreateCounter(
            this.registry,
            'aquita_frontend_route_views_total',
            'Frontend route views reported by the web client',
            ['route', 'role'],
        );

        this.frontendClientErrorCounter = getOrCreateCounter(
            this.registry,
            'aquita_frontend_client_errors_total',
            'Frontend JavaScript errors reported by the web client',
            ['route', 'source', 'role'],
        );

        this.frontendWebVitalHistogram = getOrCreateHistogram(
            this.registry,
            'aquita_frontend_web_vital_value',
            'Frontend web vital values reported by the web client',
            ['metric', 'route', 'rating', 'role'],
            [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 4, 8],
        );
    }

    trackHttpRequest(
        method: string,
        route: string,
        status: string,
        durationMs: number,
    ): void {
        this.requestCounter.inc({ method, route, status });
        this.requestDurationHistogram.observe(
            { method, route, status },
            durationMs / 1000,
        );
    }

    trackExternalDependencyCall(
        dependency: string,
        operation: string,
        durationMs: number,
        success: boolean,
    ): void {
        const normalizedDependency = dependency.trim().toLowerCase() || 'unknown';
        const normalizedOperation = operation.trim().toLowerCase() || 'unknown';
        const successLabel = success ? 'true' : 'false';

        this.externalDependencyCounter.inc({
            dependency: normalizedDependency,
            operation: normalizedOperation,
            success: successLabel,
        });
        this.externalDependencyHistogram.observe(
            {
                dependency: normalizedDependency,
                operation: normalizedOperation,
                success: successLabel,
            },
            durationMs / 1000,
        );

        const key = `${normalizedDependency}:${normalizedOperation}`;
        const current = this.dependencySamples.get(key) ?? {
            latencies: [],
            successCount: 0,
            failureCount: 0,
            lastSeenAt: 0,
        };
        current.latencies.push(durationMs);
        if (current.latencies.length > this.maxDependencySamples) {
            current.latencies.splice(0, current.latencies.length - this.maxDependencySamples);
        }
        if (success) {
            current.successCount += 1;
        } else {
            current.failureCount += 1;
        }
        current.lastSeenAt = Date.now();
        this.dependencySamples.set(key, current);
    }

    trackRateLimitHit(policy: string, identifier: 'ip' | 'api_key'): void {
        this.rateLimitCounter.inc({
            policy: policy.trim().toLowerCase() || 'default',
            identifier,
        });
    }

    trackFrontendSignal(dto: TrackFrontendSignalDto): void {
        const route = this.normalizeFrontendRoute(dto.route);
        const role = this.normalizeFrontendRole(dto.role);

        if (dto.kind === FrontendSignalKind.ROUTE_VIEW) {
            this.frontendRouteViewCounter.inc({ route, role });
            this.trackFrontendRouteView(route, role);
            return;
        }

        if (dto.kind === FrontendSignalKind.CLIENT_ERROR) {
            const source = this.normalizeFrontendSource(dto.source);
            this.frontendClientErrorCounter.inc({ route, source, role });
            this.trackFrontendClientError(route, role, source);
            return;
        }

        if (dto.kind === FrontendSignalKind.WEB_VITAL) {
            const metric = this.normalizeFrontendMetric(dto.metricName);
            const rating = this.normalizeFrontendRating(dto.rating);
            const value = Number.isFinite(dto.value) ? Number(dto.value) : 0;

            this.frontendWebVitalHistogram.observe(
                { metric, route, rating, role },
                Math.max(0, value),
            );
            this.trackFrontendWebVital(route, role, metric, rating, value);
        }
    }

    async getFrontendHealthSnapshot(): Promise<{
        generatedAt: string;
        totalRouteViews: number;
        totalClientErrors: number;
        totalPoorVitals: number;
        warnAlerts: number;
        criticalAlerts: number;
        busiestRoutes: FrontendRouteViewSnapshot[];
        clientErrors: FrontendClientErrorSnapshot[];
        poorVitals: FrontendWebVitalSnapshot[];
        alerts: FrontendAlertSnapshot[];
    }> {
        const routeViewEntries = await this.getFrontendRouteViewEntries();
        const clientErrorEntries = await this.getFrontendClientErrorEntries();
        const webVitalEntries = await this.getFrontendWebVitalEntries();

        const busiestRoutes = routeViewEntries
            .sort((left, right) => {
                if (right.count !== left.count) {
                    return right.count - left.count;
                }
                return right.lastSeenAt - left.lastSeenAt;
            })
            .slice(0, this.maxFrontendRouteSnapshots)
            .map((entry) => ({
                route: entry.route,
                role: entry.role,
                count: entry.count,
                lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt).toISOString() : null,
            }));

        const clientErrors = clientErrorEntries
            .sort((left, right) => {
                if (right.count !== left.count) {
                    return right.count - left.count;
                }
                return right.lastSeenAt - left.lastSeenAt;
            })
            .slice(0, this.maxFrontendClientErrorSnapshots)
            .map((entry) => ({
                route: entry.route,
                role: entry.role,
                source: entry.source,
                count: entry.count,
                lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt).toISOString() : null,
            }));

        const poorVitals = webVitalEntries
            .filter((entry) => entry.rating !== 'good')
            .sort((left, right) => {
                if (right.worstValue !== left.worstValue) {
                    return right.worstValue - left.worstValue;
                }
                return right.lastSeenAt - left.lastSeenAt;
            })
            .slice(0, this.maxFrontendVitalSnapshots)
            .map((entry) => ({
                route: entry.route,
                role: entry.role,
                metric: entry.metric,
                rating: entry.rating,
                count: entry.count,
                latestValue: entry.latestValue,
                worstValue: entry.worstValue,
                lastSeenAt: entry.lastSeenAt ? new Date(entry.lastSeenAt).toISOString() : null,
            }));

        const alerts: FrontendAlertSnapshot[] = [
            ...clientErrors.map((entry) => ({
                level: entry.count >= 3 ? 'critical' as const : 'warn' as const,
                kind: 'client-error' as const,
                route: entry.route,
                role: entry.role,
                source: entry.source,
                count: entry.count,
                message: `${entry.count} error(es) cliente en ${entry.route}`,
            })),
            ...poorVitals.map((entry) => ({
                level: entry.rating === 'poor' && entry.count >= 3 ? 'critical' as const : 'warn' as const,
                kind: 'web-vital' as const,
                route: entry.route,
                role: entry.role,
                metric: entry.metric,
                rating: entry.rating,
                value: entry.worstValue,
                count: entry.count,
                message: `${entry.metric} ${entry.rating} en ${entry.route}`,
            })),
        ]
            .sort((left, right) => {
                if (left.level !== right.level) {
                    return left.level === 'critical' ? -1 : 1;
                }
                return (right.count ?? 0) - (left.count ?? 0);
            })
            .slice(0, 8);

        return {
            generatedAt: new Date().toISOString(),
            totalRouteViews: routeViewEntries.reduce((sum, entry) => sum + entry.count, 0),
            totalClientErrors: clientErrorEntries.reduce((sum, entry) => sum + entry.count, 0),
            totalPoorVitals: webVitalEntries.reduce(
                (sum, entry) => sum + (entry.rating !== 'good' ? entry.count : 0),
                0,
            ),
            warnAlerts: alerts.filter((entry) => entry.level === 'warn').length,
            criticalAlerts: alerts.filter((entry) => entry.level === 'critical').length,
            busiestRoutes,
            clientErrors,
            poorVitals,
            alerts,
        };
    }

    async resetFrontendHealthSnapshot(): Promise<{ cleared: boolean }> {
        this.frontendRouteViewSamples.clear();
        this.frontendClientErrorSamples.clear();
        this.frontendWebVitalSamples.clear();

        await Promise.all([
            this.redisService.deleteByPrefix(FRONTEND_ROUTE_VIEW_REDIS_KEY),
            this.redisService.deleteByPrefix(FRONTEND_CLIENT_ERROR_REDIS_KEY),
            this.redisService.deleteByPrefix(FRONTEND_WEB_VITAL_REDIS_KEY),
        ]);

        return { cleared: true };
    }

    getDependencyHealthSnapshot(
        thresholdsMs?: Record<string, number>,
    ): Array<{
        dependency: string;
        operation: string;
        samples: number;
        p50Ms: number;
        p95Ms: number;
        errorRatePct: number;
        lastSeenAt: string | null;
        latencyThresholdMs: number;
        healthy: boolean;
    }> {
        const snapshots: Array<{
            dependency: string;
            operation: string;
            samples: number;
            p50Ms: number;
            p95Ms: number;
            errorRatePct: number;
            lastSeenAt: string | null;
            latencyThresholdMs: number;
            healthy: boolean;
        }> = [];

        for (const [key, value] of this.dependencySamples.entries()) {
            const [dependency, operation] = key.split(':');
            const threshold = thresholdsMs?.[key]
                ?? thresholdsMs?.[dependency]
                ?? this.defaultLatencyThresholdMs;
            const p50Ms = this.percentile(value.latencies, 0.5);
            const p95Ms = this.percentile(value.latencies, 0.95);
            const totalCalls = value.successCount + value.failureCount;
            const errorRatePct = totalCalls > 0
                ? Number(((value.failureCount / totalCalls) * 100).toFixed(2))
                : 0;

            snapshots.push({
                dependency,
                operation,
                samples: value.latencies.length,
                p50Ms,
                p95Ms,
                errorRatePct,
                lastSeenAt: value.lastSeenAt ? new Date(value.lastSeenAt).toISOString() : null,
                latencyThresholdMs: threshold,
                healthy: p95Ms <= threshold && errorRatePct < 20,
            });
        }

        return snapshots.sort((left, right) => {
            if (left.healthy !== right.healthy) {
                return left.healthy ? 1 : -1;
            }
            return right.p95Ms - left.p95Ms;
        });
    }

    getMetricsContentType(): string {
        return this.registry.contentType;
    }

    async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    private normalizeFrontendRole(role?: string): string {
        switch ((role ?? '').trim().toUpperCase()) {
            case 'USER':
            case 'BUSINESS_OWNER':
            case 'ADMIN':
                return role!.trim().toUpperCase();
            default:
                return 'ANONYMOUS';
        }
    }

    private normalizeFrontendSource(source?: string): string {
        const normalized = (source ?? '').trim().toLowerCase();
        if (!normalized) {
            return 'unknown';
        }
        return normalized.replace(/[^a-z0-9_-]/g, '_').slice(0, 32) || 'unknown';
    }

    private normalizeFrontendMetric(metricName?: string): string {
        const normalized = (metricName ?? '').trim().toUpperCase();
        if (!normalized) {
            return 'UNKNOWN';
        }
        return normalized.replace(/[^A-Z0-9_-]/g, '_').slice(0, 24) || 'UNKNOWN';
    }

    private normalizeFrontendRating(rating?: string): string {
        switch ((rating ?? '').trim()) {
            case 'good':
            case 'needs-improvement':
            case 'poor':
                return rating!;
            default:
                return 'unknown';
        }
    }

    private normalizeFrontendRoute(route: string): string {
        const trimmed = (route || '/').trim() || '/';
        const withoutQuery = trimmed.split('?')[0]?.split('#')[0] || '/';
        let normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;

        normalized = normalized
            .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
            .replace(/\/\d+(?=\/|$)/g, '/:id');

        if (/^\/businesses\/[^/]+$/i.test(normalized)) {
            return '/businesses/:slug';
        }

        if (/^\/negocios\/[^/]+\/[^/]+$/i.test(normalized)) {
            return '/negocios/:scope/:slug';
        }

        if (normalized.length > 160) {
            normalized = normalized.slice(0, 160);
        }

        return normalized.toLowerCase();
    }

    private trackFrontendRouteView(route: string, role: string): void {
        const key = `${role}:${route}`;
        const current = this.frontendRouteViewSamples.get(key) ?? {
            route,
            role,
            count: 0,
            lastSeenAt: 0,
        };
        current.count += 1;
        current.lastSeenAt = Date.now();
        this.frontendRouteViewSamples.set(key, current);
        void this.persistRedisAggregateUpdate<typeof current>(
            FRONTEND_ROUTE_VIEW_REDIS_KEY,
            key,
            () => ({
                route,
                role,
                count: 1,
                lastSeenAt: current.lastSeenAt,
            }),
            (existing) => ({
                ...existing,
                route,
                role,
                count: existing.count + 1,
                lastSeenAt: current.lastSeenAt,
            }),
        );
    }

    private trackFrontendClientError(route: string, role: string, source: string): void {
        const key = `${role}:${route}:${source}`;
        const current = this.frontendClientErrorSamples.get(key) ?? {
            route,
            role,
            source,
            count: 0,
            lastSeenAt: 0,
        };
        current.count += 1;
        current.lastSeenAt = Date.now();
        this.frontendClientErrorSamples.set(key, current);
        void this.persistRedisAggregateUpdate<typeof current>(
            FRONTEND_CLIENT_ERROR_REDIS_KEY,
            key,
            () => ({
                route,
                role,
                source,
                count: 1,
                lastSeenAt: current.lastSeenAt,
            }),
            (existing) => ({
                ...existing,
                route,
                role,
                source,
                count: existing.count + 1,
                lastSeenAt: current.lastSeenAt,
            }),
        );
    }

    private trackFrontendWebVital(
        route: string,
        role: string,
        metric: string,
        rating: string,
        value: number,
    ): void {
        const key = `${role}:${route}:${metric}:${rating}`;
        const current = this.frontendWebVitalSamples.get(key) ?? {
            route,
            role,
            metric,
            rating,
            count: 0,
            latestValue: 0,
            worstValue: 0,
            lastSeenAt: 0,
        };
        current.count += 1;
        current.latestValue = value;
        current.worstValue = Math.max(current.worstValue, value);
        current.lastSeenAt = Date.now();
        this.frontendWebVitalSamples.set(key, current);
        void this.persistRedisAggregateUpdate<typeof current>(
            FRONTEND_WEB_VITAL_REDIS_KEY,
            key,
            () => ({
                route,
                role,
                metric,
                rating,
                count: 1,
                latestValue: value,
                worstValue: Math.max(0, value),
                lastSeenAt: current.lastSeenAt,
            }),
            (existing) => ({
                ...existing,
                route,
                role,
                metric,
                rating,
                count: existing.count + 1,
                latestValue: value,
                worstValue: Math.max(existing.worstValue, value),
                lastSeenAt: current.lastSeenAt,
            }),
        );
    }

    private async getFrontendRouteViewEntries(): Promise<Array<{
        route: string;
        role: string;
        count: number;
        lastSeenAt: number;
    }>> {
        const cached = await this.redisService.getJson<Record<string, {
            route: string;
            role: string;
            count: number;
            lastSeenAt: number;
        }>>(FRONTEND_ROUTE_VIEW_REDIS_KEY);

        if (cached && Object.keys(cached).length > 0) {
            return this.filterRecentFrontendEntries(Object.values(cached));
        }

        return this.filterRecentFrontendEntries([...this.frontendRouteViewSamples.values()]);
    }

    private async getFrontendClientErrorEntries(): Promise<Array<{
        route: string;
        role: string;
        source: string;
        count: number;
        lastSeenAt: number;
    }>> {
        const cached = await this.redisService.getJson<Record<string, {
            route: string;
            role: string;
            source: string;
            count: number;
            lastSeenAt: number;
        }>>(FRONTEND_CLIENT_ERROR_REDIS_KEY);

        if (cached && Object.keys(cached).length > 0) {
            return this.filterRecentFrontendEntries(Object.values(cached));
        }

        return this.filterRecentFrontendEntries([...this.frontendClientErrorSamples.values()]);
    }

    private async getFrontendWebVitalEntries(): Promise<Array<{
        route: string;
        role: string;
        metric: string;
        rating: string;
        count: number;
        latestValue: number;
        worstValue: number;
        lastSeenAt: number;
    }>> {
        const cached = await this.redisService.getJson<Record<string, {
            route: string;
            role: string;
            metric: string;
            rating: string;
            count: number;
            latestValue: number;
            worstValue: number;
            lastSeenAt: number;
        }>>(FRONTEND_WEB_VITAL_REDIS_KEY);

        if (cached && Object.keys(cached).length > 0) {
            return this.filterRecentFrontendEntries(Object.values(cached));
        }

        return this.filterRecentFrontendEntries([...this.frontendWebVitalSamples.values()]);
    }

    private async persistRedisAggregateUpdate<T>(
        key: string,
        entryKey: string,
        createInitial: () => T,
        merge: (existing: T) => T,
    ): Promise<void> {
        if (!this.redisService.isReady()) {
            return;
        }

        const current = await this.redisService.getJson<Record<string, T>>(key);
        const next = current ?? {};
        next[entryKey] = entryKey in next ? merge(next[entryKey] as T) : createInitial();
        await this.redisService.setJson(key, next, FRONTEND_OBSERVABILITY_TTL_SECONDS);
    }

    private percentile(values: number[], percentile: number): number {
        if (values.length === 0) {
            return 0;
        }

        const sorted = [...values].sort((left, right) => left - right);
        const index = Math.min(
            sorted.length - 1,
            Math.max(0, Math.floor((sorted.length - 1) * percentile)),
        );
        return Number((sorted[index] ?? 0).toFixed(2));
    }

    private filterRecentFrontendEntries<T extends { lastSeenAt: number }>(entries: T[]): T[] {
        const cutoff = Date.now() - FRONTEND_HEALTH_WINDOW_MS;
        return entries.filter((entry) => entry.lastSeenAt >= cutoff);
    }
}
