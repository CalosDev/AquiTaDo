const DEFAULT_API_BASE_URL = 'https://aquitado.onrender.com';
const DEFAULT_WEB_BASE_URL = 'https://aquitado.vercel.app';
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
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

    return { firstBusinessId };
}

async function runOptionalAuthSmoke(apiBaseUrl, firstBusinessId) {
    const userEmail = process.env.SMOKE_PROD_USER_EMAIL?.trim();
    const userPassword = process.env.SMOKE_PROD_USER_PASSWORD?.trim();

    if (!userEmail || !userPassword) {
        console.log('Skipping auth checks: set SMOKE_PROD_USER_EMAIL and SMOKE_PROD_USER_PASSWORD');
        return;
    }

    console.log('Running authenticated checks');

    const login = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
            email: userEmail,
            password: userPassword,
        },
    });
    expectStatus(login, [200], 'POST /api/auth/login');
    const accessToken = login.json?.accessToken;
    assert(typeof accessToken === 'string', 'Login did not return accessToken');

    const me = await request(apiBaseUrl, '/api/users/me', {
        token: accessToken,
    });
    expectStatus(me, [200], 'GET /api/users/me');

    if (process.env.SMOKE_PROD_CHECKIN_CREATE !== '1') {
        console.log('Skipping check-in create: set SMOKE_PROD_CHECKIN_CREATE=1 to enable');
        return;
    }

    const createCheckIn = await request(apiBaseUrl, '/api/checkins', {
        method: 'POST',
        token: accessToken,
        body: {
            businessId: firstBusinessId,
        },
    });

    if (createCheckIn.status === 201 || createCheckIn.status === 200) {
        console.log('Check-in create passed');
        return;
    }

    if (isExpectedCheckInError(createCheckIn)) {
        console.log('Check-in create returned expected cooldown/daily-limit validation');
        return;
    }

    throw new Error(
        `POST /api/checkins failed with HTTP ${createCheckIn.status}. Response: ${formatResponsePayload(createCheckIn)}`,
    );
}

async function runWebSmoke(webBaseUrl) {
    if (process.env.SMOKE_PROD_SKIP_WEB === '1') {
        console.log('Skipping web route checks: SMOKE_PROD_SKIP_WEB=1');
        return;
    }

    console.log(`Running web checks against ${webBaseUrl}`);

    const routes = ['/', '/businesses', '/login'];
    for (const route of routes) {
        const response = await request(webBaseUrl, route, { accept: 'text/html' });
        expectStatus(response, [200], `GET ${route} (web)`);
        const contentType = response.headers.get('content-type') ?? '';
        assert(
            contentType.includes('text/html'),
            `${route} should return text/html, got ${contentType || 'unknown'}`,
        );
    }
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
    const { firstBusinessId } = await runApiSmoke(apiBaseUrl, skipCheckIns);
    await runOptionalAuthSmoke(apiBaseUrl, firstBusinessId);
    await runWebSmoke(webBaseUrl);
    console.log('Production smoke passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Production smoke failed: ${message}`);
    process.exitCode = 1;
});
