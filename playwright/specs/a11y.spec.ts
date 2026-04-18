import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function openStablePage(pathname: string, headingName: RegExp, page: Page) {
    await page.goto(pathname, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: headingName })).toBeVisible();
    await page.waitForTimeout(750);
}

test.describe('Accessibility @a11y', () => {
    test('home respects the basic accessibility baseline @a11y', async ({ page }) => {
        await openStablePage('/', /Descubre negocios/i, page);

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations).toEqual([]);
    });

    test('login respects the basic accessibility baseline @a11y', async ({ page }) => {
        await openStablePage('/login', /Entra a tu cuenta/i, page);

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();

        expect(results.violations).toEqual([]);
    });
});
