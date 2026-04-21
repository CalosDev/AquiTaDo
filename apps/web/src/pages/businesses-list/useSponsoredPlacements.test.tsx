import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSponsoredPlacements } from './useSponsoredPlacements';

const {
    getPlacements,
    trackImpression,
    getOrCreateVisitorId,
} = vi.hoisted(() => ({
    getPlacements: vi.fn(),
    trackImpression: vi.fn(),
    getOrCreateVisitorId: vi.fn(() => 'visitor-1'),
}));

vi.mock('../../api/endpoints', () => ({
    adsApi: {
        getPlacements,
        trackImpression,
    },
}));

vi.mock('../../lib/clientContext', () => ({
    getOrCreateVisitorId,
}));

describe('useSponsoredPlacements', () => {
    beforeEach(() => {
        getPlacements.mockReset();
        trackImpression.mockReset();
        getOrCreateVisitorId.mockClear();

        Object.defineProperty(window, 'requestIdleCallback', {
            configurable: true,
            writable: true,
            value: vi.fn((callback: IdleRequestCallback) => {
                callback({
                    didTimeout: false,
                    timeRemaining: () => 50,
                } as IdleDeadline);
                return 1;
            }),
        });

        Object.defineProperty(window, 'cancelIdleCallback', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads placements on idle and tracks impressions for the loaded campaigns', async () => {
        getPlacements.mockResolvedValue({
            data: [
                {
                    placementRank: 1,
                    campaign: {
                        id: 'campaign-1',
                        name: 'Campana destacada',
                        bidAmount: 10,
                        ctr: 3.2,
                    },
                    business: {
                        id: 'biz-1',
                        name: 'Cafe Central',
                        slug: 'cafe-central',
                    },
                },
            ],
        });
        trackImpression.mockResolvedValue({});

        const { result } = renderHook(() => useSponsoredPlacements({
            businessesCount: 3,
            currentCategory: 'cat-1',
            currentProvince: 'prov-1',
            loadError: '',
            loading: false,
            showSponsoredAds: true,
        }));

        await waitFor(() => {
            expect(getPlacements).toHaveBeenCalledWith({
                provinceId: 'prov-1',
                categoryId: 'cat-1',
                limit: 3,
            });
        });

        await waitFor(() => {
            expect(result.current.sponsoredPlacements).toHaveLength(1);
        });

        await waitFor(() => {
            expect(trackImpression).toHaveBeenCalledWith('campaign-1', {
                visitorId: 'visitor-1',
                placementKey: 'businesses-list',
            });
        });

        expect(result.current.sponsoredPlacementsLoading).toBe(false);
    });

    it('skips the placements request when sponsored ads are disabled', async () => {
        renderHook(() => useSponsoredPlacements({
            businessesCount: 3,
            currentCategory: 'cat-1',
            currentProvince: 'prov-1',
            loadError: '',
            loading: false,
            showSponsoredAds: false,
        }));

        await waitFor(() => {
            expect(getPlacements).not.toHaveBeenCalled();
        });
        expect(trackImpression).not.toHaveBeenCalled();
    });
});
