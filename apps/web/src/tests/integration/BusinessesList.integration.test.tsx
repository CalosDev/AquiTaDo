import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesList } from '../../pages/BusinessesList';
import { renderWithProviders } from '../../test/renderWithProviders';

const hooksMock = vi.hoisted(() => ({
    handleToggleFavorite: vi.fn(),
    resetSponsoredPlacements: vi.fn(),
    trackGrowthSignal: vi.fn(),
    useBusinessesSeo: vi.fn(),
}));

const endpointsMock = vi.hoisted(() => ({
    getAll: vi.fn(),
    getCategories: vi.fn(),
    getCities: vi.fn(),
    getProvinces: vi.fn(),
    getSectors: vi.fn(),
    prefetchPublicDetail: vi.fn(),
    trackGrowthEvent: vi.fn(),
}));

vi.mock('../../api/endpoints', () => ({
    adsApi: {
        getPlacements: vi.fn(async () => ({ data: [] })),
        trackClick: vi.fn(async () => undefined),
        trackImpression: vi.fn(async () => undefined),
    },
    analyticsApi: {
        trackGrowthEvent: endpointsMock.trackGrowthEvent,
    },
    businessApi: {
        getAll: endpointsMock.getAll,
        prefetchPublicDetail: endpointsMock.prefetchPublicDetail,
    },
    categoryApi: {
        getAll: endpointsMock.getCategories,
    },
    locationApi: {
        getCities: endpointsMock.getCities,
        getProvinces: endpointsMock.getProvinces,
        getSectors: endpointsMock.getSectors,
    },
}));

vi.mock('../../lib/growthTracking', () => ({
    trackGrowthEvent: hooksMock.trackGrowthSignal,
}));

vi.mock('../../routes/preload', () => ({
    preloadRouteChunk: vi.fn(),
}));

vi.mock('../../components/BusinessesMap', () => ({
    BusinessesMap: () => <div data-testid="businesses-map">map mock</div>,
}));

vi.mock('../../pages/businesses-list/useBusinessesSeo', () => ({
    useBusinessesSeo: hooksMock.useBusinessesSeo,
}));

vi.mock('../../pages/businesses-list/useFavoriteBusinesses', () => ({
    useFavoriteBusinesses: () => ({
        favoriteBusinessIds: new Set<string>(),
        favoriteProcessingId: null,
        handleToggleFavorite: hooksMock.handleToggleFavorite,
    }),
}));

vi.mock('../../pages/businesses-list/useSponsoredPlacements', () => ({
    useSponsoredPlacements: () => ({
        sponsoredPlacements: [],
        sponsoredPlacementsLoading: false,
        resetSponsoredPlacements: hooksMock.resetSponsoredPlacements,
    }),
}));

const baseBusiness = {
    id: 'biz-1',
    name: 'Cafe AquiTa',
    slug: 'cafe-aquita',
    description: 'Cafe de especialidad.',
    address: 'Av. Winston Churchill 101',
    verified: true,
    openNow: true,
    todayHoursLabel: '8:00 AM - 8:00 PM',
    latitude: 18.47,
    longitude: -69.94,
    province: { name: 'Distrito Nacional' },
    city: { name: 'Santo Domingo' },
    sector: { id: 'sector-1', name: 'Piantini' },
    images: [],
    categories: [],
    _count: { reviews: 3 },
    reputationScore: 88,
    priceRange: 'MID',
};

function LocationDisplay() {
    const location = useLocation();
    return (
        <output data-testid="location-display">
            {location.pathname}
            {location.search}
        </output>
    );
}

function renderBusinessesList(initialEntry: string) {
    return renderWithProviders(
        <Routes>
            <Route
                path="/businesses"
                element={(
                    <>
                        <LocationDisplay />
                        <BusinessesList />
                    </>
                )}
            />
            <Route
                path="/negocios/provincia/:provinceSlug"
                element={(
                    <>
                        <LocationDisplay />
                        <BusinessesList />
                    </>
                )}
            />
        </Routes>,
        {
            router: {
                initialEntries: [initialEntry],
            },
        },
    );
}

function currentLocationText() {
    const matches = screen.getAllByTestId('location-display');
    return matches[0]?.textContent ?? '';
}

function getLastGetAllParams() {
    const calls = endpointsMock.getAll.mock.calls;
    return calls[calls.length - 1]?.[0];
}

