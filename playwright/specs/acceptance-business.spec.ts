import { expect, test } from '@playwright/test';
import { expectPrimaryAction, expectVisibleCopy, openAcceptanceRoute, loginAsQaRole } from '../helpers/acceptance.helper';

test.describe('Business acceptance @acceptance', () => {
    test('dashboard shows the fresh-owner setup state and a clear next action @acceptance', async ({ page, request }) => {
        await loginAsQaRole(page, request, 'BUSINESS_OWNER');

        await openAcceptanceRoute(page, '/dashboard', /Panel del negocio/i);
        await expect(page.getByRole('heading', { name: /A[uú]n no tienes una organizaci[oó]n/i })).toBeVisible();
        await expectVisibleCopy(
            page,
            /Crea o u.nete a una organizaci.n para gestionar tus negocios en AquiTa\.do\./i,
        );
        await expectPrimaryAction(page, /Registrar negocio/i);
    });

    test('register-business shows the guided registration flow and context @acceptance', async ({ page, request }) => {
        await loginAsQaRole(page, request, 'BUSINESS_OWNER');

        await openAcceptanceRoute(page, '/register-business', /Registra tu negocio/i);
        await expectVisibleCopy(page, /Registro guiado/i);
        await expectVisibleCopy(page, /Paso actual/i);
        await expectVisibleCopy(page, /Navegaci[oó]n por pasos/i);
        await expect(page.getByRole('heading', { name: /Estado del registro/i })).toBeVisible();
        await expectVisibleCopy(
            page,
            /Completa 4 pasos para publicar tu negocio con una presentacion clara y confiable\./i,
        );
    });
});
