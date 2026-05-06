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

const VISUAL_PROFILE_USER = {
    id: 'user-admin-visual',
    name: 'Admin Visual',
    email: 'admin@aquita.do',
    phone: '+1 809-555-0100',
    avatarUrl: null,
    role: 'ADMIN',
    createdAt: '2025-01-10T12:00:00.000Z',
    updatedAt: '2026-04-20T12:00:00.000Z',
} as const;

const VISUAL_PROFILE_DETAILS = {
    profileType: 'ADMIN',
    user: VISUAL_PROFILE_USER,
    userProfile: {
        reviewCount: 4,
        bookingCount: 2,
        recentReviews: [
            {
                id: 'review-profile-1',
                rating: 5,
                comment: 'Atencion rapida y datos claros.',
                moderationStatus: 'APPROVED',
                createdAt: '2026-04-10T14:30:00.000Z',
                business: {
                    id: 'biz-cafe-aquita',
                    name: 'Cafe AquiTa',
                    slug: 'cafe-aquita',
                },
            },
        ],
        recentBookings: [
            {
                id: 'booking-profile-1',
                status: 'CONFIRMED',
                scheduledFor: '2026-04-22T16:00:00.000Z',
                quotedAmount: '1800',
                depositAmount: '500',
                currency: 'DOP',
                createdAt: '2026-04-12T12:00:00.000Z',
                business: {
                    id: 'biz-estudio-norte',
                    name: 'Estudio Norte',
                    slug: 'estudio-norte',
                },
            },
        ],
    },
    adminProfile: {
        metrics: {
            totalUsers: 1240,
            totalOrganizations: 86,
            totalBusinesses: 312,
            totalReviews: 1540,
            totalBookings: 428,
            totalTransactions: 96,
        },
        flaggedReviews: [
            {
                id: 'flagged-review-1',
                rating: 2,
                comment: 'Comentario pendiente de revision por lenguaje sensible.',
                moderationReason: 'Lenguaje reportado',
                createdAt: '2026-04-18T10:15:00.000Z',
                user: {
                    id: 'user-reviewer-1',
                    name: 'Laura Mendez',
                },
                business: {
                    id: 'biz-colmado-27',
                    name: 'Colmado 27',
                },
            },
        ],
        latestOrganizations: [
            {
                id: 'org-visual-1',
                name: 'Grupo Norte RD',
                slug: 'grupo-norte-rd',
                createdAt: '2026-04-16T09:00:00.000Z',
                subscriptionStatus: 'ACTIVE',
                plan: 'PRO',
                _count: {
                    businesses: 3,
                    members: 5,
                },
            },
        ],
    },
} as const;

const VISUAL_OWNER_USER = {
    id: 'user-owner-visual',
    name: 'Owner Visual',
    email: 'owner.visual@aquita.do',
    phone: '+1 809-555-0120',
    avatarUrl: null,
    role: 'BUSINESS_OWNER',
    createdAt: '2025-03-10T12:00:00.000Z',
    updatedAt: '2026-04-20T12:00:00.000Z',
} as const;

const VISUAL_OWNER_ORGANIZATION = {
    id: 'org-owner-visual',
    name: 'Grupo AquiTa Visual',
    slug: 'grupo-aquita-visual',
    membership: {
        role: 'OWNER',
        joinedAt: '2025-03-10T12:00:00.000Z',
    },
    _count: {
        businesses: 2,
        members: 3,
        invites: 1,
    },
} as const;

