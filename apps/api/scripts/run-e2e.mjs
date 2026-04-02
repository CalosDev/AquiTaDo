import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

function resolvePnpmExecutable() {
    return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function parseDatabaseTarget(databaseUrl) {
    try {
        const parsed = new URL(databaseUrl);
        const port = Number(parsed.port || '5432');
        if (!Number.isFinite(port) || port <= 0) {
            return null;
        }

        return {
            host: parsed.hostname,
            port,
        };
    } catch {
        return null;
    }
}

function ensureDatabaseReachable(host, port, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let finished = false;

        const cleanup = () => {
            socket.removeAllListeners();
            socket.destroy();
        };

        const done = (callback) => {
            if (finished) {
                return;
            }

            finished = true;
            cleanup();
            callback();
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => done(resolve));
        socket.once('timeout', () => done(() => reject(new Error(`Timeout connecting to ${host}:${port}`))));
        socket.once('error', (error) => done(() => reject(error)));
        socket.connect(port, host);
    });
}

function runVitestE2E() {
    const isWindows = process.platform === 'win32';
    const command = isWindows
        ? `${resolvePnpmExecutable()} exec vitest run --config vitest.e2e.config.ts`
        : resolvePnpmExecutable();
    const args = isWindows ? [] : ['exec', 'vitest', 'run', '--config', 'vitest.e2e.config.ts'];
    const child = spawn(command, args, {
        stdio: 'inherit',
        env: process.env,
        shell: isWindows,
    });

    child.on('exit', (code) => process.exit(code ?? 1));
}

function runPrismaMigrateDeploy() {
    return new Promise((resolve, reject) => {
        const isWindows = process.platform === 'win32';
        const command = isWindows
            ? `${resolvePnpmExecutable()} exec prisma migrate deploy`
            : resolvePnpmExecutable();
        const args = isWindows ? [] : ['exec', 'prisma', 'migrate', 'deploy'];
        const child = spawn(command, args, {
            stdio: 'inherit',
            env: process.env,
            shell: isWindows,
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`prisma migrate deploy failed with exit code ${code ?? 1}`));
        });
        child.on('error', reject);
    });
}

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const databaseUrl = process.env.DATABASE_URL_E2E || process.env.DATABASE_URL;
if (!databaseUrl) {
    // eslint-disable-next-line no-console
    console.error('[test:e2e] DATABASE_URL_E2E or DATABASE_URL is not configured. Configure apps/api/.env first.');
    process.exit(1);
}

const target = parseDatabaseTarget(databaseUrl);
if (!target) {
    // eslint-disable-next-line no-console
    console.error('[test:e2e] DATABASE_URL is invalid. Expected a valid postgresql:// URL.');
    process.exit(1);
}

try {
    await ensureDatabaseReachable(target.host, target.port);
} catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[test:e2e] Cannot reach database at ${target.host}:${target.port}.`);
    // eslint-disable-next-line no-console
    console.error('[test:e2e] Start PostgreSQL (example: docker compose up -d db) and retry.');
    // eslint-disable-next-line no-console
    console.error('[test:e2e] Optional: set DATABASE_URL_E2E to run tests against a separate remote Postgres database.');
    const details =
        error && typeof error === 'object'
            ? [error.code, error.message].filter(Boolean).join(' ')
            : String(error);
    // eslint-disable-next-line no-console
    console.error(`[test:e2e] Details: ${details || 'Unknown connection error'}`);
    process.exit(1);
}

try {
    await runPrismaMigrateDeploy();
} catch (error) {
    const details =
        error && typeof error === 'object'
            ? [error.code, error.message].filter(Boolean).join(' ')
            : String(error);
    // eslint-disable-next-line no-console
    console.error('[test:e2e] Failed to apply prisma migrate deploy before running tests.');
    // eslint-disable-next-line no-console
    console.error(`[test:e2e] Details: ${details || 'Unknown migration error'}`);
    process.exit(1);
}

runVitestE2E();
