import { expect, test } from '@playwright/test';

test.describe('Auth acceptance @acceptance', () => {
    test('login shows the form, recovery CTA, and submit action @acceptance', async ({ page }) => {
        await page.goto('/login');

        await expect(page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();
        await expect(page.getByRole('textbox', { name: /Correo electr/i })).toBeVisible();
        await expect(page.getByRole('textbox', { name: /Contrase/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /Recuperar acceso/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Iniciar sesi/i })).toBeVisible();
    });

    test('register shows account type selection and submit CTA @acceptance', async ({ page }) => {
        await page.goto('/register');

        await expect(page.getByRole('heading', { name: /Crea tu cuenta/i })).toBeVisible();
        await expect(page.getByRole('textbox', { name: /Nombre completo/i })).toBeVisible();
        await expect(page.getByRole('textbox', { name: /Correo electr/i })).toBeVisible();
        await expect(page.getByRole('radio', { name: /Cuenta cliente/i })).toBeVisible();
        await expect(page.getByRole('radio', { name: /Cuenta negocio/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Registrarse/i })).toBeVisible();
    });
});
