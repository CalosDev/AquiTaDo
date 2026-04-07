import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

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
const DEBUG_PORT = Number(process.env.BRAVE_DEBUG_PORT ?? '9223');
const DEFAULT_URLS = [
    'https://aquitado.vercel.app/',
    'https://aquitado.vercel.app/login',
    'https://aquitado.vercel.app/register',
    'https://aquitado.vercel.app/forgot-password',
    'https://aquitado.vercel.app/businesses',
    'https://aquitado.vercel.app/businesses/supermercado-bravo',
];

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

class CdpClient {
    constructor(wsUrl) {
        this.socket = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.handlers = new Map();
        this.events = [];
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
                this.events.push(payload);
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

async function auditPage(baseUrl, url, outputDir) {
    const target = await createTarget(baseUrl, url);
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();

    const consoleMessages = [];
    const pageErrors = [];
    const networkFailures = [];

    client.on('Runtime.consoleAPICalled', (params) => {
        const args = (params.args ?? []).map((entry) => entry.value ?? entry.description ?? '');
        consoleMessages.push({
            type: params.type,
            text: args.join(' '),
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
            text: entry.text ?? '',
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

    let loadFired = false;
    client.on('Page.loadEventFired', () => {
        loadFired = true;
    });

    await client.send('Page.navigate', { url });
    const startedAt = Date.now();
    while (!loadFired && Date.now() - startedAt < 25_000) {
        await delay(100);
    }
    await delay(2_500);

    const evaluation = await client.send('Runtime.evaluate', {
        expression: `(() => {
            const shifts = window.__AQUITA_LAYOUT_SHIFTS__ || [];
            const cls = shifts.reduce((total, shift) => total + (shift.value || 0), 0);
            return JSON.stringify({
                title: document.title,
                pathname: location.pathname,
                cls,
                shiftCount: shifts.length,
                shifts: shifts.slice(0, 10),
                bodyClassName: document.body.className,
                htmlClassName: document.documentElement.className,
                scrollHeight: document.documentElement.scrollHeight,
                viewportHeight: window.innerHeight,
                footerCount: document.querySelectorAll('footer').length,
                navCount: document.querySelectorAll('nav').length,
            });
        })()`,
        returnByValue: true,
    });
    const metrics = JSON.parse(evaluation.result.value);

    const fileSafeName = url
        .replace(/^https?:\/\//, '')
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
    });
    const screenshotPath = path.join(outputDir, `${fileSafeName}.png`);
    await writeFile(screenshotPath, screenshot.data, 'base64');

    await client.close();
    await fetch(`${baseUrl}/json/close/${target.id}`).catch(() => {});

    return {
        url,
        screenshotPath,
        metrics,
        consoleMessages,
        pageErrors,
        networkFailures,
    };
}

async function main() {
    const urls = process.argv.slice(2);
    const auditUrls = urls.length > 0 ? urls : DEFAULT_URLS;
    const tempProfileDir = await mkdtemp(path.join(tmpdir(), 'aquita-brave-'));
    const outputDir = path.join(process.cwd(), 'output', 'brave-audit');
    await mkdir(outputDir, { recursive: true });

    const brave = spawn(BRAVE_PATH, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${tempProfileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        `--disable-extensions-except=${VERCEL_EXTENSION_PATH}`,
        `--load-extension=${VERCEL_EXTENSION_PATH}`,
        'about:blank',
    ], {
        stdio: 'ignore',
        detached: true,
    });
    brave.unref();

    const baseUrl = `http://127.0.0.1:${DEBUG_PORT}`;
    try {
        await waitForDebugger(baseUrl);
        const reports = [];
        for (const url of auditUrls) {
            reports.push(await auditPage(baseUrl, url, outputDir));
        }
        const reportPath = path.join(outputDir, 'report.json');
        await writeFile(reportPath, JSON.stringify(reports, null, 2));
        console.log(JSON.stringify({
            reportPath,
            reports: reports.map((report) => ({
                url: report.url,
                screenshotPath: report.screenshotPath,
                cls: report.metrics.cls,
                shiftCount: report.metrics.shiftCount,
                consoleMessages: report.consoleMessages.length,
                pageErrors: report.pageErrors.length,
                networkFailures: report.networkFailures.length,
            })),
        }, null, 2));
    } finally {
        await killProcessTree(brave.pid);
        await rm(tempProfileDir, { recursive: true, force: true }).catch(() => {});
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
