import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import path from 'node:path';

const rootDir = process.cwd();
const composeFile = path.join(rootDir, 'docker', 'docker-compose.test.yml');
const pnpmExecutable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const dbPort = Number(process.env.QA_DB_PORT ?? '55432');
const redisPort = Number(process.env.QA_REDIS_PORT ?? '56379');
const apiPort = Number(process.env.QA_API_PORT ?? '3300');
const webPort = Number(process.env.QA_WEB_PORT ?? '4173');
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const composeEnv = {
    ...process.env,
    COMPOSE_PROJECT_NAME: process.env.COMPOSE_PROJECT_NAME ?? 'aquitaqa',
    QA_DB_PORT: String(dbPort),
    QA_REDIS_PORT: String(redisPort),
};
const qaEnv = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? `postgresql://aquita:aquita123@127.0.0.1:${dbPort}/aquita_test`,
    REDIS_URL: process.env.REDIS_URL ?? `redis://127.0.0.1:${redisPort}`,
    JWT_SECRET: process.env.JWT_SECRET ?? 'qa-super-secret-key-at-least-16',
    PORT: String(apiPort),
    NODE_ENV: process.env.NODE_ENV ?? 'test',
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? webBaseUrl,
    APP_PUBLIC_WEB_URL: process.env.APP_PUBLIC_WEB_URL ?? webBaseUrl,
    AUTH_REFRESH_COOKIE_SAMESITE: process.env.AUTH_REFRESH_COOKIE_SAMESITE ?? 'lax',
    AUTH_REFRESH_COOKIE_SECURE: process.env.AUTH_REFRESH_COOKIE_SECURE ?? 'false',
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? webBaseUrl,
    PLAYWRIGHT_API_URL: process.env.PLAYWRIGHT_API_URL ?? apiBaseUrl,
    LIGHTHOUSE_BASE_URL: process.env.LIGHTHOUSE_BASE_URL ?? webBaseUrl,
};

const longRunningChildren = [];
let shuttingDown = false;

function resolveCommand(command) {
    if (command === 'pnpm') {
        return pnpmExecutable;
    }

    return command;
}

function spawnProcess(command, args, options = {}) {
    if (command === 'pnpm' && process.env.npm_execpath) {
        return spawn(process.execPath, [process.env.npm_execpath, ...args], {
            cwd: rootDir,
            env: options.env ?? process.env,
            stdio: options.stdio ?? 'inherit',
            shell: options.shell ?? false,
        });
    }

    if (command === 'pnpm' && process.platform === 'win32') {
        return spawn(process.env.comspec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], {
            cwd: rootDir,
            env: options.env ?? process.env,
            stdio: options.stdio ?? 'inherit',
            shell: false,
        });
    }

    const resolvedCommand = resolveCommand(command);
    const useShell = options.shell ?? false;

    return spawn(resolvedCommand, args, {
        cwd: rootDir,
        env: options.env ?? process.env,
        stdio: options.stdio ?? 'inherit',
        shell: useShell,
    });
}

async function terminateChild(child) {
    if (!child || child.killed) {
        return;
    }

    if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            cwd: rootDir,
            stdio: 'ignore',
            shell: false,
        });
        await waitForExit(killer, 'taskkill').catch(() => undefined);
        return;
    }

    child.kill('SIGTERM');
    await Promise.race([
        waitForExit(child, 'background process').catch(() => undefined),
        delay(4_000).then(() => {
            if (!child.killed) {
                child.kill('SIGKILL');
            }
        }),
    ]);
}

function waitForExit(child, description) {
    return new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`${description} terminated by signal ${signal}`));
                return;
            }

            if ((code ?? 1) !== 0) {
                reject(new Error(`${description} failed with exit code ${code ?? 1}`));
                return;
            }

            resolve();
        });
    });
}

async function run(command, args, description, env = qaEnv) {
    const child = spawnProcess(command, args, { env });
    await waitForExit(child, description);
}

