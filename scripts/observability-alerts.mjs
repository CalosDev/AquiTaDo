import { loadOptionalSmokeEnv } from './lib/load-smoke-env.mjs';

loadOptionalSmokeEnv();

const DEFAULT_API_BASE_URL = 'https://aquitado.onrender.com';
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_ADMIN_EMAIL = 'admin@aquita.do';
const DEFAULT_ADMIN_PASSWORD = 'admin12345';

function pickEnv(...keys) {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) {
            return value;
        }
    }
    return null;
}

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Alert API base URL cannot be empty');
    }
    return normalized;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function formatPayload(response) {
    if (response.json !== null) {
        return JSON.stringify(response.json);
    }
    return response.text.slice(0, 400);
}

async function request(baseUrl, path, options = {}) {
    const {
        method = 'GET',
        token,
        body,
        accept = 'application/json',
    } = options;

    const headers = { accept };
    if (token) {
        headers.authorization = `Bearer ${token}`;
    }
    if (body !== undefined) {
        headers['content-type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        const text = await response.text();
        const contentType = response.headers.get('content-type') ?? '';
        let json = null;

        if (contentType.includes('application/json') && text) {
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error(`${method} ${path} returned invalid JSON`);
            }
        }

        return {
            status: response.status,
            text,
            json,
        };
    } finally {
        clearTimeout(timeout);
    }
}

async function loginAdmin(apiBaseUrl) {
    const configuredEmail = pickEnv('SMOKE_PROD_ADMIN_EMAIL');
    const configuredPassword = pickEnv('SMOKE_PROD_ADMIN_PASSWORD');

    assert(
        Boolean(configuredEmail) === Boolean(configuredPassword),
        'Production alerts require both SMOKE_PROD_ADMIN_EMAIL and SMOKE_PROD_ADMIN_PASSWORD when one is configured',
    );

    const email = configuredEmail ?? DEFAULT_ADMIN_EMAIL;
    const password = configuredPassword ?? DEFAULT_ADMIN_PASSWORD;

    const response = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: { email, password },
    });

    if (response.status !== 200) {
        throw new Error(`POST /api/auth/login failed with HTTP ${response.status}. Response: ${formatPayload(response)}`);
    }

    const accessToken = response.json?.accessToken;
    const role = response.json?.user?.role;
    assert(typeof accessToken === 'string', 'Admin login for alerts did not return accessToken');
    assert(role === 'ADMIN', `Admin login for alerts resolved with unexpected role ${String(role || 'unknown')}`);
    return accessToken;
}

function addIssue(issues, level, message, details = null) {
    issues.push({ level, message, details });
}

