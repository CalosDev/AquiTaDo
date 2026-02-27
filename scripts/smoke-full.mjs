const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const DEFAULT_WEB_BASE_URL = 'http://localhost:8080';
const REQUEST_TIMEOUT_MS = 6_000;

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

async function request(url, accept = 'application/json') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                accept,
            },
        });

        const text = await response.text();
        return { response, text };
    } finally {
        clearTimeout(timeout);
    }
}

function parseJsonOrThrow(rawText, endpoint) {
    try {
        return rawText ? JSON.parse(rawText) : null;
    } catch {
        throw new Error(`${endpoint} did not return valid JSON`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function checkApiHealth(apiBaseUrl) {
    const liveness = await request(`${apiBaseUrl}/api/health`);
    const liveBody = parseJsonOrThrow(liveness.text, '/api/health');
    assert(liveness.response.ok, `/api/health failed with HTTP ${liveness.response.status}`);
    assert(liveBody?.status === 'ok', '/api/health returned invalid status');

    const readiness = await request(`${apiBaseUrl}/api/health/ready`);
    const readyBody = parseJsonOrThrow(readiness.text, '/api/health/ready');
    assert(readiness.response.ok, `/api/health/ready failed with HTTP ${readiness.response.status}`);
    assert(readyBody?.checks?.database === 'up', 'Database readiness check is not up');
    assert(readyBody?.checks?.schema === 'up', 'Schema readiness check is not up');
}

async function checkReferenceData(apiBaseUrl) {
    const plansResponse = await request(`${apiBaseUrl}/api/plans`);
    const plans = parseJsonOrThrow(plansResponse.text, '/api/plans');
    assert(plansResponse.response.ok, `/api/plans failed with HTTP ${plansResponse.response.status}`);
    assert(Array.isArray(plans) && plans.length >= 1, 'No plans found. Run pnpm db:seed');

    const categoriesResponse = await request(`${apiBaseUrl}/api/categories`);
    const categories = parseJsonOrThrow(categoriesResponse.text, '/api/categories');
    assert(
        categoriesResponse.response.ok,
        `/api/categories failed with HTTP ${categoriesResponse.response.status}`,
    );
    assert(Array.isArray(categories) && categories.length >= 1, 'No categories found. Run pnpm db:seed');

    const featuresResponse = await request(`${apiBaseUrl}/api/features`);
    const features = parseJsonOrThrow(featuresResponse.text, '/api/features');
    assert(
        featuresResponse.response.ok,
        `/api/features failed with HTTP ${featuresResponse.response.status}`,
    );
    assert(Array.isArray(features) && features.length >= 1, 'No features found. Run pnpm db:seed');

    const provincesResponse = await request(`${apiBaseUrl}/api/provinces`);
    const provinces = parseJsonOrThrow(provincesResponse.text, '/api/provinces');
    assert(
        provincesResponse.response.ok,
        `/api/provinces failed with HTTP ${provincesResponse.response.status}`,
    );
    assert(Array.isArray(provinces) && provinces.length >= 1, 'No provinces found. Run pnpm db:seed');
}

async function checkPublicMarketplace(apiBaseUrl) {
    const businessesResponse = await request(`${apiBaseUrl}/api/businesses`);
    const businesses = parseJsonOrThrow(businessesResponse.text, '/api/businesses');
    assert(
        businessesResponse.response.ok,
        `/api/businesses failed with HTTP ${businessesResponse.response.status}`,
    );
    assert(Array.isArray(businesses?.data), '/api/businesses.data must be an array');
    assert(Number.isInteger(businesses?.total), '/api/businesses.total must be an integer');

    const promotionsResponse = await request(`${apiBaseUrl}/api/promotions`);
    const promotions = parseJsonOrThrow(promotionsResponse.text, '/api/promotions');
    assert(
        promotionsResponse.response.ok,
        `/api/promotions failed with HTTP ${promotionsResponse.response.status}`,
    );
    assert(Array.isArray(promotions?.data), '/api/promotions.data must be an array');
    assert(Number.isInteger(promotions?.total), '/api/promotions.total must be an integer');

    const searchResponse = await request(`${apiBaseUrl}/api/search/businesses?q=restaurante&limit=5`);
    const searchPayload = parseJsonOrThrow(searchResponse.text, '/api/search/businesses');
    assert(
        searchResponse.response.ok,
        `/api/search/businesses failed with HTTP ${searchResponse.response.status}`,
    );
    assert(Array.isArray(searchPayload?.data), '/api/search/businesses.data must be an array');
    assert(Number.isInteger(searchPayload?.total), '/api/search/businesses.total must be an integer');

    const discoveryResponse = await request(
        `${apiBaseUrl}/api/discovery/businesses/nearby?lat=18.4861&lng=-69.9312&radiusKm=10&limit=5`,
    );
    const discoveryPayload = parseJsonOrThrow(discoveryResponse.text, '/api/discovery/businesses/nearby');
    assert(
        discoveryResponse.response.ok,
        `/api/discovery/businesses/nearby failed with HTTP ${discoveryResponse.response.status}`,
    );
    assert(Array.isArray(discoveryPayload?.data), '/api/discovery/businesses/nearby.data must be an array');
    assert(Number.isInteger(discoveryPayload?.count), '/api/discovery/businesses/nearby.count must be an integer');
}

async function checkObservability(apiBaseUrl) {
    const metricsResponse = await request(`${apiBaseUrl}/api/observability/metrics`, 'text/plain');
    assert(
        metricsResponse.response.ok,
        `/api/observability/metrics failed with HTTP ${metricsResponse.response.status}`,
    );
    assert(
        metricsResponse.text.includes('aquita_http_requests_total'),
        '/api/observability/metrics missing aquita_http_requests_total',
    );
}

async function checkWebHealth(webBaseUrl) {
    const health = await request(`${webBaseUrl}/health`, 'text/plain');
    assert(health.response.ok, `/health failed with HTTP ${health.response.status}`);
    assert(health.text.trim().toLowerCase() === 'ok', '/health did not return ok');
}

async function main() {
    const apiBaseUrl = normalizeBaseUrl(process.env.FULL_SMOKE_API_BASE_URL, DEFAULT_API_BASE_URL);
    const webBaseUrl = normalizeBaseUrl(process.env.FULL_SMOKE_WEB_BASE_URL, DEFAULT_WEB_BASE_URL);
    const skipWebCheck = process.env.FULL_SMOKE_SKIP_WEB === '1';

    console.log(`Running full smoke test (api=${apiBaseUrl}, web=${webBaseUrl})`);

    await checkApiHealth(apiBaseUrl);
    console.log('OK API health/readiness');

    await checkReferenceData(apiBaseUrl);
    console.log('OK reference data (plans/categories/features/provinces)');

    await checkPublicMarketplace(apiBaseUrl);
    console.log('OK public marketplace and search endpoints');

    await checkObservability(apiBaseUrl);
    console.log('OK observability metrics endpoint');

    if (!skipWebCheck) {
        await checkWebHealth(webBaseUrl);
        console.log('OK web health');
    }

    console.log('Full smoke test passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Full smoke test failed: ${message}`);
    process.exitCode = 1;
});
