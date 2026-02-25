const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_INTERVAL_MS = 1_500;
const REQUEST_TIMEOUT_MS = 5_000;

function parsePositiveInt(rawValue, fallbackValue) {
    if (rawValue === undefined) {
        return fallbackValue;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid numeric value: ${rawValue}`);
    }

    return parsed;
}

function normalizeBaseUrl(rawUrl) {
    const normalized = (rawUrl ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('SMOKE_BASE_URL cannot be empty');
    }
    return normalized;
}

async function requestJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                accept: 'application/json',
            },
        });

        const text = await response.text();
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            body = null;
        }

        return { response, body };
    } finally {
        clearTimeout(timeout);
    }
}

async function waitForHealthyEndpoint(baseUrl, path, timeoutMs, intervalMs) {
    const url = `${baseUrl}${path}`;
    const deadline = Date.now() + timeoutMs;
    let lastReason = 'unknown error';

    while (Date.now() < deadline) {
        try {
            const { response, body } = await requestJson(url);
            if (response.ok && body && body.status === 'ok') {
                console.log(`OK ${path} (${response.status})`);
                return;
            }

            lastReason = `HTTP ${response.status} body=${JSON.stringify(body)}`;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            lastReason = message;
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Smoke check failed for ${path}: ${lastReason}`);
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.SMOKE_BASE_URL);
    const timeoutMs = parsePositiveInt(process.env.SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
    const intervalMs = parsePositiveInt(process.env.SMOKE_INTERVAL_MS, DEFAULT_INTERVAL_MS);
    const includeReadiness = process.env.SMOKE_CHECK_READINESS !== '0';

    const endpoints = ['/api/health'];
    if (includeReadiness) {
        endpoints.push('/api/health/ready');
    }

    console.log(`Running API smoke test against ${baseUrl}`);
    for (const endpoint of endpoints) {
        await waitForHealthyEndpoint(baseUrl, endpoint, timeoutMs, intervalMs);
    }

    console.log('Smoke test passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Smoke test failed: ${message}`);
    process.exitCode = 1;
});

