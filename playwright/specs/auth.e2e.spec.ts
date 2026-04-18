import { expect, test } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth.helper';
import { LoginPage } from '../pages/login.page';

test.describe('Auth flows', () => {
    test('invalid login shows a useful error', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.submit('admin@aquita.do', 'wrong-password');

        await expect(page.getByText(/credenciales invalidas|error al iniciar/i)).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);
    });

    test('admin session survives reload and syncs logout across tabs', async ({ browser }) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const secondTab = await context.newPage();

        await loginAsAdmin(page);
        await secondTab.goto('/admin');
        await expect(secondTab.getByText(/Estado del sistema|Negocios/i).first()).toBeVisible();

        await page.reload();
        await expect(page).toHaveURL(/\/admin$/);

        await page.getByRole('button', { name: /Salir/i }).click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(secondTab.getByText(/Entra a tu cuenta|pantalla login/i)).toBeVisible();

        await context.close();
    });
});
