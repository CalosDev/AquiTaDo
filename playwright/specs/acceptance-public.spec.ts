import { expect, test } from '@playwright/test';

test.describe('Public acceptance @acceptance', () => {
    test('home shows value proposition and primary CTA @acceptance', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: /Descubre negocios reales/i })).toBeVisible();
        await expect(page.getByText(/AquiTa\.do te ayuda a encontrar negocios locales/i)).toBeVisible();
        await expect(page.getByRole('link', { name: /Explorar negocios/i })).toBeVisible();
    });

    test('businesses shows context, filters, and a result area @acceptance', async ({ page }) => {
        await page.goto('/businesses');

        await expect(page.getByRole('heading', { name: /Negocios/i })).toBeVisible();
        await expect(page.getByText(/Exploraci[oó]n guiada/i)).toBeVisible();
        await expect(page.getByText(/Ajusta provincia, vista y orden sin perder contexto/i)).toBeVisible();
        await expect(page.getByRole('textbox', { name: /Buscar negocios/i })).toBeVisible();
        await expect(page.getByRole('combobox', { name: /Filtrar por provincia/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Filtros/i })).toBeVisible();
        await expect(page.getByText(/Cargando resultados\.{3}|Mostrando \d+ resultado|No encontramos coincidencias/i)).toBeVisible();
    });

    test('business detail recovers from a missing slug @acceptance', async ({ page }) => {
        await page.goto('/businesses/definitely-not-a-real-business-slug-123456');

        await expect(page.getByRole('heading', { name: /Negocio no encontrado/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /Volver al directorio/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /Ir al inicio/i })).toBeVisible();
    });
});
