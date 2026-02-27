import { createHash } from 'crypto';

type Serializable = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

function normalize(value: unknown): Serializable {
    if (value === null || value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => normalize(entry));
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, entryValue]) => entryValue !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entryValue]) => [key, normalize(entryValue)]);
        return Object.fromEntries(entries);
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }

    return String(value);
}

export function stableStringify(value: unknown): string {
    return JSON.stringify(normalize(value));
}

export function hashedCacheKey(prefix: string, value: unknown): string {
    const digest = createHash('sha256')
        .update(stableStringify(value))
        .digest('hex');
    return `${prefix}:${digest}`;
}
