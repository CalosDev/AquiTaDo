import { writeFileSync } from 'node:fs';

const WEB_BASE_URL = normalizeBaseUrl(
    process.env.PERF_WEB_BASE_URL,
    'https://aquitado.vercel.app',
);
const API_BASE_URL = normalizeBaseUrl(
    process.env.PERF_API_BASE_URL,
    'https://aquitado.onrender.com',
);
const RUNS = parsePositiveInt(process.env.PERF_RUNS, 7);
const TIMEOUT_MS = parsePositiveInt(process.env.PERF_TIMEOUT_MS, 30_000);
const OUTPUT_JSON = process.env.PERF_OUTPUT_JSON?.trim() || '';

const TARGETS = [
    { name: 'WEB /', url: `${WEB_BASE_URL}/`, accept: 'text/html' },
    { name: 'WEB /businesses', url: `${WEB_BASE_URL}/businesses`, accept: 'text/html' },
    { name: 'API /api/health', url: `${API_BASE_URL}/api/health` },
    { name: 'API /api/health/ready', url: `${API_BASE_URL}/api/health/ready` },
    { name: 'API /api/categories', url: `${API_BASE_URL}/api/categories` },
    { name: 'API /api/provinces', url: `${API_BASE_URL}/api/provinces` },
    { name: 'API /api/businesses?limit=12', url: `${API_BASE_URL}/api/businesses?limit=12` },
    {
        name: 'API /api/search/businesses?q=tecnologia&limit=6',
        url: `${API_BASE_URL}/api/search/businesses?q=tecnologia&limit=6`,
    },
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

function quantile(sortedValues, q) {
    if (sortedValues.length === 0) {
        return 0;
    }

    const index = (sortedValues.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) {
        return sortedValues[lower];
    }
    const ratio = index - lower;
    return sortedValues[lower] * (1 - ratio) + sortedValues[upper] * ratio;
}

function formatMs(value) {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    return `${Math.round(value)} ms`;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hit(url, accept = 'application/json') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                accept,
            },
        });
        await response.text();
        const elapsed = performance.now() - started;
        return {
            status: response.status,
            elapsedMs: elapsed,
        };
    } catch (error) {
        return {
            status: 0,
            elapsedMs: 0,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        clearTimeout(timeout);
    }
}

function statusSummary(samples) {
    const counts = new Map();
    for (const sample of samples) {
        const key = String(sample.status);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
        .map(([status, count]) => `${status}x${count}`)
        .join(', ');
}

async function benchmarkTarget(target) {
    const warmup = await hit(target.url, target.accept);
    const samples = [];

    for (let index = 0; index < RUNS; index += 1) {
        samples.push(await hit(target.url, target.accept));
        await sleep(120);
    }

    const successful = samples.filter((sample) => sample.status >= 200 && sample.status < 400);
    const elapsed = successful.map((sample) => sample.elapsedMs).sort((a, b) => a - b);

    return {
        name: target.name,
        url: target.url,
        warmup,
        runCount: RUNS,
        okCount: successful.length,
        errorCount: RUNS - successful.length,
        statusSummary: statusSummary(samples),
        minMs: elapsed.length ? elapsed[0] : null,
        p50Ms: elapsed.length ? quantile(elapsed, 0.5) : null,
        p95Ms: elapsed.length ? quantile(elapsed, 0.95) : null,
        maxMs: elapsed.length ? elapsed[elapsed.length - 1] : null,
        avgMs: elapsed.length ? elapsed.reduce((acc, value) => acc + value, 0) / elapsed.length : null,
        errors: samples.filter((sample) => sample.error).map((sample) => sample.error),
    };
}

function printMarkdownReport(rows) {
    console.log('\n## Performance Benchmark');
    console.log(`- Generated: ${new Date().toISOString()}`);
    console.log(`- Web Base: ${WEB_BASE_URL}`);
    console.log(`- API Base: ${API_BASE_URL}`);
    console.log(`- Warmup: 1 hit + ${RUNS} measured hits per endpoint\n`);

    console.log('| Endpoint | Warmup | p50 | p95 | avg | max | status |');
    console.log('|---|---:|---:|---:|---:|---:|---|');
    for (const row of rows) {
        console.log(
            `| ${row.name} | ${formatMs(row.warmup.elapsedMs)} | ${formatMs(row.p50Ms)} | ${formatMs(row.p95Ms)} | ${formatMs(row.avgMs)} | ${formatMs(row.maxMs)} | ${row.statusSummary} |`,
        );
    }

    const unstable = rows.filter((row) => row.errorCount > 0 || !row.statusSummary.includes('200'));
    if (unstable.length > 0) {
        console.log('\n### Endpoint warnings');
        unstable.forEach((row) => {
            console.log(`- ${row.name}: ${row.statusSummary}`);
            row.errors.forEach((error) => console.log(`  - ${error}`));
        });
    }
}

async function main() {
    console.log(`Running performance benchmark (runs=${RUNS}, timeout=${TIMEOUT_MS}ms)`);
    const rows = [];
    for (const target of TARGETS) {
        rows.push(await benchmarkTarget(target));
    }

    printMarkdownReport(rows);

    const payload = {
        generatedAt: new Date().toISOString(),
        webBaseUrl: WEB_BASE_URL,
        apiBaseUrl: API_BASE_URL,
        runs: RUNS,
        timeoutMs: TIMEOUT_MS,
        rows,
    };

    if (OUTPUT_JSON) {
        writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`\nJSON report written to ${OUTPUT_JSON}`);
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Performance benchmark failed: ${message}`);
    process.exitCode = 1;
});
