import { randomUUID } from 'crypto';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadOptionalSmokeEnv } from './lib/load-smoke-env.mjs';

loadOptionalSmokeEnv();

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const DEFAULT_APP_BASE_URL = 'http://localhost:8080';
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SMOKE_PASSWORD = 'SmokePass123!';
const DEFAULT_REMOTE_SMOKE_USER_EMAIL = 'smoke.user.aquitado@example.com';
const DEFAULT_REMOTE_SMOKE_OWNER_EMAIL = 'smoke.owner.aquitado@example.com';
const DEFAULT_REMOTE_SMOKE_ADMIN_EMAIL = 'admin@aquita.do';
const DEFAULT_REMOTE_SMOKE_ADMIN_PASSWORD = 'admin12345';
const LOCAL_ADMIN_EMAIL = 'admin@aquita.do';
const LOCAL_ADMIN_PASSWORD = 'admin12345';
const BRAVE_PATH = process.env.BRAVE_PATH
    || 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const VERCEL_EXTENSION_ROOT = path.join(
    process.env.LOCALAPPDATA ?? '',
    'BraveSoftware',
    'Brave-Browser',
    'User Data',
    'Default',
    'Extensions',
    'lahhiofdgnbcgmemekkmjnpifojdaelb',
);
const DEBUG_PORT = Number(process.env.BRAVE_ROLE_AUDIT_DEBUG_PORT ?? '9224');
const DEFAULT_SETTLE_MS = Number(process.env.BRAVE_ROLE_AUDIT_SETTLE_MS ?? '3500');
const VIEWPORT_WIDTH = Number(process.env.BRAVE_ROLE_AUDIT_VIEWPORT_WIDTH ?? '1440');
const VIEWPORT_HEIGHT = Number(process.env.BRAVE_ROLE_AUDIT_VIEWPORT_HEIGHT ?? '960');
const VIEWPORT_MOBILE = process.env.BRAVE_ROLE_AUDIT_VIEWPORT_MOBILE === '1';
const VIEWPORT_SCALE = Number(
    process.env.BRAVE_ROLE_AUDIT_VIEWPORT_SCALE ?? (VIEWPORT_MOBILE ? '3' : '1'),
);
const VIEWPORT_IS_LANDSCAPE = VIEWPORT_WIDTH >= VIEWPORT_HEIGHT;

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

function withSyntheticAudit(url) {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set('synthetic_audit', '1');
    return nextUrl.toString();
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

async function ensureApiReachable(baseUrl) {
    try {
        const healthResponse = await fetch(`${baseUrl}/api/health`, {
            headers: { accept: 'application/json' },
        });
        if (!healthResponse.ok) {
            throw new Error(`GET /api/health returned HTTP ${healthResponse.status}`);
        }

        const healthPayload = await healthResponse.json();
        if (healthPayload?.service !== 'aquita-api' || healthPayload?.status !== 'ok') {
            throw new Error('GET /api/health did not return the AquiTa API fingerprint');
        }

        const summaryResponse = await fetch(`${baseUrl}/api/observability/summary`, {
            headers: { accept: 'application/json' },
        });
        if (![401, 403].includes(summaryResponse.status)) {
            throw new Error(
                `GET /api/observability/summary returned HTTP ${summaryResponse.status}; expected protected route (401/403)`,
            );
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `API at ${baseUrl} is not the expected AquiTa target (${message}). Start the correct app first or point BRAVE_AUDIT_API_URL to a live environment.`,
        );
    }
}

async function ensureFrontendReachable(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/login`, {
            headers: { accept: 'text/html' },
        });
        if (!response.ok) {
            throw new Error(`GET /login returned HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
            throw new Error(`GET /login returned unexpected content-type ${contentType || 'unknown'}`);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Frontend at ${baseUrl} is not reachable (${message}). Start the target app first or point BRAVE_AUDIT_APP_URL to a live environment.`,
        );
    }
}

function assertActorRole(actor, expectedRole, label) {
    assert(
        actor.role === expectedRole,
        `${label} resolved with unexpected role ${String(actor.role || 'unknown')}; expected ${expectedRole}`,
    );
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
        || text.includes('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT')
        || text.includes('Default export is deprecated. Instead use `import { create } from \'zustand\'`.')
        || text.includes('`DialogContent` requires a `DialogTitle`')
        || text.includes('Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.')
    );
}

