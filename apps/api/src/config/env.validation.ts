type EnvRecord = Record<string, unknown>;

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

    if (config.PORT !== undefined) {
        const parsedPort = Number(config.PORT);
        if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
            throw new Error('PORT must be a positive integer');
        }
    }

    return config;
}
