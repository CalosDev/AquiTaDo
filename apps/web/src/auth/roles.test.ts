import { describe, expect, it } from 'vitest';
import {
    isUserRole,
    resolveRoleHomeLabel,
    resolveRoleHomePath,
} from './roles';

describe('roles', () => {
    it('resolves role home paths correctly', () => {
        expect(resolveRoleHomePath('USER')).toBe('/app/customer');
        expect(resolveRoleHomePath('BUSINESS_OWNER')).toBe('/dashboard');
        expect(resolveRoleHomePath('ADMIN')).toBe('/admin');
        expect(resolveRoleHomePath('UNKNOWN')).toBe('/app/customer');
    });

    it('resolves role home labels correctly', () => {
        expect(resolveRoleHomeLabel('USER')).toBe('Mi Panel');
        expect(resolveRoleHomeLabel('BUSINESS_OWNER')).toBe('Panel Negocio');
        expect(resolveRoleHomeLabel('ADMIN')).toBe('Panel Admin');
    });

    it('validates user roles', () => {
        expect(isUserRole('USER')).toBe(true);
        expect(isUserRole('BUSINESS_OWNER')).toBe(true);
        expect(isUserRole('ADMIN')).toBe(true);
        expect(isUserRole('owner')).toBe(false);
        expect(isUserRole(null)).toBe(false);
    });
});