function isTransientFailure(report) {
    if (report.httpFailures.length > 0) {
        return false;
    }

    const failureTexts = report.networkFailures
        .map((entry) => String(entry.errorText ?? '').trim())
        .filter(Boolean);

    if (failureTexts.length === 0) {
        return false;
    }

    return failureTexts.every((text) => (
        text === 'net::ERR_FAILED'
        || text === 'net::ERR_NAME_NOT_RESOLVED'
        || text === 'net::ERR_CONNECTION_CLOSED'
        || text === 'net::ERR_CONNECTION_RESET'
        || text === 'net::ERR_ABORTED'
    ));
}

function toSlug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function firstEnv(...keys) {
    for (const key of keys) {
        const value = process.env[key]?.trim();
        if (value) {
            return value;
        }
    }
    return null;
}

async function resolveVercelExtensionPath() {
    const configuredPath = process.env.VERCEL_EXTENSION_PATH?.trim();
    if (configuredPath) {
        return existsSync(configuredPath) ? configuredPath : null;
    }

    if (!existsSync(VERCEL_EXTENSION_ROOT)) {
        return null;
    }

    const candidates = await readdir(VERCEL_EXTENSION_ROOT, { withFileTypes: true });
    const versions = candidates
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));

    if (versions.length === 0) {
        return null;
    }

    return path.join(VERCEL_EXTENSION_ROOT, versions[0]);
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

    const email = options.email ?? `${label}.${runId}@example.com`;
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

async function tryLoginActor(apiBaseUrl, options) {
    const { email, password, label } = options;
    const loginResponse = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
            email,
            password,
        },
    });

    if (loginResponse.status === 200) {
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

    if ([400, 401, 403, 404].includes(loginResponse.status)) {
        return null;
    }

    throw new Error(
        `POST /api/auth/login (${label}) failed with HTTP ${loginResponse.status}. Response: ${formatResponsePayload(loginResponse)}`,
    );
}

async function loginActor(apiBaseUrl, options) {
    const { email, password, label } = options;
    const actor = await tryLoginActor(apiBaseUrl, { email, password, label });
    assert(actor, `${label} login rejected the provided credentials for ${email}`);
    return actor;
}

async function resolveOrCreateActor(apiBaseUrl, options) {
    const {
        runId,
        label,
        role,
        name,
        phone,
        defaultEmail,
        defaultPassword = DEFAULT_SMOKE_PASSWORD,
        email,
        password,
    } = options;

    assert(
        Boolean(email) === Boolean(password),
        `${label} role audit requires both email and password when one is configured`,
    );

    if (email && password) {
        const actor = await loginActor(apiBaseUrl, { email, password, label });
        assertActorRole(actor, role, label);
        return actor;
    }

    const existingActor = await tryLoginActor(apiBaseUrl, {
        email: defaultEmail,
        password: defaultPassword,
        label,
    });
    if (existingActor) {
        assertActorRole(existingActor, role, label);
        return existingActor;
    }

    const registeredActor = await registerActor(apiBaseUrl, {
        runId,
        label,
        role,
        name,
        phone,
        password: defaultPassword,
        email: defaultEmail,
    });
    assertActorRole(registeredActor, role, label);
    return registeredActor;
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
    const email = firstEnv('BRAVE_AUDIT_ADMIN_EMAIL', 'SMOKE_PROD_ADMIN_EMAIL');
    const password = firstEnv('BRAVE_AUDIT_ADMIN_PASSWORD', 'SMOKE_PROD_ADMIN_PASSWORD');

    assert(
        Boolean(email) === Boolean(password),
        'admin role audit requires both email and password when one is configured',
    );

    if (email && password) {
        const actor = await loginActor(apiBaseUrl, {
            email,
            password,
            label: 'admin',
        });
        assertActorRole(actor, 'ADMIN', 'admin');
        return actor;
    }

    if (isLocalApiBaseUrl(apiBaseUrl)) {
        const actor = await loginActor(apiBaseUrl, {
            email: LOCAL_ADMIN_EMAIL,
            password: LOCAL_ADMIN_PASSWORD,
            label: 'admin',
        });
        assertActorRole(actor, 'ADMIN', 'admin');
        return actor;
    }

    const actor = await loginActor(apiBaseUrl, {
        email: DEFAULT_REMOTE_SMOKE_ADMIN_EMAIL,
        password: DEFAULT_REMOTE_SMOKE_ADMIN_PASSWORD,
        label: 'admin',
    });
    assertActorRole(actor, 'ADMIN', 'admin');
    return actor;
}

