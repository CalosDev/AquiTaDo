import { randomUUID } from 'crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const DEFAULT_APP_BASE_URL = 'http://localhost:8080';
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SMOKE_PASSWORD = 'SmokePass123!';
const LOCAL_ADMIN_EMAIL = 'admin@aquita.do';
const LOCAL_ADMIN_PASSWORD = 'admin12345';
const BRAVE_PATH = process.env.BRAVE_PATH
    || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const VERCEL_EXTENSION_PATH = process.env.VERCEL_EXTENSION_PATH
    || path.join(
        process.env.LOCALAPPDATA ?? '',
        'BraveSoftware',
        'Brave-Browser',
        'User Data',
        'Default',
        'Extensions',
        'lahhiofdgnbcgmemekkmjnpifojdaelb',
        '1.4.1_0',
    );
const DEBUG_PORT = Number(process.env.BRAVE_ROLE_AUDIT_DEBUG_PORT ?? '9224');
const DEFAULT_SETTLE_MS = Number(process.env.BRAVE_ROLE_AUDIT_SETTLE_MS ?? '3500');

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

function isLocalApiBaseUrl(apiBaseUrl) {
    try {
        const hostname = new URL(apiBaseUrl).hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1';
    } catch {
        return false;
    }
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

function sanitizeConsoleMessage(text) {
    return text.replace(/\s+/g, ' ').trim();
}

function isExtensionNoise(text) {
    return (
        text.includes('layout-shift observer unavailable')
        || text.includes('Vercel Toolbar')
        || text.includes('instrument.')
        || text.includes('Default export is deprecated. Instead use `import { create } from \'zustand\'`.')
        || text.includes('`DialogContent` requires a `DialogTitle`')
        || text.includes('Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.')
    );
}

function toSlug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

async function request(apiBaseUrl, requestPath, options = {}) {
    const {
        method = 'GET',
        token,
        organizationId,
        headers: customHeaders,
        body,
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
        const response = await fetch(`${apiBaseUrl}${requestPath}`, {
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
                throw new Error(`${method} ${requestPath} returned invalid JSON`);
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

function assertStatus(response, allowedStatusCodes, label) {
    if (allowedStatusCodes.includes(response.status)) {
        return;
    }

    throw new Error(`${label} failed with HTTP ${response.status}. Response: ${formatResponsePayload(response)}`);
}

function normalizeActorUser(user) {
    assert(user && typeof user === 'object', 'Missing actor user payload');
    assert(typeof user.id === 'string', 'Missing actor user id');
    assert(typeof user.name === 'string', 'Missing actor user name');
    assert(typeof user.email === 'string', 'Missing actor user email');
    assert(typeof user.role === 'string', 'Missing actor user role');

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: typeof user.phone === 'string' ? user.phone : undefined,
        avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
        role: user.role,
        twoFactorEnabled: typeof user.twoFactorEnabled === 'boolean' ? user.twoFactorEnabled : undefined,
    };
}

async function registerActor(apiBaseUrl, options) {
    const {
        runId,
        label,
        role,
        name,
        phone,
        password = DEFAULT_SMOKE_PASSWORD,
    } = options;

    const email = `${label}.${runId}@example.com`;
    const registerResponse = await request(apiBaseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            name,
            email,
            password,
            phone,
            role,
        },
    });
    assertStatus(registerResponse, [201], `POST /api/auth/register (${label})`);

    const accessToken = registerResponse.json?.accessToken;
    const user = normalizeActorUser(registerResponse.json?.user);
    assert(typeof accessToken === 'string', `Missing access token for ${label}`);

    return {
        label,
        role,
        email,
        password,
        userId: user.id,
        accessToken,
        user,
    };
}

async function loginActor(apiBaseUrl, options) {
    const { email, password, label } = options;
    const loginResponse = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
            email,
            password,
        },
    });
    assertStatus(loginResponse, [200], `POST /api/auth/login (${label})`);

    const accessToken = loginResponse.json?.accessToken;
    const user = normalizeActorUser(loginResponse.json?.user);
    assert(typeof accessToken === 'string', `Missing access token for ${label}`);

    return {
        label,
        role: user.role,
        email,
        password,
        userId: user.id,
        accessToken,
        user,
    };
}

