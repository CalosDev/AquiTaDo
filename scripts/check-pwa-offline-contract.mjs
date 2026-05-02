import { promises as fs } from 'node:fs';
import path from 'node:path';

// Manual report-only check.
// Usage: node scripts/check-pwa-offline-contract.mjs
// Scope: static PWA/offline contract across service worker, nginx cache headers, and registration.

const projectRoot = process.cwd();

const files = {
    serviceWorker: path.join(projectRoot, 'apps', 'web', 'public', 'service-worker.js'),
    nginx: path.join(projectRoot, 'apps', 'web', 'nginx.conf'),
    pwa: path.join(projectRoot, 'apps', 'web', 'src', 'lib', 'pwa.ts'),
    manifest: path.join(projectRoot, 'apps', 'web', 'public', 'manifest.webmanifest'),
};

async function main() {
    const [
        serviceWorker,
        nginx,
        pwa,
        manifest,
    ] = await Promise.all([
        readFile(files.serviceWorker),
        readFile(files.nginx),
        readFile(files.pwa),
        readFile(files.manifest),
    ]);

    const findings = [];
    const notes = [];
    const summary = {
        cacheVersion: inspectCacheVersion(serviceWorker, findings),
        appShellAssets: inspectAppShellAssets(serviceWorker, findings),
        apiExclusion: inspectApiExclusion(serviceWorker, findings),
        nginxServiceWorkerCaching: inspectNginxServiceWorkerCaching(nginx, findings),
        indexCacheControl: inspectIndexCacheControl(nginx, findings),
        registrationSource: inspectRegistrationSource(pwa, findings),
        loadRegistration: inspectLoadRegistration(pwa, findings),
        manifest: inspectManifest(manifest, findings),
    };

    notes.push(`CACHE_VERSION: ${summary.cacheVersion}`);
    notes.push(`APP_SHELL_ASSETS count: ${summary.appShellAssets.count}`);
    notes.push(`APP_SHELL_ASSETS entries: ${summary.appShellAssets.entries.join(', ') || '(none)'}`);
    notes.push(`API handling in service worker: ${summary.apiExclusion}`);
    notes.push(`service-worker.js nginx caching: ${summary.nginxServiceWorkerCaching}`);
    notes.push(`index.html cache-control contract: ${summary.indexCacheControl}`);
    notes.push(`Service worker registration source: ${summary.registrationSource}`);
    notes.push(`Service worker registration timing: ${summary.loadRegistration}`);
    notes.push(`Manifest start_url: ${summary.manifest.startUrl}`);
    notes.push(`Manifest scope: ${summary.manifest.scope}`);

    printReport({ findings, notes });
}

async function readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
}

function inspectCacheVersion(content, findings) {
    const literal = extractFirst(content, /const\s+CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (!literal) {
        findings.push(finding('high', 'service-worker.js', 'CACHE_VERSION declaration was not found.', 'Keep the check manual; review service-worker versioning before changing runtime.'));
        return '(missing)';
    }

    findings.push(finding('high', 'service-worker.js', `CACHE_VERSION is fixed to "${literal}".`, 'Characterize update strategy before changing service-worker versioning.'));
    return literal;
}

function inspectAppShellAssets(content, findings) {
    const arraySource = extractFirst(content, /const\s+APP_SHELL_ASSETS\s*=\s*\[([\s\S]*?)\]/);
    const entries = arraySource
        ? [...arraySource.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1])
        : [];

    if (!arraySource) {
        findings.push(finding('medium', 'service-worker.js', 'APP_SHELL_ASSETS declaration was not found.', 'Confirm what the service worker precaches before touching offline runtime.'));
        return { count: 0, entries: [] };
    }

    const hasHashedViteBundle = entries.some((entry) => /\/assets\/.+\.[A-Za-z0-9_-]{6,}\.(?:js|css)$/.test(entry));
    if (!hasHashedViteBundle) {
        findings.push(finding('high', 'service-worker.js', 'APP_SHELL_ASSETS does not include hashed Vite bundles.', 'Expect shell-only offline coverage until a safer precache strategy is characterized.'));
    }

    return { count: entries.length, entries };
}

