import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth.helper';
import { mockHomeVisualApi } from '../helpers/home-visual.helper';

async function forceImmediateIntersections(page: Page): Promise<void> {
    await page.addInitScript(() => {
        class ImmediateIntersectionObserver {
            private readonly callback: IntersectionObserverCallback;

            constructor(callback: IntersectionObserverCallback) {
                this.callback = callback;
            }

            observe(target: Element) {
                const rect = target.getBoundingClientRect();
                this.callback([
                    {
                        boundingClientRect: rect,
                        intersectionRatio: 1,
                        intersectionRect: rect,
                        isIntersecting: true,
                        rootBounds: null,
                        target,
                        time: Date.now(),
                    },
                ] as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
            }

            unobserve() { }

            disconnect() { }

            takeRecords() {
                return [];
            }
        }

        Object.defineProperty(window, 'IntersectionObserver', {
            configurable: true,
            writable: true,
            value: ImmediateIntersectionObserver,
        });
    });
}

async function stabilizeVisualRuntime(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const blockedEventType = 'pwa:update-available';
        const originalDispatchEvent = window.dispatchEvent.bind(window);

        window.dispatchEvent = ((event: Event) => {
            if (event?.type === blockedEventType) {
                return true;
            }

            return originalDispatchEvent(event);
        }) as typeof window.dispatchEvent;

        const registration = {
            waiting: null,
            installing: null,
            addEventListener() { },
            removeEventListener() { },
            update: async () => undefined,
        };

        const serviceWorkerContainer = {
            controller: null,
            register: async () => registration,
            addEventListener() { },
            removeEventListener() { },
        };

        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: serviceWorkerContainer,
        });
    });
}

const VISUAL_MOTION_STYLE_ID = 'visual-disable-motion';
const VISUAL_MOTION_CSS = `
    *, *::before, *::after {
        animation: none !important;
        transition: none !important;
    }

    .animate-fade-in {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
    }
`;

async function disableMotionForVisuals(page: Page): Promise<void> {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(
        ({ css, styleId }) => {
            const ensureMotionOverride = () => {
                if (document.getElementById(styleId)) {
                    return;
                }

                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = css;
                (document.head ?? document.documentElement).appendChild(style);
            };

            ensureMotionOverride();

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', ensureMotionOverride, { once: true });
            }
        },
        { css: VISUAL_MOTION_CSS, styleId: VISUAL_MOTION_STYLE_ID },
    );

    await page.evaluate(
        ({ css, styleId }) => {
            if (document.getElementById(styleId)) {
                return;
            }

            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = css;
            (document.head ?? document.documentElement).appendChild(style);
        },
        { css: VISUAL_MOTION_CSS, styleId: VISUAL_MOTION_STYLE_ID },
    ).catch(() => undefined);
}

async function disableDeferredRenderingForVisuals(page: Page): Promise<void> {
    await page.addStyleTag({
        content: `
            .defer-render-section {
                content-visibility: visible !important;
                contain-intrinsic-size: auto !important;
            }
        `,
    });
}

test.describe('Visual baselines @visual', () => {
    test('home desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1400 });
        await forceImmediateIntersections(page);
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await mockHomeVisualApi(page);
        await page.goto('/', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /Descubre negocios/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /Negocios recientes/i })).toBeVisible();
        await expect(page.getByText(/Aun no hay ranking disponible para ese filtro/i)).toBeVisible();
        await expect(page.getByText(/no hay negocios registrados/i)).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page.locator('body')).toHaveScreenshot('home-desktop.png');
    });

    test('login mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await disableMotionForVisuals(page);
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();
        await expect(page).toHaveScreenshot('login-mobile.png', { fullPage: true });
    });

    test('admin dashboard baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await disableMotionForVisuals(page);
        await loginAsAdmin(page);
        await expect(page.getByText(/Estado del sistema|Negocios/i).first()).toBeVisible();
        await expect(page).toHaveScreenshot('admin-dashboard-desktop.png', { fullPage: true });
    });
});
