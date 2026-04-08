import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

type SpawnOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
};

const isWindows = process.platform === 'win32';
const prismaExecutableName = isWindows ? 'prisma.cmd' : 'prisma';
const appRoot = resolve(__dirname, '..', '..');
const workspaceRoot = resolve(appRoot, '..', '..');
const prismaSchemaPath = resolve(appRoot, 'prisma', 'schema.prisma');
const prismaExecutableCandidates = [
    resolve(appRoot, 'node_modules', '.bin', prismaExecutableName),
    resolve(workspaceRoot, 'node_modules', '.bin', prismaExecutableName),
];

function log(message: string): void {
    process.stdout.write(`[migrate:on-start] ${message}\n`);
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
    if (process.env['PRISMA_MIGRATE_BOOTSTRAPPED'] === '1') {
        return false;
    }

    const rawValue = process.env['PRISMA_MIGRATE_ON_START']?.trim().toLowerCase();
    if (rawValue === 'false') {
        return false;
    }

    if (rawValue === 'true') {
        return true;
    }

    return process.env.NODE_ENV === 'production';
}

function resolvePrismaExecutable(): string | null {
    return prismaExecutableCandidates.find((candidate) => existsSync(candidate)) ?? null;
}

export async function runMigrationsIfAvailable(): Promise<void> {
    if (!shouldAttemptMigrateOnStart()) {
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
    process.env['PRISMA_MIGRATE_BOOTSTRAPPED'] = '1';
    log('Migraciones aplicadas o ya alineadas.');
}
