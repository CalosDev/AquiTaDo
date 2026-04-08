import { resolve } from 'path';
import { spawn } from 'child_process';
import { runMigrationsIfAvailable } from './bootstrap/migrate-on-start';

type SpawnOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
};

const appRoot = resolve(__dirname, '..');

function logError(message: string): void {
    process.stderr.write(`[start:prod] ${message}\n`);
}

function spawnAndWait(command: string, args: string[], options: SpawnOptions = {}): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: 'inherit',
        });

        child.once('error', (error) => {
            rejectPromise(error);
        });

        child.once('exit', (code, signal) => {
            if (signal) {
                rejectPromise(new Error(`El proceso "${command}" termino por la senal ${signal}`));
                return;
            }

            if ((code ?? 1) !== 0) {
                rejectPromise(new Error(`El proceso "${command}" termino con codigo ${code ?? 1}`));
                return;
            }

            resolvePromise();
        });
    });
}

async function startApi(): Promise<void> {
    const mainEntrypoint = resolve(__dirname, 'main.js');
    await spawnAndWait(process.execPath, [mainEntrypoint], {
        cwd: appRoot,
        env: process.env,
    });
}

async function bootstrap(): Promise<void> {
    await runMigrationsIfAvailable();
    await startApi();
}

void bootstrap().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    logError(`No fue posible iniciar la API: ${message}`);
    process.exit(1);
});
