type EnvRecord = Record<string, unknown>;

function assertPositiveInteger(config: EnvRecord, key: string): void {
    if (config[key] === undefined) {
        return;
    }

    const parsedValue = Number(config[key]);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        throw new Error(`${key} must be a positive integer`);
    }
}

function assertNonEmptyString(config: EnvRecord, key: string): void {
    if (config[key] === undefined) {
        return;
    }

    const value = String(config[key]).trim();
    if (value.length === 0) {
        throw new Error(`${key} must not be empty`);
    }
}

function assertValidUrl(
    config: EnvRecord,
    key: string,
    allowedProtocols?: string[],
): void {
    if (config[key] === undefined) {
        return;
    }

    const value = String(config[key]).trim();
    if (value.length === 0) {
        throw new Error(`${key} must not be empty`);
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`${key} must be a valid URL`);
    }

    if (allowedProtocols && !allowedProtocols.includes(parsed.protocol)) {
        throw new Error(`${key} must use one of: ${allowedProtocols.join(', ')}`);
    }
}

function assertBooleanLike(config: EnvRecord, key: string): void {
    if (config[key] === undefined) {
        return;
    }

    const value = String(config[key]).trim().toLowerCase();
    if (!['1', '0', 'true', 'false'].includes(value)) {
        throw new Error(`${key} must be a boolean-like value (true/false/1/0)`);
    }
}

function assertRangeNumber(
    config: EnvRecord,
    key: string,
    min: number,
    max: number,
): void {
    if (config[key] === undefined) {
        return;
    }

    const value = Number(config[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new Error(`${key} must be a number between ${min} and ${max}`);
    }
}

export function validateEnv(config: EnvRecord): EnvRecord {
    const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];

    for (const key of requiredVars) {
        const value = config[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }

    const jwtSecret = String(config.JWT_SECRET);
    if (jwtSecret.length < 16) {
        throw new Error('JWT_SECRET must be at least 16 characters long');
    }

    if (config.JWT_REFRESH_SECRET !== undefined) {
        const refreshSecret = String(config.JWT_REFRESH_SECRET);
        if (refreshSecret.length < 16) {
            throw new Error('JWT_REFRESH_SECRET must be at least 16 characters long');
        }
    }

    if (config.JWT_REFRESH_TTL_DAYS !== undefined) {
        assertPositiveInteger(config, 'JWT_REFRESH_TTL_DAYS');
    }

    assertPositiveInteger(config, 'PORT');
    assertPositiveInteger(config, 'THROTTLE_TTL_MS');
    assertPositiveInteger(config, 'THROTTLE_LIMIT');
    assertPositiveInteger(config, 'REDIS_CACHE_TTL_SECONDS');
    assertPositiveInteger(config, 'CIRCUIT_BREAKER_FAILURE_THRESHOLD');
    assertPositiveInteger(config, 'CIRCUIT_BREAKER_COOLDOWN_MS');

    assertValidUrl(config, 'REDIS_URL', ['redis:', 'rediss:']);
    assertValidUrl(config, 'MEILISEARCH_HOST', ['http:', 'https:']);

    assertNonEmptyString(config, 'MEILISEARCH_API_KEY');
    assertNonEmptyString(config, 'MEILISEARCH_INDEX_BUSINESSES');
    assertBooleanLike(config, 'JSON_API_RESPONSE_ENABLED');

    assertValidUrl(config, 'SENTRY_DSN', ['http:', 'https:']);
    assertNonEmptyString(config, 'SENTRY_ENVIRONMENT');
    assertRangeNumber(config, 'SENTRY_TRACES_SAMPLE_RATE', 0, 1);

    return config;
}
