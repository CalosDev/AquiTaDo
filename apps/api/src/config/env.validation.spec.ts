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
});