const VISUAL_OWNER_BUSINESSES = [
    {
        id: 'biz-owner-cafe',
        slug: 'cafe-aquita-owner',
        name: 'Cafe AquiTa Owner',
        verified: true,
        verificationStatus: 'PENDING',
        claimStatus: 'CLAIMED',
        publicStatus: 'PUBLISHED',
        source: 'OWNER',
        catalogSource: 'OWNER',
        lifecycleStatus: 'PUBLISHED',
        isActive: true,
        primaryManagingOrganizationId: VISUAL_OWNER_ORGANIZATION.id,
        profileCompletenessScore: 86,
        missingCoreFields: [],
        openNow: true,
    },
    {
        id: 'biz-owner-market',
        slug: 'market-aquita-owner',
        name: 'Market AquiTa Owner',
        verified: false,
        verificationStatus: 'UNVERIFIED',
        claimStatus: 'PENDING_CLAIM',
        publicStatus: 'PUBLISHED',
        source: 'OWNER',
        catalogSource: 'OWNER',
        lifecycleStatus: 'PUBLISHED',
        isActive: true,
        primaryManagingOrganizationId: VISUAL_OWNER_ORGANIZATION.id,
        profileCompletenessScore: 62,
        missingCoreFields: ['telefono', 'horario', 'imagenes'],
        openNow: false,
    },
] as const;

const VISUAL_OWNER_METRICS = {
    totals: {
        views: 2480,
        clicks: 318,
        conversions: 74,
        grossRevenue: 0,
        conversionRate: 13,
    },
} as const;

const VISUAL_OWNER_CLAIM_REQUESTS = {
    data: [
        {
            id: 'claim-owner-1',
            status: 'UNDER_REVIEW',
            createdAt: '2026-04-18T14:30:00.000Z',
            reviewedAt: null,
            approvedAt: null,
            rejectedAt: null,
            expiredAt: null,
            canceledAt: null,
            evidenceType: 'DOCUMENT',
            business: {
                id: VISUAL_OWNER_BUSINESSES[0].id,
                name: VISUAL_OWNER_BUSINESSES[0].name,
                slug: VISUAL_OWNER_BUSINESSES[0].slug,
                claimStatus: VISUAL_OWNER_BUSINESSES[0].claimStatus,
                lifecycleStatus: VISUAL_OWNER_BUSINESSES[0].lifecycleStatus,
            },
        },
        {
            id: 'claim-owner-2',
            status: 'PENDING',
            createdAt: '2026-04-16T10:15:00.000Z',
            reviewedAt: null,
            approvedAt: null,
            rejectedAt: null,
            expiredAt: null,
            canceledAt: null,
            evidenceType: 'PHONE',
            business: {
                id: VISUAL_OWNER_BUSINESSES[1].id,
                name: VISUAL_OWNER_BUSINESSES[1].name,
                slug: VISUAL_OWNER_BUSINESSES[1].slug,
                claimStatus: VISUAL_OWNER_BUSINESSES[1].claimStatus,
                lifecycleStatus: VISUAL_OWNER_BUSINESSES[1].lifecycleStatus,
            },
        },
    ],
    summary: {
        PENDING: 1,
        UNDER_REVIEW: 1,
    },
} as const;

const VISUAL_OWNER_VERIFICATION_STATUS = {
    id: VISUAL_OWNER_BUSINESSES[0].id,
    verificationStatus: 'PENDING',
    verified: false,
    verificationSubmittedAt: '2026-04-19T09:00:00.000Z',
    verificationReviewedAt: null,
    verificationNotes: null,
} as const;

const VISUAL_OWNER_DOCUMENTS = [
    {
        id: 'doc-owner-1',
        documentType: 'BUSINESS_LICENSE',
        fileUrl: 'https://example.test/license.pdf',
        status: 'APPROVED',
        submittedAt: '2026-04-17T12:00:00.000Z',
        rejectionReason: null,
        business: {
            id: VISUAL_OWNER_BUSINESSES[0].id,
            name: VISUAL_OWNER_BUSINESSES[0].name,
        },
    },
    {
        id: 'doc-owner-2',
        documentType: 'TAX_CERTIFICATE',
        fileUrl: 'https://example.test/tax.pdf',
        status: 'PENDING',
        submittedAt: '2026-04-18T12:00:00.000Z',
        rejectionReason: null,
        business: {
            id: VISUAL_OWNER_BUSINESSES[0].id,
            name: VISUAL_OWNER_BUSINESSES[0].name,
        },
    },
] as const;

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

