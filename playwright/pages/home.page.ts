import { expect, Page } from '@playwright/test';

export class HomePage {
    constructor(private readonly page: Page) { }

    async goto(): Promise<void> {
        await this.page.goto('/');
        await expect(this.page.getByRole('heading', { name: /Descubre negocios/i })).toBeVisible();
    }

    async openBusinesses(): Promise<void> {
        await this.page.getByRole('link', { name: /Explorar negocios/i }).click();
        await expect(this.page).toHaveURL(/\/businesses$/);
    }
}
