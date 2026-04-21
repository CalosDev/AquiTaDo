import { expect, test } from '@playwright/test';
import { expectVisibleCopy, openAcceptanceRoute } from '../helpers/acceptance.helper';
import { loginAsAdmin } from '../helpers/auth.helper';

test.describe('Admin acceptance @acceptance', () => {
    test('admin shows the operational control surface @acceptance', async ({ page }) => {
        await loginAsAdmin(page);

        await openAcceptanceRoute(page, '/admin', /Control de plataforma/i);
        await expect(page.getByRole('heading', { name: /Negocios en revision y publicados/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Actualizar lista/i })).toBeVisible();
        await expect(page.getByPlaceholder(/Buscar por negocio, propietario, organizaci[oó]n o provincia/i)).toBeVisible();
        await expectVisibleCopy(page, /Busca por negocio, propietario, organizaci[oó]n o provincia y actua desde una sola tabla\./i);
    });
});
