import { expect, test } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth.helper';
import { mockHomeVisualApi } from '../helpers/home-visual.helper';

test.describe('Visual baselines @visual', () => {
    test('home desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1400 });
        await mockHomeVisualApi(page);
        await page.goto('/', { waitUntil: 'networkidle' });
        await expect(page.getByRole('heading', { name: /Descubre negocios/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /Negocios recientes/i })).toBeVisible();
        await page.waitForTimeout(1_000);
        await expect(page).toHaveScreenshot('home-desktop.png', { fullPage: true });
    });

    test('login mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();
        await expect(page).toHaveScreenshot('login-mobile.png', { fullPage: true });
    });

    test('admin dashboard baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await loginAsAdmin(page);
        await expect(page.getByText(/Estado del sistema|Negocios/i).first()).toBeVisible();
        await expect(page).toHaveScreenshot('admin-dashboard-desktop.png', { fullPage: true });
    });
});