async function mockProfileVisualApi(page: Page): Promise<void> {
    await page.route('**/api/users/me', async (route) => {
        await route.fulfill(json(VISUAL_PROFILE_USER));
    });

    await page.route('**/api/users/me/profile', async (route) => {
        await route.fulfill(json(VISUAL_PROFILE_DETAILS));
    });
}

async function seedOwnerDashboardVisualSession(page: Page): Promise<void> {
    await page.addInitScript(
        ({ token, user, organizationId }) => {
            sessionStorage.setItem('accessToken', token);
            localStorage.setItem('aquita_has_session', '1');
            localStorage.setItem('user', JSON.stringify(user));
            localStorage.setItem('activeOrganizationId', organizationId);
        },
        {
            token: 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.visual',
            user: VISUAL_OWNER_USER,
            organizationId: VISUAL_OWNER_ORGANIZATION.id,
        },
    );
}

async function mockOwnerDashboardVisualApi(page: Page): Promise<void> {
    await page.route('**/api/users/me', async (route) => {
        await route.fulfill(json(VISUAL_OWNER_USER));
    });

    await page.route('**/api/organizations/mine', async (route) => {
        await route.fulfill(json([VISUAL_OWNER_ORGANIZATION]));
    });

    await page.route('**/api/businesses/my', async (route) => {
        await route.fulfill(json(VISUAL_OWNER_BUSINESSES));
    });

    await page.route(/\/api\/analytics\/dashboard\/my(?:\?.*)?$/, async (route) => {
        await route.fulfill(json(VISUAL_OWNER_METRICS));
    });

    await page.route(/\/api\/businesses\/me\/claim-requests(?:\?.*)?$/, async (route) => {
        await route.fulfill(json(VISUAL_OWNER_CLAIM_REQUESTS));
    });

    await page.route(`**/api/verification/businesses/${VISUAL_OWNER_BUSINESSES[0].id}/status`, async (route) => {
        await route.fulfill(json(VISUAL_OWNER_VERIFICATION_STATUS));
    });

    await page.route(/\/api\/verification\/documents\/my(?:\?.*)?$/, async (route) => {
        await route.fulfill(json(VISUAL_OWNER_DOCUMENTS));
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

    test('owner dashboard desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await seedOwnerDashboardVisualSession(page);
        await mockOwnerDashboardVisualApi(page);
        await page.goto('/dashboard', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /^Cafe AquiTa Owner$/i })).toBeVisible();
        await expect(page.getByText(/Dashboard negocio/i).first()).toBeVisible();
        await expect(page.getByText(/Control del negocio/i)).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('dashboard-owner-desktop.png', { fullPage: true });
    });

    test('owner dashboard mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await seedOwnerDashboardVisualSession(page);
        await mockOwnerDashboardVisualApi(page);
        await page.goto('/dashboard', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /^Cafe AquiTa Owner$/i })).toBeVisible();
        await expect(page.getByText(/Visitas al perfil/i)).toBeVisible();
        await expect(page.getByText(/Control del negocio/i)).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('dashboard-owner-mobile.png', { fullPage: true });
    });

    test('profile desktop baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 1200 });
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await loginAsAdmin(page);
        await mockProfileVisualApi(page);
        await page.goto('/profile', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /^Mi perfil$/i })).toBeVisible();
        await expect(page.getByText(/Usuarios activos/i).first()).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('profile-desktop.png', { fullPage: true });
    });

    test('profile mobile baseline @visual', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await stabilizeVisualRuntime(page);
        await disableMotionForVisuals(page);
        await loginAsAdmin(page);
        await mockProfileVisualApi(page);
        await page.goto('/profile', { waitUntil: 'networkidle' });
        await disableDeferredRenderingForVisuals(page);
        await expect(page.getByRole('heading', { name: /^Mi perfil$/i })).toBeVisible();
        await expect(page.getByText(/Usuarios activos/i).first()).toBeVisible();
        await page.waitForTimeout(250);
        await expect(page).toHaveScreenshot('profile-mobile.png', { fullPage: true });
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
