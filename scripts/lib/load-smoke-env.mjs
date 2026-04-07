import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function parseEnvValue(rawValue) {
    const trimmed = rawValue.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function applyEnvFile(filePath) {
    if (!existsSync(filePath)) {
        return false;
    }

    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }

        const separatorIndex = line.indexOf('=');
        if (separatorIndex < 1) {
            continue;
        }

        const key = line.slice(0, separatorIndex).trim();
        if (!key || key.startsWith('#') || process.env[key] !== undefined) {
            continue;
        }

        process.env[key] = parseEnvValue(line.slice(separatorIndex + 1));
    }

    return true;
}

export function loadOptionalSmokeEnv(cwd = process.cwd()) {
    const candidates = [
        path.join(cwd, '.env.smoke.local'),
        path.join(cwd, '.env.smoke'),
    ];

    const loaded = [];
    for (const candidate of candidates) {
        if (applyEnvFile(candidate)) {
            loaded.push(candidate);
        }
    }

    return loaded;
}
