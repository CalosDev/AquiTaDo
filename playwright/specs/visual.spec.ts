import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { loginAsAdmin } from '../helpers/auth.helper';
import { mockHomeVisualApi } from '../helpers/home-visual.helper';

const VISUAL_BUSINESS_CATEGORIES = [
    { id: 'cat-restaurantes', name: 'Restaurantes', slug: 'restaurantes' },
    { id: 'cat-colmados', name: 'Colmados', slug: 'colmados' },
    { id: 'cat-salones', name: 'Salones', slug: 'salones-barberias' },
] as const;

const VISUAL_BUSINESS_PROVINCES = [
    { id: 'prov-dn', name: 'Distrito Nacional', slug: 'distrito-nacional' },
    { id: 'prov-santiago', name: 'Santiago', slug: 'santiago' },
] as const;

const VISUAL_BUSINESSES = [
    {
        id: 'biz-cafe-aquita',
        name: 'Cafe AquiTa',
        slug: 'cafe-aquita',
        description: 'Cafe de especialidad con brunch diario.',
        address: 'Av. Winston Churchill 101',
        verified: true,
        openNow: true,
        todayHoursLabel: '8:00 AM - 8:00 PM',
        latitude: 18.47,
        longitude: -69.94,
        province: { name: 'Distrito Nacional' },
        city: { name: 'Santo Domingo' },
        sector: { id: 'sector-piantini', name: 'Piantini' },
        images: [],
        categories: [{ id: 'cat-restaurantes', name: 'Restaurantes', slug: 'restaurantes' }],
        _count: { reviews: 34 },
        reputationScore: 92,
        priceRange: 'MID',
        distanceKm: 1.2,
    },
    {
        id: 'biz-colmado-27',
        name: 'Colmado 27',
        slug: 'colmado-27',
        description: 'Colmado de barrio con delivery rapido.',
        address: 'C. Rafael Augusto Sanchez 27',
        verified: false,
        openNow: false,
        todayHoursLabel: '9:00 AM - 10:00 PM',
        latitude: 18.468,
        longitude: -69.939,
        province: { name: 'Distrito Nacional' },
        city: { name: 'Santo Domingo' },
        sector: { id: 'sector-ensanche', name: 'Ensanche Naco' },
        images: [],
        categories: [{ id: 'cat-colmados', name: 'Colmados', slug: 'colmados' }],
        _count: { reviews: 12 },
        reputationScore: 76,
        priceRange: 'LOW',
        distanceKm: 2.4,
    },
    {
        id: 'biz-estudio-norte',
        name: 'Estudio Norte',
        slug: 'estudio-norte',
        description: 'Salon y barberia con citas y atencion express.',
        address: 'C. Benito Moncion 88',
        verified: true,
        openNow: true,
        todayHoursLabel: '10:00 AM - 7:00 PM',
        latitude: 19.451,
        longitude: -70.697,
        province: { name: 'Santiago' },
        city: { name: 'Santiago de los Caballeros' },
        sector: { id: 'sector-jardines', name: 'Los Jardines' },
        images: [],
        categories: [{ id: 'cat-salones', name: 'Salones', slug: 'salones-barberias' }],
        _count: { reviews: 21 },
        reputationScore: 85,
        priceRange: 'MID',
        distanceKm: 3.1,
    },
] as const;

