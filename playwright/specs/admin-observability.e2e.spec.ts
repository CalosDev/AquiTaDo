import { expect, test } from '@playwright/test';
import { loginViaApi, registerUserViaApi } from '../helpers/auth.helper';
import { ADMIN_CREDENTIALS } from '../fixtures/users';

const apiBaseUrl = (process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3300').replace(/\/+$/, '');

test.describe('Observability access', () => {
    test('metrics are blocked for anonymous and non-admin users, but available to admin', async ({ request }) => {
        const anonymousResponse = await request.get(`${apiBaseUrl}/api/observability/metrics`);
        expect(anonymousResponse.status()).toBe(401);

        const user = await registerUserViaApi(request, 'USER');
        const userToken = await loginViaApi(request, {
            email: user.email,
            password: user.password,
        });
        const userResponse = await request.get(`${apiBaseUrl}/api/observability/metrics`, {
            headers: {
                Authorization: `Bearer ${userToken}`,
            },
        });
        expect(userResponse.status()).toBe(403);

        const adminToken = await loginViaApi(request, ADMIN_CREDENTIALS);
        const adminResponse = await request.get(`${apiBaseUrl}/api/observability/metrics`, {
            headers: {
                Authorization: `Bearer ${adminToken}`,
            },
        });
        expect(adminResponse.status()).toBe(200);
        await expect(adminResponse.text()).resolves.toContain('aquita_');
    });
});
