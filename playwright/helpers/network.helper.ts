import { BrowserContext } from '@playwright/test';

export async function goOffline(context: BrowserContext): Promise<void> {
    await context.setOffline(true);
}

export async function goOnline(context: BrowserContext): Promise<void> {
    await context.setOffline(false);
}
