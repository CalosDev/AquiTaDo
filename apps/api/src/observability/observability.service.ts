import { Injectable } from '@nestjs/common';
import {
    Counter,
    Histogram,
    Registry,
    collectDefaultMetrics,
    register,
} from 'prom-client';

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
    private readonly registry = register;
    private readonly requestCounter: Counter<string>;
    private readonly requestDurationHistogram: Histogram<string>;

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

    getMetricsContentType(): string {
        return this.registry.contentType;
    }

    async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }
}
