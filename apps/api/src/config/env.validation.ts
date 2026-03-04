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

function assertInSet(config: EnvRecord, key: string, allowed: string[]): void {
    if (config[key] === undefined) {
        return;
    }

    const value = String(config[key]).trim().toLowerCase();
    if (!allowed.includes(value)) {
        throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
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
    if (config.JWT_REFRESH_TTL_ADMIN_DAYS !== undefined) {
        assertPositiveInteger(config, 'JWT_REFRESH_TTL_ADMIN_DAYS');
    }

    assertNonEmptyString(config, 'JWT_ACCESS_TTL_ADMIN');
    assertNonEmptyString(config, 'TOTP_ISSUER');
    assertNonEmptyString(config, 'AUTH_REFRESH_COOKIE_NAME');
    assertNonEmptyString(config, 'AUTH_REFRESH_COOKIE_PATH');
    assertBooleanLike(config, 'AUTH_REFRESH_COOKIE_SECURE');
    assertInSet(config, 'AUTH_REFRESH_COOKIE_SAMESITE', ['lax', 'strict', 'none']);
    assertInSet(config, 'STORAGE_PROVIDER', ['local', 's3']);
    assertBooleanLike(config, 'STORAGE_S3_FORCE_PATH_STYLE');
    assertValidUrl(config, 'STORAGE_S3_ENDPOINT', ['http:', 'https:']);
    assertValidUrl(config, 'STORAGE_PUBLIC_BASE_URL', ['http:', 'https:']);

    assertPositiveInteger(config, 'PORT');
    assertPositiveInteger(config, 'THROTTLE_TTL_MS');
    assertPositiveInteger(config, 'THROTTLE_LIMIT');
    assertPositiveInteger(config, 'REDIS_CACHE_TTL_SECONDS');
    assertPositiveInteger(config, 'BULLMQ_DEFAULT_ATTEMPTS');
    assertPositiveInteger(config, 'RATE_LIMIT_DEFAULT_WINDOW_SECONDS');
    assertPositiveInteger(config, 'RATE_LIMIT_DEFAULT_IP_LIMIT');
    assertPositiveInteger(config, 'RATE_LIMIT_DEFAULT_API_KEY_LIMIT');
    assertPositiveInteger(config, 'RATE_LIMIT_SEARCH_WINDOW_SECONDS');
    assertPositiveInteger(config, 'RATE_LIMIT_SEARCH_IP_LIMIT');
    assertPositiveInteger(config, 'RATE_LIMIT_SEARCH_API_KEY_LIMIT');
    assertPositiveInteger(config, 'RATE_LIMIT_AI_WINDOW_SECONDS');
    assertPositiveInteger(config, 'RATE_LIMIT_AI_IP_LIMIT');
    assertPositiveInteger(config, 'RATE_LIMIT_AI_API_KEY_LIMIT');
    assertPositiveInteger(config, 'HEALTH_AI_P95_MAX_MS');
    assertPositiveInteger(config, 'HEALTH_WHATSAPP_P95_MAX_MS');
    assertPositiveInteger(config, 'AI_EMBEDDING_DIMENSIONS');
    assertPositiveInteger(config, 'CIRCUIT_BREAKER_FAILURE_THRESHOLD');
    assertPositiveInteger(config, 'CIRCUIT_BREAKER_COOLDOWN_MS');

    assertInSet(config, 'AI_PROVIDER', ['auto', 'gemini', 'local']);
    assertValidUrl(config, 'APP_PUBLIC_WEB_URL', ['http:', 'https:']);
    assertValidUrl(config, 'REDIS_URL', ['redis:', 'rediss:']);
    assertValidUrl(config, 'GEMINI_BASE_URL', ['http:', 'https:']);
    assertValidUrl(config, 'GROQ_BASE_URL', ['http:', 'https:']);
    assertValidUrl(config, 'MEILISEARCH_HOST', ['http:', 'https:']);
    assertValidUrl(config, 'WHATSAPP_GRAPH_BASE_URL', ['http:', 'https:']);

    assertNonEmptyString(config, 'MEILISEARCH_API_KEY');
    assertNonEmptyString(config, 'MEILISEARCH_INDEX_BUSINESSES');
    assertNonEmptyString(config, 'BULLMQ_PREFIX');
    assertBooleanLike(config, 'SECURITY_TRUST_PROXY');
    assertBooleanLike(config, 'JSON_API_RESPONSE_ENABLED');
    assertBooleanLike(config, 'WHATSAPP_ENABLED');

    assertRangeNumber(config, 'HEALTH_DB_POOL_WARN_RATIO', 0.1, 1);
    assertRangeNumber(config, 'HEALTH_DB_POOL_CRITICAL_RATIO', 0.1, 1);

    const dbPoolWarn = Number(config.HEALTH_DB_POOL_WARN_RATIO ?? 0.75);
    const dbPoolCritical = Number(config.HEALTH_DB_POOL_CRITICAL_RATIO ?? 0.9);
    if (dbPoolCritical <= dbPoolWarn) {
        throw new Error('HEALTH_DB_POOL_CRITICAL_RATIO must be greater than HEALTH_DB_POOL_WARN_RATIO');
    }

    const aiProvider = String(config.AI_PROVIDER ?? 'auto').trim().toLowerCase();
    if (aiProvider === 'gemini') {
        const geminiApiKey = String(config.GEMINI_API_KEY ?? '').trim();
        if (geminiApiKey.length === 0) {
            throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
        }
    }

    const whatsappEnabled = String(config.WHATSAPP_ENABLED ?? 'false').trim().toLowerCase();
    if (whatsappEnabled === 'true' || whatsappEnabled === '1') {
        const requiredWhatsAppVars = [
            'WHATSAPP_VERIFY_TOKEN',
            'WHATSAPP_PHONE_NUMBER_ID',
            'WHATSAPP_ACCESS_TOKEN',
        ];
        for (const key of requiredWhatsAppVars) {
            const value = config[key];
            if (typeof value !== 'string' || value.trim().length === 0) {
                throw new Error(`${key} is required when WHATSAPP_ENABLED=true`);
            }
        }
    }

    const storageProvider = String(config.STORAGE_PROVIDER ?? 'local').trim().toLowerCase();
    if (storageProvider === 's3') {
        const requiredStorageVars = ['STORAGE_S3_BUCKET', 'STORAGE_S3_REGION'];
        for (const key of requiredStorageVars) {
            const value = config[key];
            if (typeof value !== 'string' || value.trim().length === 0) {
                throw new Error(`${key} is required when STORAGE_PROVIDER=s3`);
            }
        }
    }

    return config;
}