async function loadCatalog(apiBaseUrl) {
    const categoriesResponse = await request(apiBaseUrl, '/api/categories');
    assertStatus(categoriesResponse, [200], 'GET /api/categories');
    assert(Array.isArray(categoriesResponse.json) && categoriesResponse.json.length > 0, 'No categories available');
    const categoryId = categoriesResponse.json[0]?.id;
    assert(typeof categoryId === 'string', 'Missing category id');

    const featuresResponse = await request(apiBaseUrl, '/api/features');
    assertStatus(featuresResponse, [200], 'GET /api/features');
    assert(Array.isArray(featuresResponse.json) && featuresResponse.json.length > 0, 'No features available');
    const featureId = featuresResponse.json[0]?.id;
    assert(typeof featureId === 'string', 'Missing feature id');
    const bookingFeatureId = featuresResponse.json.find((feature) =>
        typeof feature?.name === 'string'
        && feature.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('reserv'),
    )?.id;

    const citiesResponse = await request(apiBaseUrl, '/api/cities');
    assertStatus(citiesResponse, [200], 'GET /api/cities');
    assert(Array.isArray(citiesResponse.json) && citiesResponse.json.length > 0, 'No cities available');
    const city = citiesResponse.json[0];
    const cityId = city?.id;
    const provinceId = city?.provinceId ?? city?.province?.id;
    assert(typeof provinceId === 'string', 'Missing province id linked to city');
    assert(typeof cityId === 'string', 'Missing city id');

    return {
        categoryId,
        featureId,
        bookingFeatureId: typeof bookingFeatureId === 'string' ? bookingFeatureId : null,
        provinceId,
        cityId,
    };
}

async function resolveAdminActor(apiBaseUrl) {
    const email = process.env.BRAVE_AUDIT_ADMIN_EMAIL?.trim();
    const password = process.env.BRAVE_AUDIT_ADMIN_PASSWORD?.trim();

    if (email && password) {
        return loginActor(apiBaseUrl, {
            email,
            password,
            label: 'admin',
        });
    }

    if (isLocalApiBaseUrl(apiBaseUrl)) {
        return loginActor(apiBaseUrl, {
            email: LOCAL_ADMIN_EMAIL,
            password: LOCAL_ADMIN_PASSWORD,
            label: 'admin',
        });
    }

    return null;
}

async function createOrganization(apiBaseUrl, owner, runId) {
    const createOrganizationResponse = await request(apiBaseUrl, '/api/organizations', {
        method: 'POST',
        token: owner.accessToken,
        body: {
            name: `Role Audit Org ${runId}`,
        },
    });
    assertStatus(createOrganizationResponse, [201], 'POST /api/organizations');

    const organizationId = createOrganizationResponse.json?.id;
    assert(typeof organizationId === 'string', 'Missing organization id');
    return organizationId;
}

async function createBusiness(apiBaseUrl, owner, organizationId, catalog, runId) {
    const featureIds = [catalog.featureId, catalog.bookingFeatureId].filter(Boolean);
    const createBusinessResponse = await request(apiBaseUrl, '/api/businesses', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            name: `Role Audit Business ${runId}`,
            description: 'Business created by Brave role audit for authenticated UI validation.',
            phone: '+18095550012',
            whatsapp: '+18095550013',
            address: 'Avenida Winston Churchill 123',
            provinceId: catalog.provinceId,
            cityId: catalog.cityId,
            latitude: 18.4861,
            longitude: -69.9312,
            categoryIds: [catalog.categoryId],
            featureIds,
        },
    });
    assertStatus(createBusinessResponse, [201], 'POST /api/businesses');

    const businessId = createBusinessResponse.json?.id;
    assert(typeof businessId === 'string', 'Missing business id');
    return businessId;
}

async function verifyBusinessIfAdminAvailable(apiBaseUrl, admin, businessId) {
    if (!admin) {
        return;
    }

    const verifyBusinessResponse = await request(apiBaseUrl, `/api/businesses/${businessId}/verify`, {
        method: 'PUT',
        token: admin.accessToken,
    });
    assertStatus(verifyBusinessResponse, [200], `PUT /api/businesses/${businessId}/verify`);
}