async function waitForHttp(url, validate, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = 'unknown error';

    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                if (!validate) {
                    return;
                }

                const contentType = response.headers.get('content-type') ?? '';
                if (contentType.includes('application/json')) {
                    const payload = await response.json();
                    if (validate(payload, response)) {
                        return;
                    }
                    lastError = `Unexpected payload for ${url}: ${JSON.stringify(payload)}`;
                } else {
                    const text = await response.text();
                    if (validate(text, response)) {
                        return;
                    }
                    lastError = `Unexpected body for ${url}: ${text.slice(0, 180)}`;
                }
            } else {
                lastError = `HTTP ${response.status} from ${url}`;
            }
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }

        await delay(1_000);
    }

    throw new Error(`Timeout waiting for ${url}. Last error: ${lastError}`);
}

async function cleanup() {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    while (longRunningChildren.length > 0) {
        const child = longRunningChildren.pop();
        if (!child) {
            continue;
        }

        await terminateChild(child);
    }

    await run(
        'docker',
        ['compose', '-f', composeFile, 'down', '-v', '--remove-orphans'],
        'docker compose down',
        composeEnv,
    ).catch(() => undefined);
}

process.on('SIGINT', async () => {
    await cleanup();
    process.exit(130);
});

process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(143);
});

async function main() {
    const args = process.argv.slice(2);
    const separatorIndex = args.indexOf('--');
    const commandArgs = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;

    if (commandArgs.length === 0) {
        throw new Error('Usage: node scripts/run-with-qa-stack.mjs -- <command> [args...]');
    }

    await run(
        'docker',
        ['compose', '-f', composeFile, 'down', '-v', '--remove-orphans'],
        'docker compose down',
        composeEnv,
    ).catch(() => undefined);
    await run(
        'docker',
        ['compose', '-f', composeFile, 'up', '-d', '--wait'],
        'docker compose up',
        composeEnv,
    );

    await run('pnpm', ['db:generate'], 'pnpm db:generate');
    await run('pnpm', ['--filter', '@aquita/api', 'prisma:migrate:deploy'], 'pnpm prisma:migrate:deploy');
    await run('pnpm', ['--filter', '@aquita/api', 'prisma:seed'], 'pnpm prisma:seed');
    await run('pnpm', ['build:api'], 'pnpm build:api');
    await run(
        'pnpm',
        ['build:web'],
        'pnpm build:web',
        {
            ...qaEnv,
            VITE_API_URL: apiBaseUrl,
        },
    );

    const [command, ...commandRest] = commandArgs;
    const requiresChromePath = !qaEnv.CHROME_PATH
        && commandArgs.some((part) => part === 'lhci' || part.includes('lighthouse'));

    if (requiresChromePath) {
        const { chromium } = await import('@playwright/test');
        qaEnv.CHROME_PATH = chromium.executablePath();
    }

    const apiProcess = spawnProcess('pnpm', ['--filter', '@aquita/api', 'exec', 'node', 'dist/main.js'], {
        env: qaEnv,
    });
    longRunningChildren.push(apiProcess);
    await waitForHttp(`${apiBaseUrl}/api/health/ready`, (payload) =>
        payload?.status === 'ok' && payload?.checks?.database === 'up' && payload?.checks?.schema === 'up',
    );

    const webProcess = spawnProcess('pnpm', ['--filter', '@aquita/web', 'preview', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
        env: {
            ...qaEnv,
            VITE_API_URL: apiBaseUrl,
        },
    });
    longRunningChildren.push(webProcess);
    await waitForHttp(webBaseUrl, (_body, response) => response.ok);

    const runner = spawnProcess(command, commandRest, {
        env: qaEnv,
    });
    const exitCode = await new Promise((resolve, reject) => {
        runner.once('error', reject);
        runner.once('exit', (code, signal) => {
            if (signal) {
                reject(new Error(`QA command terminated by signal ${signal}`));
                return;
            }
            resolve(code ?? 1);
        });
    });

    await cleanup();
    process.exit(Number(exitCode));
}

main().catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[qa-stack] ${message}\n`);
    await cleanup();
    process.exit(1);
});
