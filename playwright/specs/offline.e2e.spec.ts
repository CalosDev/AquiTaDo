import { expect, test } from '@playwright/test';
import { goOffline, goOnline } from '../helpers/network.helper';

test.describe('Offline recovery', () => {
    test('the app stays usable offline and refreshes after reconnect', async ({ context, page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const serviceWorkerReady = await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.ready;
            return Boolean(registration.active);
        });
        expect(serviceWorkerReady).toBe(true);

        await goOffline(context);
        await expect(page.getByTestId('runtime-banner-offline')).toBeVisible();

        await page.goto('/businesses');
        await expect(page.getByTestId('runtime-banner-offline')).toBeVisible();
        await expect(page.getByText(/Negocios|Mostrando|No encontramos/i).first()).toBeVisible();

        await goOnline(context);
        await expect(page.getByTestId('runtime-banner-online')).toBeVisible();
    });
});
