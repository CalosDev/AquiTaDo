import { APIRequestContext, expect, Page } from '@playwright/test';
import { ADMIN_CREDENTIALS, type QaUserPayload, createQaUserPayload } from '../fixtures/users';
import { LoginPage } from '../pages/login.page';

function resolveApiBaseUrl(): string {
    return (process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3300').replace(/\/+$/, '');
}

export async function loginAsAdmin(page: Page): Promise<void> {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.submit(ADMIN_CREDENTIALS.email, ADMIN_CREDENTIALS.password);
    await page.waitForURL((url) => url.pathname === '/app' || url.pathname.startsWith('/admin'));
    await expect(page).toHaveURL(/\/admin(?:[/?#].*)?$/);
}

export async function registerUserViaApi(
    request: APIRequestContext,
    role: QaUserPayload['role'] = 'USER',
): Promise<QaUserPayload> {
    const payload = createQaUserPayload(role);
    const response = await request.post(`${resolveApiBaseUrl()}/api/auth/register`, {
        data: payload,
    });

    expect(response.ok()).toBeTruthy();
    return payload;
}

export async function loginViaApi(
    request: APIRequestContext,
    credentials: { email: string; password: string },
): Promise<string> {
    const response = await request.post(`${resolveApiBaseUrl()}/api/auth/login`, {
        data: credentials,
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(typeof body.accessToken).toBe('string');
    return body.accessToken as string;
}
