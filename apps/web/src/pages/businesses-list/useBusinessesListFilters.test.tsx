import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { useBusinessesListFilters } from './useBusinessesListFilters';

function createStaticWrapper(initialEntry: string) {
    return function StaticWrapper({ children }: { children: ReactNode }) {
        return (
            <MemoryRouter initialEntries={[initialEntry]}>
                <Routes>
                    <Route path="/businesses" element={<>{children}</>} />
                    <Route path="/negocios/intencion/:intentSlug" element={<>{children}</>} />
                    <Route path="/negocios/provincia/:provinceSlug" element={<>{children}</>} />
                    <Route path="/negocios/categoria/:categorySlug" element={<>{children}</>} />
                    <Route path="/negocios/:provinceSlug/:categorySlug" element={<>{children}</>} />
                </Routes>
            </MemoryRouter>
        );
    };
}

function createDynamicWrapper(initialEntry: string) {
    let renderedChildren: ReactNode;

    function HookSlot() {
        return <>{renderedChildren}</>;
    }

    const router = createMemoryRouter(
        [
            {
                path: '/businesses',
                element: <HookSlot />,
            },
            {
                path: '/negocios/intencion/:intentSlug',
                element: <HookSlot />,
            },
            {
                path: '/negocios/provincia/:provinceSlug',
                element: <HookSlot />,
            },
            {
                path: '/negocios/categoria/:categorySlug',
                element: <HookSlot />,
            },
            {
                path: '/negocios/:provinceSlug/:categorySlug',
                element: <HookSlot />,
            },
        ],
        {
            initialEntries: [initialEntry],
        },
    );

    const wrapper = ({ children }: { children: ReactNode }) => {
        renderedChildren = children;
        return <RouterProvider router={router} />;
    };

    return { router, wrapper };
}

