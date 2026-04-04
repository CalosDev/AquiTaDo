export type BusinessVerificationState = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'UNVERIFIED';

export interface ObservabilitySummary {
    totalRequests: number;
    errors5xx: number;
    averageLatencyMs: number;
    rateLimitHits: number;
    externalFailures: number;
}

export const EMPTY_OBSERVABILITY_SUMMARY: ObservabilitySummary = {
    totalRequests: 0,
    errors5xx: 0,
    averageLatencyMs: 0,
    rateLimitHits: 0,
    externalFailures: 0,
};

export function normalizeBusinessVerificationStatus(
    business: { verificationStatus?: string | null; verified?: boolean },
): BusinessVerificationState {
    if (business.verificationStatus) {
        return business.verificationStatus as BusinessVerificationState;
    }

    return business.verified ? 'VERIFIED' : 'PENDING';
}

export function verificationStatusLabel(status: BusinessVerificationState): string {
    if (status === 'VERIFIED') {
        return 'Verificado';
    }
    if (status === 'REJECTED') {
        return 'Rechazado';
    }
    if (status === 'SUSPENDED') {
        return 'Suspendido';
    }
    return 'Pendiente';
}

export function verificationStatusClass(status: BusinessVerificationState): string {
    if (status === 'VERIFIED') {
        return 'bg-primary-100 text-primary-700';
    }
    if (status === 'REJECTED') {
        return 'bg-red-100 text-red-700';
    }
    if (status === 'SUSPENDED') {
        return 'bg-amber-100 text-amber-700';
    }
    return 'bg-yellow-100 text-yellow-700';
}

export function healthStatusClass(status: 'up' | 'degraded' | 'down' | undefined): string {
    if (status === 'up') {
        return 'bg-primary-100 text-primary-700';
    }
    if (status === 'degraded') {
        return 'bg-amber-100 text-amber-700';
    }
    return 'bg-red-100 text-red-700';
}

export function parseObservabilitySummary(metricText: string): ObservabilitySummary {
    const totalRequests = Math.round(sumMetric(metricText, 'aquita_http_requests_total'));
    const errors5xx = Math.round(
        sumMetricByLabelPattern(
            metricText,
            'aquita_http_requests_total',
            /status="5\d{2}"/,
        ),
    );
    const durationSumSeconds = sumMetric(metricText, 'aquita_http_request_duration_seconds_sum');
    const durationCount = sumMetric(metricText, 'aquita_http_request_duration_seconds_count');
    const averageLatencyMs = durationCount > 0
        ? Number(((durationSumSeconds / durationCount) * 1000).toFixed(2))
        : 0;
    const rateLimitHits = Math.round(sumMetric(metricText, 'aquita_rate_limit_hits_total'));
    const externalFailures = Math.round(
        sumMetricByLabelPattern(
            metricText,
            'aquita_external_dependency_calls_total',
            /success="false"/,
        ),
    );

    return {
        totalRequests,
        errors5xx,
        averageLatencyMs,
        rateLimitHits,
        externalFailures,
    };
}

export function toSlug(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function sumMetric(metricText: string, metricName: string): number {
    const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}(?:\\{[^}]*\\})?\\s+([-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$`);
    return metricText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .reduce((acc, line) => {
            const match = line.match(pattern);
            if (!match) {
                return acc;
            }
            const parsed = Number.parseFloat(match[1]);
            return Number.isFinite(parsed) ? acc + parsed : acc;
        }, 0);
}

function sumMetricByLabelPattern(
    metricText: string,
    metricName: string,
    labelPattern: RegExp,
): number {
    const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^${escaped}\\{([^}]*)\\}\\s+([-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$`);
    return metricText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .reduce((acc, line) => {
            const match = line.match(pattern);
            if (!match) {
                return acc;
            }
            const labels = match[1] ?? '';
            if (!labelPattern.test(labels)) {
                return acc;
            }
            const parsed = Number.parseFloat(match[2]);
            return Number.isFinite(parsed) ? acc + parsed : acc;
        }, 0);
}