function buildVisualBusinessImageDataUrl(label: string, fill: string): string {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
            <rect width="1600" height="1000" fill="${fill}" />
            <circle cx="1280" cy="180" r="120" fill="rgba(255,255,255,0.22)" />
            <circle cx="300" cy="780" r="180" fill="rgba(255,255,255,0.14)" />
            <text
                x="120"
                y="860"
                fill="rgba(255,255,255,0.92)"
                font-family="Arial, sans-serif"
                font-size="92"
                font-weight="700"
            >
                ${label}
            </text>
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const VISUAL_BUSINESS_DETAIL = {
    id: 'biz-1',
    name: 'Cafe AquiTa',
    slug: 'cafe-aquita',
    description: 'Cafe de especialidad con brunch diario, reposteria artesanal y espacios tranquilos para reuniones cortas.',
    address: 'Av. Winston Churchill 101, Piantini',
    verified: true,
    publicStatus: 'PUBLISHED',
    claimStatus: 'CLAIMED',
    isClaimable: false,
    openNow: true,
    todayHoursLabel: '8:00 AM - 8:00 PM',
    createdAt: '2025-01-10T12:00:00.000Z',
    updatedAt: '2026-04-19T12:00:00.000Z',
    latitude: 18.47,
    longitude: -69.94,
    profileCompletenessScore: 92,
    reputationScore: 88,
    priceRange: 'MID',
    province: { id: 'prov-1', name: 'Distrito Nacional' },
    city: { id: 'city-1', name: 'Santo Domingo' },
    sector: { name: 'Piantini' },
    categories: [
        {
            category: {
                name: 'Cafe',
                icon: 'coffee',
                parent: { name: 'Restaurantes' },
            },
        },
    ],
    features: [
        { feature: { name: 'Brunch diario' } },
        { feature: { name: 'Wi-Fi rapido' } },
        { feature: { name: 'Pet friendly' } },
    ],
    hours: [
        { dayOfWeek: 0, closed: false, opensAt: '08:00', closesAt: '20:00' },
        { dayOfWeek: 1, closed: false, opensAt: '08:00', closesAt: '20:00' },
        { dayOfWeek: 2, closed: false, opensAt: '08:00', closesAt: '20:00' },
        { dayOfWeek: 3, closed: false, opensAt: '08:00', closesAt: '20:00' },
        { dayOfWeek: 4, closed: false, opensAt: '08:00', closesAt: '20:00' },
        { dayOfWeek: 5, closed: false, opensAt: '08:00', closesAt: '22:00' },
        { dayOfWeek: 6, closed: false, opensAt: '09:00', closesAt: '22:00' },
    ],
    images: [
        {
            id: 'img-1',
            url: buildVisualBusinessImageDataUrl('Barra principal', '#1d4ed8'),
            caption: 'Barra principal',
        },
        {
            id: 'img-2',
            url: buildVisualBusinessImageDataUrl('Salon interior', '#0f766e'),
            caption: 'Salon interior',
            isCover: true,
        },
        {
            id: 'img-3',
            url: buildVisualBusinessImageDataUrl('Cafe servido', '#9333ea'),
            caption: 'Cafe servido',
        },
        {
            id: 'img-4',
            url: buildVisualBusinessImageDataUrl('Terraza', '#ea580c'),
            caption: 'Terraza',
        },
    ],
    reviews: [
        {
            id: 'review-1',
            rating: 5,
            comment: 'Cafe excelente y servicio rapido.',
            createdAt: '2026-04-18T12:00:00.000Z',
            user: { name: 'Ana' },
        },
    ],
    _count: { reviews: 5 },
} as const;

const VISUAL_BUSINESS_REPUTATION = {
    business: {
        id: VISUAL_BUSINESS_DETAIL.id,
        reputationScore: 88,
        reputationTier: 'GOLD',
        verified: true,
    },
    metrics: {
        averageRating: 4.8,
        reviewCount: 5,
        bookings: {
            completed: 0,
            confirmed: 0,
            pending: 0,
            canceled: 0,
            noShow: 0,
        },
        successfulTransactions: 0,
        grossRevenue: 0,
    },
} as const;

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

            .defer-render-card {
                content-visibility: visible !important;
                contain-intrinsic-size: auto !important;
            }
        `,
    });
}

function json(body: unknown) {
    return {
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(body),
    };
}

async function mockBusinessesVisualApi(page: Page): Promise<void> {
    await page.route('**/api/categories', async (route) => {
        await route.fulfill(json(VISUAL_BUSINESS_CATEGORIES));
    });

    await page.route('**/api/provinces', async (route) => {
        await route.fulfill(json(VISUAL_BUSINESS_PROVINCES));
    });

    await page.route('**/api/businesses?*', async (route) => {
        await route.fulfill(json({
            data: VISUAL_BUSINESSES,
            total: VISUAL_BUSINESSES.length,
            page: 1,
            limit: 12,
            totalPages: 1,
        }));
    });

    await page.route('**/api/ads/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/impression') || url.includes('/click')) {
            await route.fulfill({ status: 204, body: '' });
            return;
        }

        await route.fulfill(json([]));
    });
}

async function mockBusinessDetailsVisualApi(page: Page): Promise<void> {
    await page.route('**/api/businesses/nearby?*', async (route) => {
        await route.fulfill(json({
            data: [],
            total: 0,
        }));
    });

    await page.route('**/api/businesses/cafe-aquita', async (route) => {
        await route.fulfill(json(VISUAL_BUSINESS_DETAIL));
    });

    await page.route(`**/api/businesses/${VISUAL_BUSINESS_DETAIL.id}`, async (route) => {
        await route.fulfill(json(VISUAL_BUSINESS_DETAIL));
    });

    await page.route('**/api/telemetry/business', async (route) => {
        await route.fulfill({ status: 204, body: '' });
    });

    await page.route(`**/api/reputation/business/${VISUAL_BUSINESS_DETAIL.id}`, async (route) => {
        await route.fulfill(json(VISUAL_BUSINESS_REPUTATION));
    });

    await page.route(`**/api/checkins/business/${VISUAL_BUSINESS_DETAIL.id}/stats`, async (route) => {
        await route.fulfill(json({
            businessId: VISUAL_BUSINESS_DETAIL.id,
            totalCheckIns: 128,
            last24HoursCheckIns: 9,
            verifiedCheckIns: 103,
            uniqueUsers: 87,
        }));
    });

    await page.route(`**/api/promotions?businessId=${VISUAL_BUSINESS_DETAIL.id}&limit=6`, async (route) => {
        await route.fulfill(json([]));
    });

    await page.route(`**/api/reviews/business/${VISUAL_BUSINESS_DETAIL.id}`, async (route) => {
        await route.fulfill(json([]));
    });

    await page.route('**/export/embed.html?*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html; charset=utf-8',
            body: '<!doctype html><html><body style="margin:0;background:#e2e8f0;"></body></html>',
        });
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

    test('home mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
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
        await expect(page).toHaveScreenshot('home-mobile.png', { fullPage: true });
    });

    test('login mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await disableMotionForVisuals(page);
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();
        await expect(page).toHaveScreenshot('login-mobile.png', { fullPage: true });
    });

    test('login desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await disableMotionForVisuals(page);
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: /Entra a tu cuenta/i })).toBeVisible();
        await expect(page).toHaveScreenshot('login-desktop.png', { fullPage: true });
    });

    test('register mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await disableMotionForVisuals(page);
        await page.goto('/register');
        await expect(page.getByRole('heading', { name: /Crea tu cuenta/i })).toBeVisible();
        await expect(page).toHaveScreenshot('register-mobile.png', { fullPage: true });
    });

    test('register desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await disableMotionForVisuals(page);
        await page.goto('/register');
        await expect(page.getByRole('heading', { name: /Crea tu cuenta/i })).toBeVisible();
        await expect(page).toHaveScreenshot('register-desktop.png', { fullPage: true });
    });

    test('admin dashboard baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await disableMotionForVisuals(page);
        await loginAsAdmin(page);
        await expect(page.getByText(/Estado del sistema|Negocios/i).first()).toBeVisible();
        await expect(page).toHaveScreenshot('admin-dashboard-desktop.png', { fullPage: true });
    });

    test('businesses desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1400 });
        await forceImmediateIntersections(page);
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await mockBusinessesVisualApi(page);
        await page.goto('/businesses', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /^Negocios$/i })).toBeVisible();
        await expect(page.getByRole('heading', { name: /Directorio listo para explorar/i })).toBeVisible();
        await expect(page.getByText('Cafe AquiTa')).toBeVisible();
        await expect(page.getByText('Colmado 27')).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('businesses-desktop.png', { fullPage: true });
    });

    test('businesses mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await forceImmediateIntersections(page);
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await mockBusinessesVisualApi(page);
        await page.goto('/businesses', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /^Negocios$/i })).toBeVisible();
        await expect(page.getByText('Cafe AquiTa')).toBeVisible();
        await expect(page.getByRole('button', { name: /^Filtros$/i })).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('businesses-mobile.png', { fullPage: true });
    });

    test('business details desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1400 });
        await forceImmediateIntersections(page);
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await mockBusinessDetailsVisualApi(page);
        await page.goto('/businesses/cafe-aquita', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.locator('h1', { hasText: 'Cafe AquiTa' })).toBeVisible();
        await expect(page.getByText(/Galeria 4 fotos/i)).toBeVisible();
        await expect(page.getByText(/Recorrido visual/i)).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('business-details-desktop.png');
    });

    test('business details mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await forceImmediateIntersections(page);
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await mockBusinessDetailsVisualApi(page);
        await page.goto('/businesses/cafe-aquita', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.locator('h1', { hasText: 'Cafe AquiTa' })).toBeVisible();
        await expect(page.getByText(/Galeria 4 fotos/i)).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('business-details-mobile.png');
    });
});