beforeEach(() => {
    vi.clearAllMocks();

    endpointsMock.getAll.mockResolvedValue({
        data: {
            data: [baseBusiness],
            total: 1,
            totalPages: 1,
        },
    });
    endpointsMock.getCategories.mockResolvedValue({ data: [] });
    endpointsMock.getProvinces.mockResolvedValue({
        data: [
            { id: 'prov-1', name: 'Distrito Nacional', slug: 'distrito-nacional' },
            { id: 'prov-2', name: 'Santiago', slug: 'santiago' },
        ],
    });
    endpointsMock.getCities.mockImplementation(async (provinceId: string) => ({
        data: provinceId === 'prov-1'
            ? [{ id: 'city-1', name: 'Santo Domingo' }]
            : [{ id: 'city-2', name: 'Santiago de los Caballeros' }],
    }));
    endpointsMock.getSectors.mockImplementation(async (cityId: string) => ({
        data: cityId === 'city-1'
            ? [{ id: 'sector-1', name: 'Piantini' }]
            : [{ id: 'sector-2', name: 'Los Jardines' }],
    }));
});

afterEach(() => {
    cleanup();
});

describe('BusinessesList integration', () => {
    it('syncs a province SEO route into provinceId query params and the final fetch payload', async () => {
        renderBusinessesList('/negocios/provincia/distrito-nacional');

        expect((await screen.findAllByText('Cafe AquiTa')).length).toBeGreaterThan(0);

        await waitFor(() => {
            expect(currentLocationText()).toContain('provinceId=prov-1');
        });

        await waitFor(() => {
            const lastCall = getLastGetAllParams();
            expect(lastCall).toMatchObject({
                provinceId: 'prov-1',
                page: 1,
                limit: 12,
            });
            expect(lastCall).not.toHaveProperty('provinceSlug');
        });
    });

    it('cleans cityId and sectorId after changing the province filter', async () => {
        renderBusinessesList('/businesses?provinceId=prov-1&cityId=city-1&sectorId=sector-1&page=3');

        expect((await screen.findAllByText('Cafe AquiTa')).length).toBeGreaterThan(0);

        const provinceSelect = document.querySelector('#businesses-province-top') as HTMLSelectElement | null;
        expect(provinceSelect).not.toBeNull();

        await userEvent.selectOptions(provinceSelect!, 'prov-2');

        await waitFor(() => {
            const locationText = currentLocationText();
            expect(locationText).toContain('provinceId=prov-2');
            expect(locationText).toContain('page=1');
            expect(locationText).not.toContain('cityId=');
            expect(locationText).not.toContain('sectorId=');
        });

        await waitFor(() => {
            const lastCall = getLastGetAllParams();
            expect(lastCall).toMatchObject({
                provinceId: 'prov-2',
                page: 1,
                limit: 12,
            });
            expect(lastCall).not.toHaveProperty('cityId');
            expect(lastCall).not.toHaveProperty('sectorId');
        });
    });

    it('navigates to /businesses when clear filters is triggered from an SEO route', async () => {
        renderBusinessesList('/negocios/provincia/distrito-nacional?feature=delivery&page=3');

        expect((await screen.findAllByText('Cafe AquiTa')).length).toBeGreaterThan(0);

        await waitFor(() => {
            expect(currentLocationText()).toContain('provinceId=prov-1');
        });

        await userEvent.click(screen.getAllByRole('button', { name: 'Limpiar' })[0]);

        await waitFor(() => {
            expect(currentLocationText()).toBe('/businesses');
        });

        await waitFor(() => {
            const lastCall = getLastGetAllParams();
            expect(lastCall).toEqual({
                page: 1,
                limit: 12,
            });
        });
    });

    it('applies the debounced search query and resets the page before the next fetch', async () => {
        renderBusinessesList('/businesses?page=3');

        expect((await screen.findAllByText('Cafe AquiTa')).length).toBeGreaterThan(0);

        const searchInput = screen.getByPlaceholderText('Buscar restaurantes, colmados o servicios');
        await userEvent.type(searchInput, 'brunch');

        expect(currentLocationText()).toBe('/businesses?page=3');

        await waitFor(() => {
            const locationText = currentLocationText();
            expect(locationText).toContain('search=brunch');
            expect(locationText).toContain('page=1');
        });

        await waitFor(() => {
            const lastCall = getLastGetAllParams();
            expect(lastCall).toMatchObject({
                search: 'brunch',
                page: 1,
                limit: 12,
            });
        });
    });

    it('persists the map view in the URL and renders the map container when toggled', async () => {
        renderBusinessesList('/businesses');

        expect((await screen.findAllByText('Cafe AquiTa')).length).toBeGreaterThan(0);

        await userEvent.click(screen.getByRole('button', { name: 'Mapa' }));

        await waitFor(() => {
            expect(currentLocationText()).toContain('view=map');
        });

        expect(await screen.findByText('Mapa sincronizado con el listado')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Lista' }));

        await waitFor(() => {
            expect(currentLocationText()).toBe('/businesses');
        });
    });
});
