import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Home } from './Home';
import { renderWithProviders } from '../test/renderWithProviders';

const pendingPromise = new Promise(() => undefined);

const endpointsMock = vi.hoisted(() => ({
    getAllCategories: vi.fn(() => pendingPromise),
    getAllBusinesses: vi.fn(() => pendingPromise),
    getProvinces: vi.fn(() => pendingPromise),
    getRankings: vi.fn(() => pendingPromise),
    prefetchPublicDetail: vi.fn(),
    prefetchDiscoveryLanding: vi.fn(),
    trackGrowthEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../api/endpoints', () => ({
    analyticsApi: {
        trackGrowthEvent: endpointsMock.trackGrowthEvent,
    },
    businessApi: {
        getAll: endpointsMock.getAllBusinesses,
        prefetchPublicDetail: endpointsMock.prefetchPublicDetail,
        prefetchDiscoveryLanding: endpointsMock.prefetchDiscoveryLanding,
    },
    categoryApi: {
        getAll: endpointsMock.getAllCategories,
    },
    locationApi: {
        getProvinces: endpointsMock.getProvinces,
    },
    reputationApi: {
        getRankings: endpointsMock.getRankings,
    },
}));

describe('Home editorial guidance', () => {
    it('renders the "Como funciona" section even while discovery data is loading', () => {
        renderWithProviders(<Home />, {
            isAuthenticated: false,
            user: null,
            router: { initialEntries: ['/'] },
        });

        expect(screen.getByRole('heading', { name: /como funciona aquita\.do/i })).toBeInTheDocument();
        expect(screen.getByText(/busca con intencion/i)).toBeInTheDocument();
        expect(screen.getByText(/compara senales reales/i)).toBeInTheDocument();
        expect(screen.getByText(/contacta con menos friccion/i)).toBeInTheDocument();
    });
});