async function resolveUserActor(apiBaseUrl, runId) {
    const email = firstEnv('BRAVE_AUDIT_USER_EMAIL', 'SMOKE_PROD_USER_EMAIL');
    const password = firstEnv('BRAVE_AUDIT_USER_PASSWORD', 'SMOKE_PROD_USER_PASSWORD');

    return resolveOrCreateActor(apiBaseUrl, {
        runId,
        label: 'customer',
        role: 'USER',
        name: 'Role Audit Customer',
        phone: '+18095550021',
        email,
        password,
        defaultEmail: DEFAULT_REMOTE_SMOKE_USER_EMAIL,
    });
}

async function resolveOwnerActor(apiBaseUrl, runId) {
    const email = firstEnv('BRAVE_AUDIT_OWNER_EMAIL', 'SMOKE_PROD_OWNER_EMAIL', 'SMOKE_PROD_BUSINESS_OWNER_EMAIL');
    const password = firstEnv('BRAVE_AUDIT_OWNER_PASSWORD', 'SMOKE_PROD_OWNER_PASSWORD', 'SMOKE_PROD_BUSINESS_OWNER_PASSWORD');

    return resolveOrCreateActor(apiBaseUrl, {
        runId,
        label: 'owner',
        role: 'BUSINESS_OWNER',
        name: 'Role Audit Owner',
        phone: '+18095550022',
        email,
        password,
        defaultEmail: DEFAULT_REMOTE_SMOKE_OWNER_EMAIL,
    });
}

async function listOrganizations(apiBaseUrl, actor) {
    const response = await request(apiBaseUrl, '/api/organizations/mine', {
        token: actor.accessToken,
    });
    assertStatus(response, [200], 'GET /api/organizations/mine');
    const organizations = Array.isArray(response.json)
        ? response.json
        : Array.isArray(response.json?.data)
            ? response.json.data
            : [];
    return organizations;
}

async function resolveOwnerOrganizationId(apiBaseUrl, owner) {
    const explicitOrganizationId = firstEnv(
        'BRAVE_AUDIT_OWNER_ORGANIZATION_ID',
        'SMOKE_PROD_OWNER_ORGANIZATION_ID',
    );
    if (explicitOrganizationId) {
        return explicitOrganizationId;
    }

    const organizations = await listOrganizations(apiBaseUrl, owner);
    return organizations[0]?.id ?? null;
}

