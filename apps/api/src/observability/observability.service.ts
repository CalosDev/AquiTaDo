import { Injectable } from '@nestjs/common';
import {
    Counter,
    Histogram,
    Registry,
    collectDefaultMetrics,
    register,
} from 'prom-client';
import { FrontendSignalKind, TrackFrontendSignalDto } from './dto/frontend-observability.dto';

let defaultMetricsCollected = false;

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

    constructor() {
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
            return;
        }

        if (dto.kind === FrontendSignalKind.CLIENT_ERROR) {
            const source = this.normalizeFrontendSource(dto.source);
            this.frontendClientErrorCounter.inc({ route, source, role });
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
        }
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
}
