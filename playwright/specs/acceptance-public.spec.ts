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
        await expect(page.getByText(/Discovery p[uú]blico/i)).toBeVisible();
        await expect(page.getByRole('heading', { name: /Directorio listo para explorar/i })).toBeVisible();
        await expect(page.getByRole('textbox', { name: /Buscar negocios/i })).toBeVisible();
        await expect(page.getByRole('combobox', { name: /Filtrar por provincia/i })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible();
        await expect(page.getByRole('main')).toContainText(
            /Cargando resultados\.{3}|Mostrando 0 resultados|Mostrando \d+-\d+ de \d+ resultados|No encontramos coincidencias con esta combinación/i,
        );

        await page.getByRole('button', { name: 'Mapa' }).click();

        await expect(page).toHaveURL(/\/businesses\?view=map$/);
        await expect(page.getByText(/\d+ de \d+ visibles en mapa/i)).toBeVisible();
    });

    test('business detail recovers from a missing slug @acceptance', async ({ page }) => {
        await page.goto('/businesses/definitely-not-a-real-business-slug-123456');

        await expect(page).toHaveURL(/\/businesses\/definitely-not-a-real-business-slug-123456$/);
        await expect(page.getByRole('main')).toContainText(/Negocio no encontrado/i);
        const directoryLink = page.getByRole('link', { name: /Volver al directorio/i });
        await expect(directoryLink).toBeVisible();
        await expect(directoryLink).toHaveAttribute('href', '/businesses');
        const homeLink = page.getByRole('link', { name: /Ir al inicio/i });
        await expect(homeLink).toBeVisible();
        await expect(homeLink).toHaveAttribute('href', '/');
    });
});