describe('useBusinessesListFilters', () => {
    it('parses query params into current filter values and selected intentions', () => {
        const { result } = renderHook(() => useBusinessesListFilters(), {
            wrapper: createStaticWrapper('/businesses?search=cafe&categoryId=cat-1&provinceId=prov-1&cityId=city-1&sectorId=sector-1&feature=wifi&openNow=true&verified=true&latitude=18.4&longitude=-69.9&radiusKm=12&view=map&page=3'),
        });

        expect(result.current.currentSearch).toBe('cafe');
        expect(result.current.currentCategory).toBe('cat-1');
        expect(result.current.currentProvince).toBe('prov-1');
        expect(result.current.currentCity).toBe('city-1');
        expect(result.current.currentSector).toBe('sector-1');
        expect(result.current.currentFeature).toBe('wifi');
        expect(result.current.currentOpenNow).toBe(true);
        expect(result.current.currentVerified).toBe(true);
        expect(result.current.currentLatitude).toBe(18.4);
        expect(result.current.currentLongitude).toBe(-69.9);
        expect(result.current.currentRadiusKm).toBe(12);
        expect(result.current.currentView).toBe('map');
        expect(result.current.currentPage).toBe(3);
        expect(result.current.searchInput).toBe('cafe');
        expect(result.current.selectedIntentions).toEqual(['wifi-gratis', 'abierto-ahora', 'verificado']);
        expect(result.current.seoCanonicalPath).toBe('/businesses');
    });

    it('derives seo route params conservatively and falls back invalid numeric params', () => {
        const { result } = renderHook(() => useBusinessesListFilters(), {
            wrapper: createStaticWrapper('/negocios/santiago/restaurantes?page=-4&latitude=nope&longitude=&radiusKm=abc&view=cards'),
        });

        expect(result.current.categorySlug).toBe('restaurantes');
        expect(result.current.provinceSlug).toBe('santiago');
        expect(result.current.intentSlug).toBeUndefined();
        expect(result.current.currentLatitude).toBe(null);
        expect(result.current.currentLongitude).toBe(null);
        expect(result.current.currentRadiusKm).toBe(5);
        expect(result.current.currentView).toBe('list');
        expect(result.current.currentPage).toBe(1);
        expect(result.current.seoCanonicalPath).toBe('/negocios/santiago/restaurantes');
    });

    it('keeps searchInput mirrored with the current search query after navigation changes', async () => {
        const { router, wrapper } = createDynamicWrapper('/businesses?search=cafe');
        const { result } = renderHook(() => useBusinessesListFilters(), { wrapper });

        expect(result.current.currentSearch).toBe('cafe');
        expect(result.current.searchInput).toBe('cafe');

        await act(async () => {
            await router.navigate('/businesses?search=panaderia');
        });

        await waitFor(() => {
            expect(result.current.currentSearch).toBe('panaderia');
            expect(result.current.searchInput).toBe('panaderia');
        });
    });

    it('updates non-seo filters conservatively and lets dependent cleanup finish after province change', async () => {
        const { router, wrapper } = createDynamicWrapper('/businesses?provinceId=prov-1&cityId=city-1&sectorId=sector-1&page=3');
        const { result } = renderHook(() => useBusinessesListFilters(), { wrapper });

        act(() => {
            result.current.updateFilter('provinceId', 'prov-2');
        });

        await waitFor(() => {
            const params = new URLSearchParams(router.state.location.search);
            expect(router.state.location.pathname).toBe('/businesses');
            expect(params.get('provinceId')).toBe('prov-2');
            expect(params.get('cityId')).toBeNull();
            expect(params.get('sectorId')).toBeNull();
            expect(params.get('page')).toBe('1');
        });
    });

    it('breaks out of pinned seo routes when a pinned filter changes', async () => {
        const { router, wrapper } = createDynamicWrapper('/negocios/provincia/santiago?search=cafe&page=4');
        const { result } = renderHook(() => useBusinessesListFilters(), { wrapper });

        act(() => {
            result.current.updateFilter('provinceId', 'prov-2');
        });

        await waitFor(() => {
            const params = new URLSearchParams(router.state.location.search);
            expect(router.state.location.pathname).toBe('/businesses');
            expect(params.get('search')).toBe('cafe');
            expect(params.get('provinceId')).toBe('prov-2');
            expect(params.get('page')).toBe('1');
        });
    });

    it('clears all filters from both plain and seo routes while resetting searchInput', async () => {
        const plainRoute = createDynamicWrapper('/businesses?search=cafe&view=map&page=3');
        const plainResult = renderHook(() => useBusinessesListFilters(), { wrapper: plainRoute.wrapper });

        act(() => {
            plainResult.result.current.clearAllFilters();
        });

        await waitFor(() => {
            expect(plainRoute.router.state.location.pathname).toBe('/businesses');
            expect(plainRoute.router.state.location.search).toBe('');
            expect(plainResult.result.current.searchInput).toBe('');
        });

        const seoRoute = createDynamicWrapper('/negocios/intencion/con-delivery?search=cafe&page=3');
        const seoResult = renderHook(() => useBusinessesListFilters(), { wrapper: seoRoute.wrapper });

        act(() => {
            seoResult.result.current.clearAllFilters();
        });

        await waitFor(() => {
            expect(seoRoute.router.state.location.pathname).toBe('/businesses');
            expect(seoRoute.router.state.location.search).toBe('');
            expect(seoResult.result.current.searchInput).toBe('');
        });
    });

    it('manages view and geo params without changing unrelated query state', async () => {
        const { router, wrapper } = createDynamicWrapper('/businesses?search=cafe');
        const { result } = renderHook(() => useBusinessesListFilters(), { wrapper });

        act(() => {
            result.current.setViewMode('map');
        });

        await waitFor(() => {
            const params = new URLSearchParams(router.state.location.search);
            expect(params.get('search')).toBe('cafe');
            expect(params.get('view')).toBe('map');
        });

        act(() => {
            result.current.applyGeoFilter(18.4, -69.9, 12);
        });

        await waitFor(() => {
            const params = new URLSearchParams(router.state.location.search);
            expect(params.get('latitude')).toBe('18.4');
            expect(params.get('longitude')).toBe('-69.9');
            expect(params.get('radiusKm')).toBe('12');
            expect(params.get('page')).toBe('1');
            expect(params.get('view')).toBe('map');
            expect(params.get('search')).toBe('cafe');
        });

        act(() => {
            result.current.clearGeoFilter();
        });

        await waitFor(() => {
            const params = new URLSearchParams(router.state.location.search);
            expect(params.get('latitude')).toBeNull();
            expect(params.get('longitude')).toBeNull();
            expect(params.get('radiusKm')).toBeNull();
            expect(params.get('page')).toBe('1');
            expect(params.get('view')).toBe('map');
            expect(params.get('search')).toBe('cafe');
        });

        act(() => {
            result.current.setViewMode('list');
        });

        await waitFor(() => {
            const params = new URLSearchParams(router.state.location.search);
            expect(params.get('view')).toBeNull();
            expect(params.get('search')).toBe('cafe');
        });
    });
});