async function waitForDebugger(baseUrl, timeoutMs = 20_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/json/version`);
            if (response.ok) {
                return response.json();
            }
        } catch {
            // keep polling
        }
        await delay(250);
    }
    throw new Error(`Timed out waiting for Brave remote debugger on ${baseUrl}`);
}

async function createTarget(baseUrl, url) {
    const response = await fetch(`${baseUrl}/json/new?${encodeURIComponent(url)}`, {
        method: 'PUT',
    });
    if (!response.ok) {
        throw new Error(`Unable to create target for ${url}: ${response.status}`);
    }
    return response.json();
}

async function killProcessTree(pid) {
    if (!pid) {
        return;
    }

    if (process.platform === 'win32') {
        await new Promise((resolve) => {
            const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true,
            });
            killer.once('exit', () => resolve());
            killer.once('error', () => resolve());
        });
        return;
    }

    try {
        process.kill(-pid);
    } catch {
        // ignore cleanup failures
    }
}

async function removePathWithRetries(targetPath, attempts = 6) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await rm(targetPath, { recursive: true, force: true });
            return;
        } catch (error) {
            const code = error && typeof error === 'object' ? error.code : undefined;
            if ((code === 'EBUSY' || code === 'EPERM') && attempt < attempts) {
                await delay(250 * attempt);
                continue;
            }
            if (code === 'ENOENT') {
                return;
            }
            throw error;
        }
    }
}

class CdpClient {
    constructor(wsUrl) {
        this.socket = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.handlers = new Map();
    }

    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });

        this.socket.addEventListener('message', (event) => {
            const payload = JSON.parse(event.data.toString());
            if (typeof payload.id === 'number') {
                const entry = this.pending.get(payload.id);
                if (!entry) {
                    return;
                }
                this.pending.delete(payload.id);
                if (payload.error) {
                    entry.reject(new Error(payload.error.message));
                    return;
                }
                entry.resolve(payload.result ?? {});
                return;
            }

            if (payload.method) {
                const listeners = this.handlers.get(payload.method) ?? [];
                for (const listener of listeners) {
                    listener(payload.params ?? {});
                }
            }
        });
    }

    send(method, params = {}) {
        const id = this.nextId += 1;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({
                id,
                method,
                params,
            }));
        });
    }

    on(method, handler) {
        const listeners = this.handlers.get(method) ?? [];
        listeners.push(handler);
        this.handlers.set(method, listeners);
    }

    async close() {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.close();
            await delay(100);
        }
    }
}

function buildSessionBootstrapSource(session) {
    const serializedUser = JSON.stringify(session.user);
    const organizationStatement = session.activeOrganizationId
        ? `localStorage.setItem('activeOrganizationId', ${JSON.stringify(session.activeOrganizationId)});`
        : `localStorage.removeItem('activeOrganizationId');`;

    return `
        (() => {
            try {
                sessionStorage.setItem('accessToken', ${JSON.stringify(session.accessToken)});
                localStorage.setItem('user', ${JSON.stringify(serializedUser)});
                localStorage.setItem('aquita_has_session', '1');
                ${organizationStatement}
            } catch (error) {
                console.warn('auth bootstrap failed', error?.message || String(error));
            }
        })();
    `;
}

async function auditScenario(baseUrl, scenario, outputDir) {
    const target = await createTarget(baseUrl, 'about:blank');
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();

    const consoleMessages = [];
    const pageErrors = [];
    const networkFailures = [];

    client.on('Runtime.consoleAPICalled', (params) => {
        const args = (params.args ?? []).map((entry) => entry.value ?? entry.description ?? '');
        consoleMessages.push({
            type: params.type,
            text: sanitizeConsoleMessage(args.join(' ')),
        });
    });
    client.on('Runtime.exceptionThrown', (params) => {
        pageErrors.push(params.exceptionDetails?.text ?? 'Unknown runtime exception');
    });
    client.on('Log.entryAdded', (params) => {
        const { entry } = params;
        if (!entry) {
            return;
        }
        consoleMessages.push({
            type: entry.level ?? 'log',
            text: sanitizeConsoleMessage(entry.text ?? ''),
        });
    });
    client.on('Network.loadingFailed', (params) => {
        if (params.blockedReason === 'inspector') {
            return;
        }
        if (params.type === 'Document' && params.errorText === 'net::ERR_ABORTED' && params.canceled) {
            return;
        }
        networkFailures.push({
            type: params.type,
            errorText: params.errorText,
            canceled: params.canceled,
        });
    });

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Log.enable');
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            (() => {
                window.__AQUITA_LAYOUT_SHIFTS__ = [];
                try {
                    const observer = new PerformanceObserver((list) => {
                        for (const entry of list.getEntries()) {
                            if (entry.hadRecentInput) continue;
                            window.__AQUITA_LAYOUT_SHIFTS__.push({
                                value: entry.value,
                                startTime: entry.startTime,
                                sources: (entry.sources || []).map((source) => ({
                                    tagName: source.node?.tagName || null,
                                    className: source.node?.className || null,
                                    id: source.node?.id || null,
                                })),
                            });
                        }
                    });
                    observer.observe({ type: 'layout-shift', buffered: true });
                } catch (error) {
                    console.warn('layout-shift observer unavailable', error?.message || error);
                }
            })();
        `,
    });
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: buildSessionBootstrapSource(scenario.session),
    });

    let loadFired = false;
    client.on('Page.loadEventFired', () => {
        loadFired = true;
    });

    await client.send('Page.navigate', { url: scenario.url });
    const startedAt = Date.now();
    while (!loadFired && Date.now() - startedAt < 25_000) {
        await delay(100);
    }
    await delay(DEFAULT_SETTLE_MS);

    const evaluation = await client.send('Runtime.evaluate', {
        expression: `(() => {
            const shifts = window.__AQUITA_LAYOUT_SHIFTS__ || [];
            const cls = shifts.reduce((total, shift) => total + (shift.value || 0), 0);
            const hero = document.querySelector('.role-hero');
            return {
                title: document.title,
                pathname: location.pathname,
                cls,
                shiftCount: shifts.length,
                shifts: shifts.slice(0, 10),
                bodyClassName: document.body.className,
                htmlClassName: document.documentElement.className,
                scrollHeight: document.documentElement.scrollHeight,
                viewportHeight: window.innerHeight,
                scrollWidth: document.documentElement.scrollWidth,
                viewportWidth: window.innerWidth,
                overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
                footerCount: document.querySelectorAll('footer').length,
                navCount: document.querySelectorAll('nav').length,
                heroClassName: hero?.className || null,
                feedbackCount: document.querySelectorAll('.alert-info, .alert-danger, .alert-success').length,
                spinnerCount: document.querySelectorAll('.animate-spin').length,
            };
        })()`,
        awaitPromise: true,
        returnByValue: true,
    });

    const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
    });
    const screenshotPath = path.join(outputDir, `${toSlug(scenario.label)}.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    await client.close();

    const filteredConsoleMessages = consoleMessages.filter((message) => message.text);
    const externalNoise = filteredConsoleMessages.filter((message) => isExtensionNoise(message.text));
    const appConsoleMessages = filteredConsoleMessages.filter((message) => !isExtensionNoise(message.text));

    return {
        label: scenario.label,
        role: scenario.role,
        url: scenario.url,
        metrics: evaluation.result?.value ?? {},
        consoleMessages: appConsoleMessages,
        externalNoise,
        pageErrors,
        networkFailures,
        screenshotPath,
    };
}

async function run() {
    const apiBaseUrl = normalizeBaseUrl(process.env.BRAVE_AUDIT_API_URL, DEFAULT_API_BASE_URL);
    const appBaseUrl = normalizeBaseUrl(process.env.BRAVE_AUDIT_APP_URL, DEFAULT_APP_BASE_URL);
    const runId = randomUUID().slice(0, 8);

    console.log(`Running Brave role audit against ${appBaseUrl} (api=${apiBaseUrl}, run=${runId})`);

    const catalog = await loadCatalog(apiBaseUrl);
    const customer = await registerActor(apiBaseUrl, {
        runId,
        label: 'customer',
        role: 'USER',
        name: 'Role Audit Customer',
        phone: '+18095550021',
    });
    const owner = await registerActor(apiBaseUrl, {
        runId,
        label: 'owner',
        role: 'BUSINESS_OWNER',
        name: 'Role Audit Owner',
        phone: '+18095550022',
    });
    const admin = await resolveAdminActor(apiBaseUrl);
    const organizationId = await createOrganization(apiBaseUrl, owner, runId);
    const businessId = await createBusiness(apiBaseUrl, owner, organizationId, catalog, runId);
    await verifyBusinessIfAdminAvailable(apiBaseUrl, admin, businessId);

    const scenarios = [
        {
            label: 'customer-profile',
            role: 'USER',
            url: `${appBaseUrl}/profile`,
            session: {
                accessToken: customer.accessToken,
                user: customer.user,
                activeOrganizationId: null,
            },
        },
        {
            label: 'customer-dashboard',
            role: 'USER',
            url: `${appBaseUrl}/app/customer`,
            session: {
                accessToken: customer.accessToken,
                user: customer.user,
                activeOrganizationId: null,
            },
        },
        {
            label: 'owner-profile',
            role: 'BUSINESS_OWNER',
            url: `${appBaseUrl}/profile`,
            session: {
                accessToken: owner.accessToken,
                user: owner.user,
                activeOrganizationId: organizationId,
            },
        },
        {
            label: 'owner-dashboard',
            role: 'BUSINESS_OWNER',
            url: `${appBaseUrl}/dashboard`,
            session: {
                accessToken: owner.accessToken,
                user: owner.user,
                activeOrganizationId: organizationId,
            },
        },
        {
            label: 'owner-register-business',
            role: 'BUSINESS_OWNER',
            url: `${appBaseUrl}/register-business`,
            session: {
                accessToken: owner.accessToken,
                user: owner.user,
                activeOrganizationId: organizationId,
            },
        },
        {
            label: 'owner-edit-business',
            role: 'BUSINESS_OWNER',
            url: `${appBaseUrl}/dashboard/businesses/${businessId}/edit`,
            session: {
                accessToken: owner.accessToken,
                user: owner.user,
                activeOrganizationId: organizationId,
            },
        },
    ];

    if (admin) {
        scenarios.push(
            {
                label: 'admin-profile',
                role: 'ADMIN',
                url: `${appBaseUrl}/profile`,
                session: {
                    accessToken: admin.accessToken,
                    user: admin.user,
                    activeOrganizationId: null,
                },
            },
            {
                label: 'admin-dashboard',
                role: 'ADMIN',
                url: `${appBaseUrl}/admin`,
                session: {
                    accessToken: admin.accessToken,
                    user: admin.user,
                    activeOrganizationId: null,
                },
            },
            {
                label: 'admin-security',
                role: 'ADMIN',
                url: `${appBaseUrl}/security`,
                session: {
                    accessToken: admin.accessToken,
                    user: admin.user,
                    activeOrganizationId: null,
                },
            },
        );
    }

    const profileDir = await mkdtemp(path.join(tmpdir(), 'aquita-brave-role-profile-'));
    const outputDir = path.join(process.cwd(), 'output', 'brave-role-audit');
    await mkdir(outputDir, { recursive: true });

    const baseUrl = `http://127.0.0.1:${DEBUG_PORT}`;
    const brave = spawn(BRAVE_PATH, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profileDir}`,
        `--disable-extensions-except=${VERCEL_EXTENSION_PATH}`,
        `--load-extension=${VERCEL_EXTENSION_PATH}`,
        'about:blank',
    ], {
        stdio: 'ignore',
        detached: process.platform !== 'win32',
        windowsHide: false,
    });

    try {
        await waitForDebugger(baseUrl);
        const reports = [];
        for (const scenario of scenarios) {
            console.log(`Auditing ${scenario.label} -> ${scenario.url}`);
            const report = await auditScenario(baseUrl, scenario, outputDir);
            reports.push(report);
            console.log(JSON.stringify({
                label: report.label,
                role: report.role,
                path: report.metrics.pathname,
                cls: report.metrics.cls,
                shifts: report.metrics.shiftCount,
                overflowX: report.metrics.overflowX,
                consoleMessages: report.consoleMessages.length,
                externalNoise: report.externalNoise.length,
                pageErrors: report.pageErrors.length,
                networkFailures: report.networkFailures.length,
            }));
        }

        const outputPath = path.join(outputDir, `report-${runId}.json`);
        await writeFile(outputPath, JSON.stringify(reports, null, 2));

        const failingReports = reports.filter((report) =>
            (report.metrics.cls ?? 0) > 0.01
            || report.metrics.overflowX
            || report.pageErrors.length > 0
            || report.networkFailures.length > 0
            || report.consoleMessages.some((message) => message.type === 'error'),
        );

        console.log(`Saved role audit report to ${outputPath}`);

        if (failingReports.length > 0) {
            throw new Error(`Brave role audit found ${failingReports.length} failing scenario(s)`);
        }
    } finally {
        await killProcessTree(brave.pid);
        await removePathWithRetries(profileDir);
    }
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