async function resolveOwnerBusinessId(apiBaseUrl, owner, organizationId) {
    const explicitBusinessId = firstEnv('BRAVE_AUDIT_OWNER_BUSINESS_ID');
    if (explicitBusinessId) {
        return explicitBusinessId;
    }
    if (!organizationId) {
        return null;
    }

    const response = await request(apiBaseUrl, '/api/businesses/my?limit=1', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(response, [200], 'GET /api/businesses/my?limit=1');

    const businesses = Array.isArray(response.json?.data)
        ? response.json.data
        : Array.isArray(response.json)
            ? response.json
            : [];
    return businesses[0]?.id ?? null;
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
            if (code === 'EBUSY' || code === 'EPERM') {
                console.warn(`Skipping Brave profile cleanup for ${targetPath} after repeated ${code} errors.`);
                return;
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
    const httpFailures = [];
    const requestUrls = new Map();

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
        if (params.type === 'Ping' && params.errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
            return;
        }
        networkFailures.push({
            type: params.type,
            errorText: params.errorText,
            canceled: params.canceled,
            url: requestUrls.get(params.requestId) || '',
        });
    });
    client.on('Network.requestWillBeSent', (params) => {
        if (params.requestId && params.request?.url) {
            requestUrls.set(params.requestId, params.request.url);
        }
    });
    client.on('Network.responseReceived', (params) => {
        const status = Number(params.response?.status ?? 0);
        if (status < 400) {
            return;
        }

        const url = params.response?.url || requestUrls.get(params.requestId) || '';
        httpFailures.push({
            url,
            status,
            type: params.type,
            mimeType: params.response?.mimeType ?? '',
        });
    });

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    await client.send('Log.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: VIEWPORT_SCALE,
        mobile: VIEWPORT_MOBILE,
        screenOrientation: {
            type: VIEWPORT_IS_LANDSCAPE ? 'landscapePrimary' : 'portraitPrimary',
            angle: VIEWPORT_IS_LANDSCAPE ? 90 : 0,
        },
    });
    await client.send('Emulation.setTouchEmulationEnabled', {
        enabled: VIEWPORT_MOBILE,
        maxTouchPoints: VIEWPORT_MOBILE ? 5 : 1,
    });
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
        httpFailures,
        screenshotPath,
    };
}

