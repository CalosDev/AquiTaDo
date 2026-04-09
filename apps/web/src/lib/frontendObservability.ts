export type FrontendRole = 'ANONYMOUS' | 'USER' | 'BUSINESS_OWNER' | 'ADMIN';
type FrontendSignalKind = 'ROUTE_VIEW' | 'WEB_VITAL' | 'CLIENT_ERROR';
type WebVitalName = 'CLS' | 'FCP' | 'LCP';
type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

interface FrontendSignalPayload {
    kind: FrontendSignalKind;
    route: string;
    role: FrontendRole;
    source?: string;
    metricName?: WebVitalName;
    value?: number;
    rating?: WebVitalRating;
}

export interface FrontendObservabilityContext {
    pathname: string;
    role: FrontendRole;
}

function resolveApiBaseUrl(rawBaseUrl: string): string {
    const normalized = rawBaseUrl.trim().replace(/\/+$/, '');
    if (!normalized) {
        return 'http://localhost:3000/api';
    }

    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL || 'http://localhost:3000');
const FRONTEND_OBSERVABILITY_URL = `${API_BASE_URL}/observability/frontend`;
const canUseWindow = typeof window !== 'undefined';
const reportedRouteViews = new Set<string>();
const reportedVitals = new Set<string>();
const SYNTHETIC_QUERY_PARAMS = ['synthetic_audit', 'synthetic_monitoring', 'synthetic'];

function sanitizeSignalText(value: string | undefined, fallback: string): string {
    const normalized = (value ?? '').trim();
    if (!normalized) {
        return fallback;
    }
    return normalized.slice(0, 160);
}

function isExternalNoise(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
        normalized.includes('instrument.')
        || normalized.includes('vercel toolbar')
        || normalized.includes('zustand')
        || normalized.includes('dialogcontent')
        || normalized.includes('dialogtitle')
    );
}

export function shouldSkipFrontendObservability(): boolean {
    if (!canUseWindow) {
        return false;
    }

    try {
        const searchParams = new URLSearchParams(window.location.search);
        if (SYNTHETIC_QUERY_PARAMS.some((key) => {
            const value = searchParams.get(key);
            return value === '1' || value === 'true';
        })) {
            return true;
        }

        if (window.localStorage.getItem('aquitaSyntheticSession') === '1') {
            return true;
        }
    } catch {
        // Ignore storage/query parsing issues.
    }

    return navigator.webdriver === true;
}

export function toRoleLabel(rawRole: string | undefined): FrontendRole {
    switch ((rawRole ?? '').trim().toUpperCase()) {
        case 'USER':
        case 'BUSINESS_OWNER':
        case 'ADMIN':
            return rawRole!.trim().toUpperCase() as FrontendRole;
        default:
            return 'ANONYMOUS';
    }
}

export function normalizeFrontendRoute(pathname: string): string {
    const trimmed = (pathname || '/').trim() || '/';
    const withoutQuery = trimmed.split('?')[0]?.split('#')[0] || '/';
    let normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;

    normalized = normalized
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi, '/:id')
        .replace(/\/\d+(?=\/|$)/g, '/:id');

    if (/^\/businesses\/[^/]+$/i.test(normalized)) {
        return '/businesses/:slug';
    }

    if (/^\/negocios\/categoria\/[^/]+$/i.test(normalized)) {
        return '/negocios/categoria/:slug';
    }

    if (/^\/negocios\/provincia\/[^/]+$/i.test(normalized)) {
        return '/negocios/provincia/:slug';
    }

    if (/^\/negocios\/intencion\/[^/]+$/i.test(normalized)) {
        return '/negocios/intencion/:slug';
    }

    if (/^\/negocios\/[^/]+\/[^/]+$/i.test(normalized)) {
        return '/negocios/:province/:category';
    }

    return normalized.toLowerCase();
}

function sendFrontendSignal(payload: FrontendSignalPayload) {
    if (!canUseWindow || shouldSkipFrontendObservability()) {
        return;
    }

    const body = JSON.stringify({
        ...payload,
        route: normalizeFrontendRoute(payload.route),
        role: toRoleLabel(payload.role),
    });

    if (typeof navigator.sendBeacon === 'function') {
        const requestBody = new Blob([body], { type: 'application/json' });
        const sent = navigator.sendBeacon(FRONTEND_OBSERVABILITY_URL, requestBody);
        if (sent) {
            return;
        }
    }

    void fetch(FRONTEND_OBSERVABILITY_URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body,
        keepalive: true,
        credentials: 'omit',
    }).catch(() => {
        // Telemetry must never break the UI.
    });
}

