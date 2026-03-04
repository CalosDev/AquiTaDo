const API_BASE_URL = normalizeBaseUrl(
    process.env.KEEPWARM_API_BASE_URL,
    'https://aquitado.onrender.com',
);
const WEB_BASE_URL = normalizeBaseUrl(
    process.env.KEEPWARM_WEB_BASE_URL,
    'https://aquitado.vercel.app',
);
const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.KEEPWARM_TIMEOUT_MS, 10_000);

const TARGETS = [
    { name: 'API health', url: `${API_BASE_URL}/api/health`, accept: 'application/json' },
    { name: 'API readiness', url: `${API_BASE_URL}/api/health/ready`, accept: 'application/json' },
    { name: 'API businesses', url: `${API_BASE_URL}/api/businesses?limit=1`, accept: 'application/json' },
    { name: 'WEB home', url: `${WEB_BASE_URL}/`, accept: 'text/html' },
];

function normalizeBaseUrl(rawValue, fallbackValue) {
    const normalized = (rawValue || fallbackValue).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

function parsePositiveInt(rawValue, fallbackValue) {
    if (!rawValue) {
        return fallbackValue;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid positive integer: ${rawValue}`);
    }
    return Math.floor(parsed);
}

async function ping(target) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = performance.now();

    try {
        const response = await fetch(target.url, {
            signal: controller.signal,
            headers: {
                accept: target.accept,
            },
        });
        await response.text();
        const elapsed = performance.now() - started;
        if (!response.ok) {
            throw new Error(`${target.name} failed with ${response.status}`);
        }
        return elapsed;
    } finally {
        clearTimeout(timeout);
    }
}

async function main() {
    console.log(`Keep warm check started (api=${API_BASE_URL}, web=${WEB_BASE_URL})`);
    for (const target of TARGETS) {
        const elapsed = await ping(target);
        console.log(`OK ${target.name} (${Math.round(elapsed)} ms)`);
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Keep warm check failed: ${message}`);
    process.exitCode = 1;
});