async function run() {
    const apiBaseUrl = normalizeBaseUrl(
        firstEnv('BRAVE_AUDIT_API_URL', 'SMOKE_PROD_API_BASE_URL'),
        DEFAULT_API_BASE_URL,
    );
    const appBaseUrl = normalizeBaseUrl(
        firstEnv('BRAVE_AUDIT_APP_URL', 'SMOKE_PROD_WEB_BASE_URL'),
        DEFAULT_APP_BASE_URL,
    );
    const runId = randomUUID().slice(0, 8);

    console.log(`Running Brave role audit against ${appBaseUrl} (api=${apiBaseUrl}, run=${runId})`);
    await ensureApiReachable(apiBaseUrl);
    await ensureFrontendReachable(appBaseUrl);
    const customer = await resolveUserActor(apiBaseUrl, runId);
    const owner = await resolveOwnerActor(apiBaseUrl, runId);
    const admin = await resolveAdminActor(apiBaseUrl);
    let organizationId = null;
    let businessId = null;

    if (owner) {
        organizationId = await resolveOwnerOrganizationId(apiBaseUrl, owner);
        if (!organizationId) {
            organizationId = await createOrganization(apiBaseUrl, owner, runId);
        }

        businessId = await resolveOwnerBusinessId(apiBaseUrl, owner, organizationId);
        if (!businessId) {
            const catalog = await loadCatalog(apiBaseUrl);
            businessId = await createBusiness(apiBaseUrl, owner, organizationId, catalog, runId);
            await verifyBusinessIfAdminAvailable(apiBaseUrl, admin, businessId);
        }
    }

    const scenarios = [
        ...(customer ? [
            {
                label: 'customer-profile',
                role: 'USER',
                url: withSyntheticAudit(`${appBaseUrl}/profile`),
                session: {
                    accessToken: customer.accessToken,
                    user: customer.user,
                    activeOrganizationId: null,
                },
            },
            {
                label: 'customer-dashboard',
                role: 'USER',
                url: withSyntheticAudit(`${appBaseUrl}/app/customer`),
                session: {
                    accessToken: customer.accessToken,
                    user: customer.user,
                    activeOrganizationId: null,
                },
            },
        ] : []),
        ...(owner ? [
            {
                label: 'owner-profile',
                role: 'BUSINESS_OWNER',
                url: withSyntheticAudit(`${appBaseUrl}/profile`),
                session: {
                    accessToken: owner.accessToken,
                    user: owner.user,
                    activeOrganizationId: organizationId,
                },
            },
            {
                label: 'owner-dashboard',
                role: 'BUSINESS_OWNER',
                url: withSyntheticAudit(`${appBaseUrl}/dashboard`),
                session: {
                    accessToken: owner.accessToken,
                    user: owner.user,
                    activeOrganizationId: organizationId,
                },
            },
            {
                label: 'owner-billing',
                role: 'BUSINESS_OWNER',
                url: withSyntheticAudit(`${appBaseUrl}/dashboard?workspace=billing`),
                session: {
                    accessToken: owner.accessToken,
                    user: owner.user,
                    activeOrganizationId: organizationId,
                },
            },
            {
                label: 'owner-register-business',
                role: 'BUSINESS_OWNER',
                url: withSyntheticAudit(`${appBaseUrl}/register-business`),
                session: {
                    accessToken: owner.accessToken,
                    user: owner.user,
                    activeOrganizationId: organizationId,
                },
            },
            ...(businessId ? [{
                label: 'owner-edit-business',
                role: 'BUSINESS_OWNER',
                url: withSyntheticAudit(`${appBaseUrl}/dashboard/businesses/${businessId}/edit`),
                session: {
                    accessToken: owner.accessToken,
                    user: owner.user,
                    activeOrganizationId: organizationId,
                },
            }] : []),
        ] : []),
    ];

    if (admin) {
        scenarios.push(
            {
                label: 'admin-profile',
                role: 'ADMIN',
                url: withSyntheticAudit(`${appBaseUrl}/profile`),
                session: {
                    accessToken: admin.accessToken,
                    user: admin.user,
                    activeOrganizationId: null,
                },
            },
            {
                label: 'admin-dashboard',
                role: 'ADMIN',
                url: withSyntheticAudit(`${appBaseUrl}/admin`),
                session: {
                    accessToken: admin.accessToken,
                    user: admin.user,
                    activeOrganizationId: null,
                },
            },
            {
                label: 'admin-security',
                role: 'ADMIN',
                url: withSyntheticAudit(`${appBaseUrl}/security`),
                session: {
                    accessToken: admin.accessToken,
                    user: admin.user,
                    activeOrganizationId: null,
                },
            },
        );
    }

    assert(scenarios.length > 0, 'Brave role audit has no runnable scenarios. Configure .env.smoke.local or BRAVE_AUDIT_* credentials.');

    const profileDir = await mkdtemp(path.join(tmpdir(), 'aquita-brave-role-profile-'));
    const outputDir = path.join(process.cwd(), 'output', 'brave-role-audit');
    await mkdir(outputDir, { recursive: true });

    const baseUrl = `http://127.0.0.1:${DEBUG_PORT}`;
    const resolvedExtensionPath = await resolveVercelExtensionPath();
    if (!resolvedExtensionPath) {
        console.warn('Vercel Toolbar extension path was not found; continuing without the extension.');
    }

    const braveArgs = [
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${profileDir}`,
        'about:blank',
    ];

    if (resolvedExtensionPath) {
        braveArgs.splice(
            braveArgs.length - 1,
            0,
            `--disable-extensions-except=${resolvedExtensionPath}`,
            `--load-extension=${resolvedExtensionPath}`,
        );
    }

    const brave = spawn(BRAVE_PATH, braveArgs, {
        stdio: 'ignore',
        detached: process.platform !== 'win32',
        windowsHide: false,
    });

    try {
        await waitForDebugger(baseUrl);
        const reports = [];
        for (const scenario of scenarios) {
            console.log(`Auditing ${scenario.label} -> ${scenario.url}`);
            let report = await auditScenario(baseUrl, scenario, outputDir);
            if (isTransientFailure(report)) {
                console.warn(`Transient network failure detected in ${scenario.label}; retrying once`);
                await delay(1_500);
                report = await auditScenario(baseUrl, scenario, outputDir);
            }
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
                httpFailures: report.httpFailures.length,
            }));
        }

        const outputPath = path.join(outputDir, `report-${runId}.json`);
        await writeFile(outputPath, JSON.stringify(reports, null, 2));

        const failingReports = reports.filter((report) =>
            (report.metrics.cls ?? 0) > 0.01
            || report.metrics.overflowX
            || report.pageErrors.length > 0
            || report.networkFailures.length > 0
            || report.httpFailures.length > 0
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
