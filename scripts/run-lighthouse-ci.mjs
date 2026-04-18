import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

const rootDir = process.cwd();
const runtimeDir = path.join(rootDir, 'output', 'lighthouse', 'runtime');
const profileDir = path.join(runtimeDir, 'chrome-profile');
const logsDir = path.join(runtimeDir, 'logs');
const tempDir = path.join(runtimeDir, 'tmp');

function spawnProcess(command, args, options = {}) {
    if (command === 'pnpm' && process.env.npm_execpath) {
        return spawn(process.execPath, [process.env.npm_execpath, ...args], {
            cwd: rootDir,
            env: options.env ?? process.env,
            stdio: options.stdio ?? 'inherit',
            shell: false,
            windowsHide: options.windowsHide ?? true,
            detached: options.detached ?? false,
        });
    }

    if (command === 'pnpm' && process.platform === 'win32') {
        return spawn(process.env.comspec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], {
            cwd: rootDir,
            env: options.env ?? process.env,
            stdio: options.stdio ?? 'inherit',
            shell: false,
            windowsHide: options.windowsHide ?? true,
            detached: options.detached ?? false,
        });
    }

    return spawn(command, args, {
        cwd: rootDir,
        env: options.env ?? process.env,
        stdio: options.stdio ?? 'inherit',
        shell: false,
        windowsHide: options.windowsHide ?? true,
        detached: options.detached ?? false,
    });
}

function waitForExit(child, description) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`${description} terminated by signal ${signal}`));
                return;
            }

            resolve(code ?? 1);
        });
    });
}

async function removePathWithRetries(targetPath, attempts = 8) {
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

async function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Unable to determine a free debugging port.')));
                return;
            }

            const port = address.port;
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(port);
            });
        });
    });
}

async function waitForDebugger(port, timeoutMs = 20_000) {
    const debuggerUrl = `http://127.0.0.1:${port}/json/version`;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const response = await fetch(debuggerUrl);
            if (response.ok) {
                return;
            }
        } catch {
            // Keep polling until Chrome is ready.
        }

        await delay(250);
    }

    throw new Error(`Timed out waiting for Chrome remote debugger on ${debuggerUrl}`);
}

async function killProcessTree(child) {
    if (!child || child.killed || !child.pid) {
        return;
    }

    if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            stdio: 'ignore',
            shell: false,
            windowsHide: true,
        });
        await waitForExit(killer, 'taskkill').catch(() => 0);
        return;
    }

    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch {
        // Ignore best-effort cleanup failures.
    }
}

async function resolveChromePath() {
    if (process.env.CHROME_PATH) {
        return process.env.CHROME_PATH;
    }

    const { chromium } = await import('@playwright/test');
    return chromium.executablePath();
}

async function prepareRuntimeDirs() {
    await mkdir(runtimeDir, { recursive: true });
    await removePathWithRetries(profileDir);
    await removePathWithRetries(logsDir);
    await removePathWithRetries(tempDir);
    await mkdir(path.join(profileDir, 'cache'), { recursive: true });
    await mkdir(logsDir, { recursive: true });
    await mkdir(tempDir, { recursive: true });
}

async function main() {
    const chromePath = await resolveChromePath();
    const debuggingPort = await reservePort();
    await prepareRuntimeDirs();
    const runHeadless = process.platform !== 'win32' || process.env.CI === 'true';

    const chromeOutLog = createWriteStream(path.join(logsDir, 'chrome-out.log'));
    const chromeErrLog = createWriteStream(path.join(logsDir, 'chrome-err.log'));
    const chromeEnv = {
        ...process.env,
        TMP: tempDir,
        TEMP: tempDir,
    };
    const chromeArgs = [
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${profileDir}`,
        `--disk-cache-dir=${path.join(profileDir, 'cache')}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-backgrounding-occluded-windows',
        '--disable-component-update',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-renderer-backgrounding',
        '--disable-features=CalculateNativeWinOcclusion',
        '--window-size=1440,1200',
        'about:blank',
    ];
    if (runHeadless) {
        chromeArgs.splice(3, 0, '--headless=new');
    }

    const chrome = spawn(chromePath, chromeArgs, {
        cwd: rootDir,
        env: chromeEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: runHeadless,
        detached: process.platform !== 'win32',
    });

    chrome.stdout?.pipe(chromeOutLog);
    chrome.stderr?.pipe(chromeErrLog);

    try {
        await waitForDebugger(debuggingPort);

        const lhciEnv = {
            ...process.env,
            CHROME_PATH: chromePath,
            TMP: tempDir,
            TEMP: tempDir,
        };
        const runner = spawnProcess('pnpm', [
            'exec',
            'lhci',
            'autorun',
            '--config=./lighthouse/lighthouserc.js',
            `--collect.settings.port=${debuggingPort}`,
        ], {
            env: lhciEnv,
        });

        const exitCode = await waitForExit(runner, 'lhci autorun');
        process.exit(exitCode);
    } finally {
        await killProcessTree(chrome);
        chromeOutLog.end();
        chromeErrLog.end();
        await delay(500);
        await removePathWithRetries(profileDir).catch(() => undefined);
        await removePathWithRetries(tempDir).catch(() => undefined);
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[lighthouse-ci] ${message}\n`);
    process.exit(1);
});
