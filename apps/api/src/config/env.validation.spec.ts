import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
    it('accepts a valid environment map', () => {
        const result = validateEnv({
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            JWT_SECRET: 'this-is-a-long-enough-secret',
            PORT: '3000',
        });

        expect(result).toMatchObject({
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            JWT_SECRET: 'this-is-a-long-enough-secret',
            PORT: '3000',
        });
    });

    it('throws if JWT_SECRET is missing', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            }),
        ).toThrow('Missing required environment variable: JWT_SECRET');
    });

    it('throws if JWT_SECRET is too short', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'short-secret',
            }),
        ).toThrow('JWT_SECRET must be at least 16 characters long');
    });

    it('throws if THROTTLE_TTL_MS is invalid', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'this-is-a-long-enough-secret',
                THROTTLE_TTL_MS: '0',
            }),
        ).toThrow('THROTTLE_TTL_MS must be a positive integer');
    });

    it('throws if THROTTLE_LIMIT is invalid', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'this-is-a-long-enough-secret',
                THROTTLE_LIMIT: '-10',
            }),
        ).toThrow('THROTTLE_LIMIT must be a positive integer');
    });

    it('throws if GEOAPIFY_MIN_CONFIDENCE is outside 0..1', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'this-is-a-long-enough-secret',
                GEOAPIFY_MIN_CONFIDENCE: '1.5',
            }),
        ).toThrow('GEOAPIFY_MIN_CONFIDENCE must be a number between 0 and 1');
    });

    it('throws if VERIPHONE_STRICT_MODE is not boolean-like', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'this-is-a-long-enough-secret',
                VERIPHONE_STRICT_MODE: 'maybe',
            }),
        ).toThrow('VERIPHONE_STRICT_MODE must be a boolean-like value (true/false/1/0)');
    });

    it('throws if GEOAPIFY_BASE_URL is invalid', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'this-is-a-long-enough-secret',
                GEOAPIFY_BASE_URL: 'not-a-url',
            }),
        ).toThrow('GEOAPIFY_BASE_URL must be a valid URL');
    });

    it('accepts split Redis URLs for cache and BullMQ', () => {
        const result = validateEnv({
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
            JWT_SECRET: 'this-is-a-long-enough-secret',
            CACHE_REDIS_URL: 'rediss://cache.example.com:6379',
            BULLMQ_REDIS_URL: 'redis://queue.example.com:6379',
        });

        expect(result).toMatchObject({
            CACHE_REDIS_URL: 'rediss://cache.example.com:6379',
            BULLMQ_REDIS_URL: 'redis://queue.example.com:6379',
        });
    });

    it('throws if BULLMQ_REDIS_URL uses an invalid protocol', () => {
        expect(() =>
            validateEnv({
                DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
                JWT_SECRET: 'this-is-a-long-enough-secret',
                BULLMQ_REDIS_URL: 'https://queue.example.com',
            }),
        ).toThrow('BULLMQ_REDIS_URL must use one of: redis:, rediss:');
    });
});