function getWebVitalRating(metricName: WebVitalName, value: number): WebVitalRating {
    if (metricName === 'CLS') {
        if (value <= 0.1) {
            return 'good';
        }
        if (value <= 0.25) {
            return 'needs-improvement';
        }
        return 'poor';
    }

    if (metricName === 'FCP') {
        if (value <= 1800) {
            return 'good';
        }
        if (value <= 3000) {
            return 'needs-improvement';
        }
        return 'poor';
    }

    if (value <= 2500) {
        return 'good';
    }
    if (value <= 4000) {
        return 'needs-improvement';
    }
    return 'poor';
}

export function reportRouteView(pathname: string, role: string | undefined) {
    if (shouldSkipFrontendObservability()) {
        return;
    }

    const normalizedRoute = normalizeFrontendRoute(pathname);
    const dedupeKey = `${normalizedRoute}:${toRoleLabel(role)}`;
    if (reportedRouteViews.has(dedupeKey)) {
        return;
    }
    reportedRouteViews.add(dedupeKey);

    sendFrontendSignal({
        kind: 'ROUTE_VIEW',
        route: normalizedRoute,
        role: toRoleLabel(role),
        source: 'route-change',
    });
}

function reportClientError(pathname: string, role: string | undefined, source: string) {
    sendFrontendSignal({
        kind: 'CLIENT_ERROR',
        route: pathname,
        role: toRoleLabel(role),
        source: sanitizeSignalText(source, 'unknown'),
    });
}

function reportWebVital(pathname: string, role: string | undefined, metricName: WebVitalName, value: number) {
    const normalizedRoute = normalizeFrontendRoute(pathname);
    const dedupeKey = `${normalizedRoute}:${metricName}`;
    if (reportedVitals.has(dedupeKey)) {
        return;
    }
    reportedVitals.add(dedupeKey);

    sendFrontendSignal({
        kind: 'WEB_VITAL',
        route: normalizedRoute,
        role: toRoleLabel(role),
        metricName,
        value: Number(value.toFixed(3)),
        rating: getWebVitalRating(metricName, value),
        source: 'performance-observer',
    });
}

export function createFrontendObservabilityObservers(
    getContext: () => FrontendObservabilityContext,
) {
    if (!canUseWindow || typeof PerformanceObserver === 'undefined' || shouldSkipFrontendObservability()) {
        return () => undefined;
    }

    let clsValue = 0;
    let latestLcp = 0;
    let latestFcp = 0;

    const handleError = (event: ErrorEvent) => {
        const message = sanitizeSignalText(event.message, 'window.error');
        if (isExternalNoise(message)) {
            return;
        }
        const context = getContext();
        reportClientError(context.pathname, context.role, 'window.error');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reasonText = sanitizeSignalText(
            event.reason instanceof Error ? event.reason.message : String(event.reason ?? ''),
            'unhandledrejection',
        );
        if (isExternalNoise(reasonText)) {
            return;
        }
        const context = getContext();
        reportClientError(context.pathname, context.role, 'unhandledrejection');
    };

    const flushVitals = () => {
        const context = getContext();
        if (latestFcp > 0) {
            reportWebVital(context.pathname, context.role, 'FCP', latestFcp);
        }
        if (latestLcp > 0) {
            reportWebVital(context.pathname, context.role, 'LCP', latestLcp);
        }
        reportWebVital(context.pathname, context.role, 'CLS', clsValue);
    };

    const handlePageHide = () => {
        flushVitals();
    };

    const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            const layoutShiftEntry = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
            if (layoutShiftEntry.hadRecentInput) {
                continue;
            }
            clsValue += layoutShiftEntry.value ?? 0;
        }
    });

    const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latestEntry = entries[entries.length - 1];
        if (latestEntry) {
            latestLcp = latestEntry.startTime;
        }
    });

    const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
                latestFcp = entry.startTime;
            }
        }
    });

    try {
        clsObserver.observe({ type: 'layout-shift', buffered: true });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
        fcpObserver.observe({ type: 'paint', buffered: true });
    } catch {
        return () => undefined;
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            flushVitals();
        }
    });

    return () => {
        clsObserver.disconnect();
        lcpObserver.disconnect();
        fcpObserver.disconnect();
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        window.removeEventListener('pagehide', handlePageHide);
    };
}
