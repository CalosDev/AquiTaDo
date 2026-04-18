import { expect, test } from '@playwright/test';
import { HomePage } from '../pages/home.page';

test.describe('Core navigation', () => {
    test('home loads without blank screen and main CTAs route correctly', async ({ page }) => {
        const homePage = new HomePage(page);
        await homePage.goto();

        const primaryNavigation = page.getByRole('banner');
        await expect(primaryNavigation.getByRole('link', { name: /Iniciar sesi/i })).toBeVisible();
        await expect(primaryNavigation.getByRole('link', { name: /Crear cuenta/i })).toBeVisible();

        await homePage.openBusinesses();
        await expect(page.getByText(/Negocios|Mostrando/i).first()).toBeVisible();

        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();

        await page.goto('/register');
        await expect(page.getByRole('heading', { name: /Crea tu cuenta/i })).toBeVisible();
    });
});
