import { expect, Page } from '@playwright/test';

export class LoginPage {
    constructor(private readonly page: Page) { }

    async goto(): Promise<void> {
        await this.page.goto('/login');
        await expect(this.page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();
    }

    async submit(email: string, password: string): Promise<void> {
        await this.page.getByLabel(/Correo electr/i).fill(email);
        await this.page.getByLabel(/Contrase/i).fill(password);
        await this.page.getByRole('button', { name: /Iniciar sesi/i }).click();
    }
}
