import { loadOptionalSmokeEnv } from './lib/load-smoke-env.mjs';

loadOptionalSmokeEnv();

const DEFAULT_API_BASE_URL = 'https://aquitado.onrender.com';
const DEFAULT_WEB_BASE_URL = 'https://aquitado.vercel.app';
const REQUEST_TIMEOUT_MS = 75_000;
const DEFAULT_SMOKE_PASSWORD = 'SmokePass123!';
const DEFAULT_PROD_SMOKE_USER_EMAIL = 'smoke.user.aquitado@example.com';
const DEFAULT_PROD_SMOKE_OWNER_EMAIL = 'smoke.owner.aquitado@example.com';
const DEFAULT_PROD_SMOKE_ADMIN_EMAIL = 'admin@aquita.do';
const DEFAULT_PROD_SMOKE_ADMIN_PASSWORD = 'admin12345';
const FRONTEND_BUNDLE_PATTERNS = [
    {
        pattern: /\[DEPRECATED\]\s*Default export is deprecated\. Instead use `import \{ create \} from 'zustand'`/i,
        label: 'zustand deprecation warning',
        reason: 'unexpected Zustand runtime warning code detected in first-party bundle',
    },
    {
        pattern: /DialogContent` requires a `DialogTitle`/i,
        label: 'DialogContent accessibility warning',
        reason: 'unexpected dialog accessibility warning detected in first-party bundle',
    },
    {
        pattern: /Missing `Description` or `aria-describedby=\{undefined\}` for \{DialogContent\}/i,
        label: 'DialogContent description warning',
        reason: 'unexpected dialog description warning detected in first-party bundle',
    },
];

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

function pickEnv(...keys) {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) {
            return value;
        }
    }
    return null;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function formatResponsePayload(response) {
    if (response.json !== null) {
        return JSON.stringify(response.json);
    }
    return response.text.slice(0, 600);
}

function expectStatus(response, allowedStatusCodes, label) {
    if (allowedStatusCodes.includes(response.status)) {
        return;
    }

    throw new Error(
        `${label} failed with HTTP ${response.status}. Response: ${formatResponsePayload(response)}`,
    );
}

async function request(baseUrl, path, options = {}) {
    const {
        method = 'GET',
        token,
        organizationId,
        body,
        headers: customHeaders,
        accept = 'application/json',
    } = options;

    const headers = {
        accept,
        ...(customHeaders ?? {}),
    };

    if (token) {
        headers.authorization = `Bearer ${token}`;
    }

    if (organizationId) {
        headers['x-organization-id'] = organizationId;
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
            headers: response.headers,
            text,
            json,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function isExpectedCheckInError(response) {
    if (response.status !== 400 || !response.json) {
        return false;
    }

    const rawMessage = response.json.message;
    const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : String(rawMessage || '');
    const normalized = message.toLowerCase();
    return (
        normalized.includes('ya hiciste check-in recientemente')
        || normalized.includes('alcanzaste el limite diario')
    );
}

function extractAssetPathsFromHtml(html) {
    const assets = new Set();
    const regex = /(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
        assets.add(match[1]);
    }

    return [...assets];
}

async function runBundleSignalSmoke(webBaseUrl, homeHtml) {
    const html = typeof homeHtml === 'string' ? homeHtml : '';
    assert(html.length > 0, 'Home HTML is empty');
    assert(!html.includes('instrument.'), 'Home HTML unexpectedly references instrument.* script');

    const assetPaths = extractAssetPathsFromHtml(html);
    assert(assetPaths.length > 0, 'No first-party assets found in HTML');

    const findings = [];

    for (const assetPath of assetPaths) {
        const response = await request(webBaseUrl, assetPath, { accept: '*/*' });
        expectStatus(response, [200], `GET ${assetPath} (asset)`);

        for (const signal of FRONTEND_BUNDLE_PATTERNS) {
            if (signal.pattern.test(response.text)) {
                findings.push(`${assetPath}: ${signal.label} (${signal.reason})`);
            }
        }
    }

    if (findings.length > 0) {
        throw new Error(`Frontend bundle signal smoke failed. Suspicious matches found:\n- ${findings.join('\n- ')}`);
    }
}

async function runApiSmoke(apiBaseUrl, skipCheckIns) {
    console.log(`Running API checks against ${apiBaseUrl}`);

    const health = await request(apiBaseUrl, '/api/health');
    expectStatus(health, [200], 'GET /api/health');
    assert(health.json?.status === 'ok', '/api/health returned invalid status');

    const ready = await request(apiBaseUrl, '/api/health/ready');
    expectStatus(ready, [200], 'GET /api/health/ready');
    assert(ready.json?.checks?.database === 'up', 'Readiness database check is not up');
    assert(ready.json?.checks?.schema === 'up', 'Readiness schema check is not up');

    const plans = await request(apiBaseUrl, '/api/plans');
    expectStatus(plans, [200], 'GET /api/plans');
    assert(Array.isArray(plans.json) && plans.json.length > 0, 'No plans found');

    const categories = await request(apiBaseUrl, '/api/categories');
    expectStatus(categories, [200], 'GET /api/categories');
    assert(Array.isArray(categories.json) && categories.json.length > 0, 'No categories found');

    const provinces = await request(apiBaseUrl, '/api/provinces');
    expectStatus(provinces, [200], 'GET /api/provinces');
    assert(Array.isArray(provinces.json) && provinces.json.length > 0, 'No provinces found');
    const firstProvinceId = provinces.json?.[0]?.id;
    assert(typeof firstProvinceId === 'string', 'No province id available for smoke checks');

    const businesses = await request(apiBaseUrl, '/api/businesses?limit=3');
    expectStatus(businesses, [200], 'GET /api/businesses');
    assert(Array.isArray(businesses.json?.data), '/api/businesses.data must be an array');
    const firstBusinessId = businesses.json?.data?.[0]?.id;
    assert(typeof firstBusinessId === 'string', 'No business id available for smoke checks');

    const metricsUnauthorized = await request(apiBaseUrl, '/api/observability/metrics');
    expectStatus(metricsUnauthorized, [401, 403], 'GET /api/observability/metrics without token');

    const aiQuery = await request(apiBaseUrl, '/api/ai/concierge/query', {
        method: 'POST',
        body: {
            query: 'Comida criolla con parqueo en Santo Domingo',
            limit: 4,
        },
    });
    expectStatus(aiQuery, [200, 201], 'POST /api/ai/concierge/query');
    assert(typeof aiQuery.json?.answer === 'string', 'AI concierge answer is missing');
    assert(Array.isArray(aiQuery.json?.data), 'AI concierge data must be an array');

    if (skipCheckIns) {
        console.log('Skipping check-in stats validation: SMOKE_PROD_SKIP_CHECKINS=1');
    } else {
        const checkInStats = await request(apiBaseUrl, `/api/checkins/business/${firstBusinessId}/stats`);
        if (checkInStats.status === 500) {
            throw new Error(
                'GET /api/checkins/business/:id/stats returned HTTP 500. ' +
                'Likely missing DB migration for check-ins. Run pnpm db:migrate:deploy on production.',
            );
        }
        expectStatus(checkInStats, [200], 'GET /api/checkins/business/:id/stats');
        assert(checkInStats.json?.businessId === firstBusinessId, 'Check-in stats returned unexpected business id');
    }

    return { firstBusinessId, firstProvinceId };
}

function normalizeActor(label, email, password, payload) {
    const accessToken = payload?.accessToken;
    assert(typeof accessToken === 'string', `${label} login did not return accessToken`);

    return {
        label,
        email,
        password,
        accessToken,
        user: payload?.user ?? null,
    };
}

function assertActorRole(actor, expectedRole, label) {
    const actualRole = actor.user?.role;
    assert(
        actualRole === expectedRole,
        `${label} resolved with unexpected role ${String(actualRole || 'unknown')}; expected ${expectedRole}`,
    );
}

async function tryLoginRole(apiBaseUrl, label, email, password) {
    const login = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
            email,
            password,
        },
    });

    if (login.status === 200) {
        return normalizeActor(label, email, password, login.json);
    }

    if ([400, 401, 403, 404].includes(login.status)) {
        return null;
    }

    throw new Error(
        `POST /api/auth/login (${label}) failed with HTTP ${login.status}. Response: ${formatResponsePayload(login)}`,
    );
}

async function loginRole(apiBaseUrl, label, email, password) {
    const actor = await tryLoginRole(apiBaseUrl, label, email, password);
    assert(actor, `${label} login rejected the provided credentials for ${email}`);
    return actor;
}

async function registerRole(apiBaseUrl, options) {
    const {
        label,
        role,
        email,
        password = DEFAULT_SMOKE_PASSWORD,
        name,
        phone,
    } = options;

    const register = await request(apiBaseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            name,
            email,
            password,
            phone,
            role,
        },
    });

    if (register.status === 201) {
        return normalizeActor(label, email, password, register.json);
    }

    if (register.status === 409) {
        throw new Error(
            `${label} smoke actor ${email} already exists but could not be logged in. ` +
            `Reset that account password or provide explicit SMOKE_PROD credentials.`,
        );
    }

    throw new Error(
        `POST /api/auth/register (${label}) failed with HTTP ${register.status}. Response: ${formatResponsePayload(register)}`,
    );
}

async function ensureSmokeActor(apiBaseUrl, options) {
    const {
        label,
        role,
        emailKeys,
        passwordKeys,
        defaultEmail,
        defaultPassword = DEFAULT_SMOKE_PASSWORD,
        name,
        phone,
    } = options;

    const configuredEmail = pickEnv(...emailKeys);
    const configuredPassword = pickEnv(...passwordKeys);

    assert(
        Boolean(configuredEmail) === Boolean(configuredPassword),
        `${label} smoke requires both email and password when one of them is configured`,
    );

    if (configuredEmail && configuredPassword) {
        const actor = await loginRole(apiBaseUrl, label, configuredEmail, configuredPassword);
        assertActorRole(actor, role, label);
        return actor;
    }

    const existingActor = await tryLoginRole(apiBaseUrl, label, defaultEmail, defaultPassword);
    if (existingActor) {
        assertActorRole(existingActor, role, label);
        return existingActor;
    }

    const registeredActor = await registerRole(apiBaseUrl, {
        label,
        role,
        email: defaultEmail,
        password: defaultPassword,
        name,
        phone,
    });
    assertActorRole(registeredActor, role, label);
    return registeredActor;
}

async function listOwnerOrganizations(apiBaseUrl, owner) {
    const response = await request(apiBaseUrl, '/api/organizations/mine', {
        token: owner.accessToken,
    });
    expectStatus(response, [200], 'GET /api/organizations/mine (BUSINESS_OWNER)');

    if (Array.isArray(response.json)) {
        return response.json;
    }
    if (Array.isArray(response.json?.data)) {
        return response.json.data;
    }
    return [];
}

async function createOwnerOrganization(apiBaseUrl, owner) {
    const response = await request(apiBaseUrl, '/api/organizations', {
        method: 'POST',
        token: owner.accessToken,
        body: {
            name: 'Smoke Prod Owner Organization',
        },
    });
    expectStatus(response, [201], 'POST /api/organizations (BUSINESS_OWNER)');
    const organizationId = response.json?.id;
    assert(typeof organizationId === 'string', 'Created organization is missing an id');
    return organizationId;
}

async function ensureOwnerOrganization(apiBaseUrl, owner) {
    const explicitOrganizationId = pickEnv('SMOKE_PROD_OWNER_ORGANIZATION_ID');
    if (explicitOrganizationId) {
        return explicitOrganizationId;
    }

    const organizations = await listOwnerOrganizations(apiBaseUrl, owner);
    const firstOrganizationId = organizations[0]?.id;
    if (typeof firstOrganizationId === 'string') {
        return firstOrganizationId;
    }

    return createOwnerOrganization(apiBaseUrl, owner);
}

async function listOwnerBusinesses(apiBaseUrl, owner, organizationId) {
    const response = await request(apiBaseUrl, '/api/businesses/my?limit=8', {
        token: owner.accessToken,
        organizationId,
    });
    expectStatus(response, [200], 'GET /api/businesses/my?limit=8 (BUSINESS_OWNER)');

    if (Array.isArray(response.json?.data)) {
        return response.json.data;
    }
    if (Array.isArray(response.json)) {
        return response.json;
    }
    return [];
}

async function createOwnerBusiness(apiBaseUrl, owner, organizationId, provinceId) {
    const response = await request(apiBaseUrl, '/api/businesses', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            name: 'Smoke Prod Owner Business',
            description: 'Business created automatically by production smoke coverage.',
            phone: '+18095550030',
            whatsapp: '+18095550031',
            address: 'Avenida John F. Kennedy 123, Santo Domingo',
            provinceId,
            latitude: 18.4861,
            longitude: -69.9312,
        },
    });
    expectStatus(response, [201], 'POST /api/businesses (BUSINESS_OWNER)');

    const businessId = response.json?.id;
    assert(typeof businessId === 'string', 'Created business is missing an id');
    return businessId;
}

async function ensureOwnerBusiness(apiBaseUrl, owner, organizationId, provinceId) {
    const explicitBusinessId = pickEnv('SMOKE_PROD_OWNER_BUSINESS_ID');
    if (explicitBusinessId) {
        return explicitBusinessId;
    }

    const businesses = await listOwnerBusinesses(apiBaseUrl, owner, organizationId);
    const firstBusinessId = businesses[0]?.id;
    if (typeof firstBusinessId === 'string') {
        return firstBusinessId;
    }

    return createOwnerBusiness(apiBaseUrl, owner, organizationId, provinceId);
}

async function runUserRoleSmoke(apiBaseUrl, firstBusinessId) {
    const user = await ensureSmokeActor(apiBaseUrl, {
        label: 'USER',
        role: 'USER',
        emailKeys: ['SMOKE_PROD_USER_EMAIL'],
        passwordKeys: ['SMOKE_PROD_USER_PASSWORD'],
        defaultEmail: DEFAULT_PROD_SMOKE_USER_EMAIL,
        name: 'Smoke Prod User',
        phone: '+18095550028',
    });

    const endpoints = [
        '/api/users/me',
        '/api/users/me/profile',
        '/api/favorites/businesses/my?limit=8',
        '/api/favorites/lists/my?limit=8',
        '/api/auth/2fa/status',
    ];

    for (const endpoint of endpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: user.accessToken,
        });
        expectStatus(response, [200], `GET ${endpoint} (USER)`);
    }

    if (process.env.SMOKE_PROD_CHECKIN_CREATE !== '1') {
        console.log('Skipping USER check-in create: set SMOKE_PROD_CHECKIN_CREATE=1 to enable');
        return;
    }

    const createCheckIn = await request(apiBaseUrl, '/api/checkins', {
        method: 'POST',
        token: user.accessToken,
        body: {
            businessId: firstBusinessId,
        },
    });

    if (createCheckIn.status === 201 || createCheckIn.status === 200) {
        console.log('USER check-in create passed');
        return;
    }

    if (isExpectedCheckInError(createCheckIn)) {
        console.log('USER check-in create returned expected cooldown/daily-limit validation');
        return;
    }

    throw new Error(
        `POST /api/checkins failed with HTTP ${createCheckIn.status}. Response: ${formatResponsePayload(createCheckIn)}`,
    );
}

async function runOwnerRoleSmoke(apiBaseUrl, firstProvinceId) {
    const owner = await ensureSmokeActor(apiBaseUrl, {
        label: 'BUSINESS_OWNER',
        role: 'BUSINESS_OWNER',
        emailKeys: ['SMOKE_PROD_OWNER_EMAIL', 'SMOKE_PROD_BUSINESS_OWNER_EMAIL'],
        passwordKeys: ['SMOKE_PROD_OWNER_PASSWORD', 'SMOKE_PROD_BUSINESS_OWNER_PASSWORD'],
        defaultEmail: DEFAULT_PROD_SMOKE_OWNER_EMAIL,
        name: 'Smoke Prod Owner',
        phone: '+18095550029',
    });

    const organizationId = await ensureOwnerOrganization(apiBaseUrl, owner);
    const businessId = await ensureOwnerBusiness(apiBaseUrl, owner, organizationId, firstProvinceId);

    const meEndpoints = [
        '/api/users/me',
        '/api/users/me/profile',
        '/api/auth/2fa/status',
        '/api/organizations/mine',
    ];

    for (const endpoint of meEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: owner.accessToken,
        });
        expectStatus(response, [200], `GET ${endpoint} (BUSINESS_OWNER)`);
    }

    const organizationEndpoints = [
        '/api/businesses/my?limit=8',
        '/api/analytics/dashboard/my?days=30',
        '/api/payments/my?limit=8',
        '/api/subscriptions/current',
    ];

    for (const endpoint of organizationEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: owner.accessToken,
            organizationId,
        });
        expectStatus(response, [200], `GET ${endpoint} (BUSINESS_OWNER)`);
    }

    const ownerBusinesses = await request(apiBaseUrl, '/api/businesses/my?limit=8', {
        token: owner.accessToken,
        organizationId,
    });
    expectStatus(ownerBusinesses, [200], 'GET /api/businesses/my?limit=8 verification (BUSINESS_OWNER)');
    const businesses = Array.isArray(ownerBusinesses.json?.data)
        ? ownerBusinesses.json.data
        : Array.isArray(ownerBusinesses.json)
            ? ownerBusinesses.json
            : [];
    assert(
        businesses.some((business) => business?.id === businessId),
        'BUSINESS_OWNER smoke could not confirm an accessible business in the active organization',
    );
}

async function runAdminRoleSmoke(apiBaseUrl) {
    const configuredEmail = pickEnv('SMOKE_PROD_ADMIN_EMAIL');
    const configuredPassword = pickEnv('SMOKE_PROD_ADMIN_PASSWORD');

    assert(
        Boolean(configuredEmail) === Boolean(configuredPassword),
        'ADMIN smoke requires both SMOKE_PROD_ADMIN_EMAIL and SMOKE_PROD_ADMIN_PASSWORD when one is configured',
    );

    const adminEmail = configuredEmail ?? DEFAULT_PROD_SMOKE_ADMIN_EMAIL;
    const adminPassword = configuredPassword ?? DEFAULT_PROD_SMOKE_ADMIN_PASSWORD;
    const admin = await loginRole(apiBaseUrl, 'ADMIN', adminEmail, adminPassword);
    assertActorRole(admin, 'ADMIN', 'ADMIN');

    const adminJsonEndpoints = [
        '/api/auth/2fa/status',
        '/api/businesses/admin/all?limit=100',
        '/api/businesses/admin/catalog-quality?limit=25',
        '/api/analytics/growth/insights?days=30&limit=10',
        '/api/analytics/market-insights?days=30&limit=10',
        '/api/verification/admin/moderation-queue?limit=80',
        '/api/reviews/moderation/flagged?limit=50',
        '/api/analytics/market-reports?limit=20',
        '/api/verification/admin/pending-businesses?limit=50',
        '/api/health/dashboard',
    ];

    for (const endpoint of adminJsonEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: admin.accessToken,
        });
        expectStatus(response, [200], `GET ${endpoint} (ADMIN)`);
    }

    const metricsResponse = await request(apiBaseUrl, '/api/observability/metrics', {
        token: admin.accessToken,
        accept: 'text/plain',
    });
    expectStatus(metricsResponse, [200], 'GET /api/observability/metrics (ADMIN)');
    assert(
        metricsResponse.text.includes('aquita_http_request_duration_seconds')
        || metricsResponse.text.includes('aquita_http_requests_total'),
        'Admin metrics payload is missing expected counters',
    );
}

async function runOptionalAuthSmoke(apiBaseUrl, firstBusinessId, firstProvinceId) {
    if (process.env.SMOKE_PROD_SKIP_AUTH === '1') {
        console.log('Skipping authenticated role checks: SMOKE_PROD_SKIP_AUTH=1');
        return;
    }

    console.log('Running authenticated role checks');
    await runUserRoleSmoke(apiBaseUrl, firstBusinessId);
    await runOwnerRoleSmoke(apiBaseUrl, firstProvinceId);
    await runAdminRoleSmoke(apiBaseUrl);
}

async function runWebSmoke(webBaseUrl) {
    if (process.env.SMOKE_PROD_SKIP_WEB === '1') {
        console.log('Skipping web route checks: SMOKE_PROD_SKIP_WEB=1');
        return;
    }

    console.log(`Running web checks against ${webBaseUrl}`);

    const routes = ['/', '/businesses', '/login'];
    let homeHtml = '';
    for (const route of routes) {
        const response = await request(webBaseUrl, route, { accept: 'text/html' });
        expectStatus(response, [200], `GET ${route} (web)`);
        const contentType = response.headers.get('content-type') ?? '';
        assert(
            contentType.includes('text/html'),
            `${route} should return text/html, got ${contentType || 'unknown'}`,
        );
        if (route === '/') {
            homeHtml = response.text;
        }
    }

    await runBundleSignalSmoke(webBaseUrl, homeHtml);
}

async function main() {
    const apiBaseUrl = normalizeBaseUrl(
        process.env.SMOKE_PROD_API_BASE_URL ?? process.env.FULL_SMOKE_API_BASE_URL,
        DEFAULT_API_BASE_URL,
    );
    const webBaseUrl = normalizeBaseUrl(
        process.env.SMOKE_PROD_WEB_BASE_URL ?? process.env.FULL_SMOKE_WEB_BASE_URL,
        DEFAULT_WEB_BASE_URL,
    );

    const skipCheckIns = process.env.SMOKE_PROD_SKIP_CHECKINS === '1';

    console.log(`Starting production smoke (api=${apiBaseUrl}, web=${webBaseUrl})`);
    const { firstBusinessId, firstProvinceId } = await runApiSmoke(apiBaseUrl, skipCheckIns);
    await runOptionalAuthSmoke(apiBaseUrl, firstBusinessId, firstProvinceId);
    await runWebSmoke(webBaseUrl);
    console.log('Production smoke passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Production smoke failed: ${message}`);
    process.exitCode = 1;
});