function inspectApiExclusion(content, findings) {
    const excludesApi = /url\.pathname\.startsWith\(\s*['"]\/api\/['"]\s*\)/.test(content)
        && /if\s*\(\s*isApi\s*\)\s*\{\s*return;\s*\}/.test(content);

    if (excludesApi) {
        findings.push(finding('info', 'service-worker.js', 'Service worker excludes same-origin /api/* requests from cache handling.', 'Keep API caching out of scope until runtime behavior is characterized.'));
        return 'excluded';
    }

    findings.push(finding('medium', 'service-worker.js', 'The current /api/* exclusion pattern was not detected.', 'Review service-worker fetch handling before changing offline assumptions.'));
    return 'not-detected';
}

function inspectNginxServiceWorkerCaching(content, findings) {
    const jsBlockMatch = content.match(/location\s+~\*\s+\\\.\(\?:js\|css\|png\|jpg\|jpeg\|gif\|svg\|ico\|woff\|woff2\)\$\s*\{[\s\S]*?\}/);
    const hasGenericJsImmutable = /location\s+~\*\s+\\\.\(\?:js\|css\|png\|jpg\|jpeg\|gif\|svg\|ico\|woff\|woff2\)\$\s*\{[\s\S]*?Cache-Control\s+"public,\s*max-age=604800,\s*immutable"/.test(content);
    const hasDedicatedServiceWorkerOverride = /location\s*=\s*\/service-worker\.js\s*\{/.test(content);

    if (hasGenericJsImmutable && !hasDedicatedServiceWorkerOverride) {
        findings.push(finding('high', 'nginx.conf', 'service-worker.js appears to inherit the generic *.js immutable cache rule.', 'Characterize deployment staleness before changing headers or worker update flow.'));
        return 'generic-js-immutable-without-override';
    }

    if (hasDedicatedServiceWorkerOverride) {
        findings.push(finding('info', 'nginx.conf', 'service-worker.js has a dedicated nginx location override.', 'Keep header behavior characterized if this changes later.'));
        return 'dedicated-override';
    }

    if (jsBlockMatch) {
        findings.push(finding('medium', 'nginx.conf', 'A generic asset cache block exists, but immutable service-worker coverage could not be confirmed.', 'Review nginx asset headers before changing PWA runtime assumptions.'));
        return 'generic-js-cache-block-present';
    }

    findings.push(finding('medium', 'nginx.conf', 'The expected generic asset cache block was not detected.', 'Confirm hosting headers before making offline/cache changes.'));
    return 'not-detected';
}

function inspectIndexCacheControl(content, findings) {
    const hasIndexNoCache = /location\s*=\s*\/index\.html\s*\{[\s\S]*?Cache-Control\s+"no-cache,\s*no-store,\s*must-revalidate"/.test(content);

    if (hasIndexNoCache) {
        return 'no-cache, no-store, must-revalidate';
    }

    findings.push(finding('medium', 'nginx.conf', 'index.html no-cache/no-store/must-revalidate header was not detected.', 'Review HTML cache headers before relying on deploy freshness assumptions.'));
    return 'not-detected';
}

function inspectRegistrationSource(content, findings) {
    const registersWorker = /navigator\.serviceWorker\.register\(\s*['"]\/service-worker\.js['"]\s*\)/.test(content);
    if (registersWorker) {
        return 'apps/web/src/lib/pwa.ts';
    }

    findings.push(finding('medium', 'pwa.ts', 'navigator.serviceWorker.register("/service-worker.js") was not detected in pwa.ts.', 'Review the service-worker registration source before changing runtime behavior.'));
    return 'not-detected';
}

function inspectLoadRegistration(content, findings) {
    const waitsForLoad = /window\.addEventListener\(\s*['"]load['"]\s*,\s*register\b/.test(content);
    if (waitsForLoad) {
        findings.push(finding('medium', 'pwa.ts', 'Service worker registration is deferred until window.load.', 'Characterize first-load and hard-refresh offline behavior before moving registration earlier.'));
        return 'window.load';
    }

    return 'not-detected';
}

function inspectManifest(content, findings) {
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch {
        findings.push(finding('low', 'manifest.webmanifest', 'Manifest JSON could not be parsed.', 'Keep manifest review manual until runtime changes are planned.'));
        return { startUrl: '(parse-error)', scope: '(parse-error)' };
    }

    return {
        startUrl: typeof parsed.start_url === 'string' ? parsed.start_url : '(missing)',
        scope: typeof parsed.scope === 'string' ? parsed.scope : '(missing)',
    };
}

function printReport({ findings, notes }) {
    console.log('[pwa-offline-contract-check] Report-only static PWA/offline contract check');
    console.log('');
    console.log('Files read:');
    for (const filePath of Object.values(files)) {
        console.log(`- ${normalizePath(path.relative(projectRoot, filePath))}`);
    }
    console.log('');

    if (findings.length > 0) {
        console.log(`Findings (${findings.length}):`);
        for (const item of findings) {
            console.log(`- [${item.severity.toUpperCase()}] ${item.location}: ${item.message}`);
            console.log(`  Recommendation: ${item.recommendation}`);
        }
    } else {
        console.log('Findings: none');
    }

    if (notes.length > 0) {
        console.log('');
        console.log('Notes:');
        for (const note of notes) {
            console.log(`- ${note}`);
        }
    }

    console.log('');
    console.log('Report-only mode: findings do not change exit code and this script is not wired into CI.');
}

function finding(severity, location, message, recommendation) {
    return {
        severity,
        location,
        message,
        recommendation,
    };
}

function extractFirst(content, pattern) {
    return content.match(pattern)?.[1] ?? null;
}

function normalizePath(value) {
    return value.replace(/\\/g, '/');
}

main().catch((error) => {
    console.error('[pwa-offline-contract-check] Unable to complete report.');
    console.error(error instanceof Error ? error.message : error);
    console.log('');
    console.log('Report-only mode: script errors are reported, but this tool is not wired into CI.');
    process.exitCode = 0;
});
