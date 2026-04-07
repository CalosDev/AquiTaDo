import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

type SpawnOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
};

const appRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(appRoot, '..', '..');
const isWindows = process.platform === 'win32';
const prismaExecutableName = isWindows ? 'prisma.cmd' : 'prisma';
const prismaSchemaPath = resolve(appRoot, 'prisma', 'schema.prisma');
const prismaExecutableCandidates = [
    resolve(appRoot, 'node_modules', '.bin', prismaExecutableName),
    resolve(workspaceRoot, 'node_modules', '.bin', prismaExecutableName),
];

function log(message: string): void {
    process.stdout.write(`[start:prod] ${message}\n`);
}

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

function shouldAttemptMigrateOnStart(): boolean {
    const rawValue = process.env['PRISMA_MIGRATE_ON_START']?.trim().toLowerCase();
    return rawValue !== 'false';
}

function resolvePrismaExecutable(): string | null {
    return prismaExecutableCandidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function runMigrationsIfAvailable(): Promise<void> {
    if (!shouldAttemptMigrateOnStart()) {
        log('Saltando migrate deploy porque PRISMA_MIGRATE_ON_START=false.');
        return;
    }

    if (!process.env['DATABASE_URL']) {
        log('Saltando migrate deploy porque DATABASE_URL no esta configurada.');
        return;
    }

    if (!existsSync(prismaSchemaPath)) {
        log('Saltando migrate deploy porque no existe prisma/schema.prisma en este runtime.');
        return;
    }

    const prismaExecutable = resolvePrismaExecutable();

    if (!prismaExecutable) {
        log('Saltando migrate deploy porque Prisma CLI no esta disponible en este runtime.');
        return;
    }

    log('Ejecutando prisma migrate deploy antes de levantar la API...');
    await spawnAndWait(
        prismaExecutable,
        ['migrate', 'deploy', '--schema', prismaSchemaPath],
        {
            cwd: appRoot,
            env: process.env,
        },
    );
    log('Migraciones aplicadas o ya alineadas.');
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
