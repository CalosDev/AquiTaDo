import { describe, expect, it } from 'vitest';
import {
    buildTotpOtpauthUrl,
    generateTotpCode,
    generateTotpSecret,
    verifyTotpCode,
} from './totp.util';

describe('totp util', () => {
    it('generates verifiable codes for the current window', () => {
        const secret = generateTotpSecret();
        const code = generateTotpCode(secret);

        expect(verifyTotpCode(secret, code)).toBe(true);
    });

    it('rejects invalid codes', () => {
        const secret = generateTotpSecret();
        const invalidCode = '000000';

        expect(verifyTotpCode(secret, invalidCode)).toBe(false);
    });

    it('builds a valid otpauth url', () => {
        const secret = generateTotpSecret();
        const url = buildTotpOtpauthUrl({
            secret,
            accountLabel: 'admin@aquitado.com',
            issuer: 'AquiTa.do',
        });

        expect(url.startsWith('otpauth://totp/')).toBe(true);
        expect(url).toContain('issuer=AquiTa.do');
        expect(url).toContain(`secret=${secret}`);
    });
});