function isTruthyFlag(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function shouldRequireEmail() {
    return isTruthyFlag(process.env.SMOKE_PROD_REQUIRE_EMAIL);
}

function evaluateHealth(health, readiness, dashboard, issues) {
    if (health?.status !== 'ok') {
        addIssue(issues, 'critical', 'Liveness no devolvio status ok', health);
    }

    if (readiness?.status !== 'ok') {
        addIssue(issues, 'critical', 'Readiness no devolvio status ok', readiness);
    }

    if (readiness?.checks?.database !== 'up' || readiness?.checks?.schema !== 'up') {
        addIssue(issues, 'critical', 'Database o schema no estan listos segun readiness', readiness?.checks);
    }

    if (dashboard?.status === 'down') {
        addIssue(issues, 'critical', 'Dashboard operacional reporta estado down', dashboard?.checks);
    } else if (dashboard?.status === 'degraded') {
        addIssue(issues, 'warn', 'Dashboard operacional reporta estado degraded', dashboard?.checks);
    }

    const dbPoolStatus = dashboard?.checks?.database?.pool?.status;
    if (dbPoolStatus === 'down') {
        addIssue(issues, 'critical', 'Pool de base de datos saturado', dashboard?.checks?.database?.pool);
    } else if (dbPoolStatus === 'degraded') {
        addIssue(issues, 'warn', 'Pool de base de datos en zona de advertencia', dashboard?.checks?.database?.pool);
    }

    for (const dependency of ['email', 'whatsapp']) {
        const dependencyState = dashboard?.checks?.[dependency];
        if (!dependencyState) {
            continue;
        }

        const dependencyCritical = dependencyState.critical === true;

        const emailNotConfigured = dependency === 'email'
            && dependencyState.status === 'down'
            && dependencyState.reason === 'not_configured';

        if (emailNotConfigured && !shouldRequireEmail()) {
            addIssue(
                issues,
                'warn',
                'Dependencia email no esta configurada en produccion',
                dependencyState,
            );
            continue;
        }

        if (dependencyState.status === 'down') {
            addIssue(
                issues,
                dependencyCritical ? 'critical' : 'warn',
                `Dependencia ${dependency} reporta down`,
                dependencyState,
            );
        } else if (dependencyState.status === 'degraded') {
            addIssue(issues, 'warn', `Dependencia ${dependency} reporta degraded`, dependencyState);
        }
    }
}

function evaluateFrontendSummary(summary, issues) {
    const criticalAlerts = Number(summary?.criticalAlerts ?? 0);
    const warnAlerts = Number(summary?.warnAlerts ?? 0);
    const totalClientErrors = Number(summary?.totalClientErrors ?? 0);
    const totalPoorVitals = Number(summary?.totalPoorVitals ?? 0);
    const warnClientErrorsThreshold = Number.parseInt(
        process.env.SMOKE_PROD_ALERT_CLIENT_ERRORS_WARN ?? '5',
        10,
    );
    const warnPoorVitalsThreshold = Number.parseInt(
        process.env.SMOKE_PROD_ALERT_POOR_VITALS_WARN ?? '5',
        10,
    );

    if (criticalAlerts > 0) {
        addIssue(issues, 'critical', `Hay ${criticalAlerts} alerta(s) criticas de frontend`, summary?.alerts ?? []);
    }

    if (warnAlerts > 0) {
        addIssue(issues, 'warn', `Hay ${warnAlerts} alerta(s) warn de frontend`, summary?.alerts ?? []);
    }

    if (totalClientErrors >= warnClientErrorsThreshold) {
        addIssue(
            issues,
            'warn',
            `Errores cliente acumulados (${totalClientErrors}) superan el umbral ${warnClientErrorsThreshold}`,
            summary?.clientErrors ?? [],
        );
    }

    if (totalPoorVitals >= warnPoorVitalsThreshold) {
        addIssue(
            issues,
            'warn',
            `Web vitals delicados acumulados (${totalPoorVitals}) superan el umbral ${warnPoorVitalsThreshold}`,
            summary?.poorVitals ?? [],
        );
    }
}

async function main() {
    const apiBaseUrl = normalizeBaseUrl(process.env.SMOKE_PROD_API_BASE_URL, DEFAULT_API_BASE_URL);
    console.log(`Evaluating production alerts against ${apiBaseUrl}`);

    const health = await request(apiBaseUrl, '/api/health');
    if (health.status !== 200) {
        throw new Error(`GET /api/health failed with HTTP ${health.status}. Response: ${formatPayload(health)}`);
    }

    const readiness = await request(apiBaseUrl, '/api/health/ready');
    if (readiness.status !== 200) {
        throw new Error(`GET /api/health/ready failed with HTTP ${readiness.status}. Response: ${formatPayload(readiness)}`);
    }

    const adminToken = await loginAdmin(apiBaseUrl);
    const [dashboard, frontendSummary] = await Promise.all([
        request(apiBaseUrl, '/api/health/dashboard', { token: adminToken }),
        request(apiBaseUrl, '/api/observability/summary', { token: adminToken }),
    ]);

    if (dashboard.status !== 200) {
        throw new Error(`GET /api/health/dashboard failed with HTTP ${dashboard.status}. Response: ${formatPayload(dashboard)}`);
    }
    if (frontendSummary.status !== 200) {
        throw new Error(`GET /api/observability/summary failed with HTTP ${frontendSummary.status}. Response: ${formatPayload(frontendSummary)}`);
    }

    const issues = [];
    evaluateHealth(health.json, readiness.json, dashboard.json, issues);
    evaluateFrontendSummary(frontendSummary.json, issues);

    const criticalIssues = issues.filter((issue) => issue.level === 'critical');
    const warnIssues = issues.filter((issue) => issue.level === 'warn');

    console.log(
        JSON.stringify(
            {
                checkedAt: new Date().toISOString(),
                apiBaseUrl,
                health: health.json,
                readiness: readiness.json,
                dashboardStatus: dashboard.json?.status ?? null,
                frontendSummary: {
                    criticalAlerts: frontendSummary.json?.criticalAlerts ?? 0,
                    warnAlerts: frontendSummary.json?.warnAlerts ?? 0,
                    totalClientErrors: frontendSummary.json?.totalClientErrors ?? 0,
                    totalPoorVitals: frontendSummary.json?.totalPoorVitals ?? 0,
                },
                issues,
            },
            null,
            2,
        ),
    );

    if (criticalIssues.length > 0) {
        throw new Error(`Production alerts detected ${criticalIssues.length} critical issue(s)`);
    }

    if (warnIssues.length > 0 && process.env.SMOKE_PROD_ALERT_FAIL_ON_WARN === '1') {
        throw new Error(`Production alerts detected ${warnIssues.length} warn issue(s) with SMOKE_PROD_ALERT_FAIL_ON_WARN=1`);
    }

    console.log('Production alerts check passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Production alerts failed: ${message}`);
    process.exitCode = 1;
});
