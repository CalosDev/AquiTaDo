import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('api client access token storage', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        vi.resetModules();
    });

    it('migrates legacy access token from localStorage to sessionStorage', async () => {
        localStorage.setItem('accessToken', 'legacy-token');

        const clientModule = await import('./client');

        expect(clientModule.getAccessToken()).toBe('legacy-token');
        expect(sessionStorage.getItem('accessToken')).toBe('legacy-token');
        expect(localStorage.getItem('accessToken')).toBeNull();
    });

    it('persists access token only in sessionStorage', async () => {
        const clientModule = await import('./client');
        clientModule.setAccessToken('fresh-token');

        expect(clientModule.getAccessToken()).toBe('fresh-token');
        expect(sessionStorage.getItem('accessToken')).toBe('fresh-token');
        expect(localStorage.getItem('accessToken')).toBeNull();
    });

    it('clears access token from memory and storage', async () => {
        const clientModule = await import('./client');
        clientModule.setAccessToken('token-to-clear');

        clientModule.clearAccessToken();

        expect(clientModule.getAccessToken()).toBeNull();
        expect(sessionStorage.getItem('accessToken')).toBeNull();
        expect(localStorage.getItem('accessToken')).toBeNull();
    });
});
