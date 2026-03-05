import { describe, expect, it } from 'vitest';
import { getRoleCapabilities } from './capabilities';

describe('getRoleCapabilities', () => {
    it('grants only customer capabilities to USER', () => {
        const capabilities = getRoleCapabilities('USER');
        expect(capabilities.canAccessCustomerPanel).toBe(true);
        expect(capabilities.canAccessBusinessPanel).toBe(false);
        expect(capabilities.canAccessAdminPanel).toBe(false);
        expect(capabilities.canRegisterBusiness).toBe(false);
        expect(capabilities.canManageOrganizations).toBe(false);
    });

    it('grants only business capabilities to BUSINESS_OWNER', () => {
        const capabilities = getRoleCapabilities('BUSINESS_OWNER');
        expect(capabilities.canAccessCustomerPanel).toBe(false);
        expect(capabilities.canAccessBusinessPanel).toBe(true);
        expect(capabilities.canAccessAdminPanel).toBe(false);
        expect(capabilities.canRegisterBusiness).toBe(true);
        expect(capabilities.canManageOrganizations).toBe(false);
    });

    it('grants only admin capabilities to ADMIN', () => {
        const capabilities = getRoleCapabilities('ADMIN');
        expect(capabilities.canAccessCustomerPanel).toBe(false);
        expect(capabilities.canAccessBusinessPanel).toBe(false);
        expect(capabilities.canAccessAdminPanel).toBe(true);
        expect(capabilities.canRegisterBusiness).toBe(false);
        expect(capabilities.canManageOrganizations).toBe(false);
        expect(capabilities.isPlatformOperator).toBe(true);
    });

    it('falls back to USER for unknown values', () => {
        const capabilities = getRoleCapabilities('INVALID');
        expect(capabilities.role).toBe('USER');
        expect(capabilities.canAccessCustomerPanel).toBe(true);
    });
});
