import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFavoriteBusinesses } from './useFavoriteBusinesses';

const {
    getFavoriteBusinesses,
    toggleFavoriteBusiness,
} = vi.hoisted(() => ({
    getFavoriteBusinesses: vi.fn(),
    toggleFavoriteBusiness: vi.fn(),
}));

vi.mock('../../api/endpoints', () => ({
    favoritesApi: {
        getFavoriteBusinesses,
        toggleFavoriteBusiness,
    },
}));

describe('useFavoriteBusinesses', () => {
    beforeEach(() => {
        getFavoriteBusinesses.mockReset();
        toggleFavoriteBusiness.mockReset();
    });

    afterEach(() => {
        cleanup();
    });

    it('loads favorite business ids for authenticated customers', async () => {
        getFavoriteBusinesses.mockResolvedValue({
            data: {
                data: [
                    { businessId: 'biz-1' },
                    { businessId: 'biz-2' },
                ],
            },
        });

        const { result } = renderHook(() => useFavoriteBusinesses({
            isAuthenticated: true,
            isCustomerRole: true,
        }));

        await waitFor(() => {
            expect(Array.from(result.current.favoriteBusinessIds)).toEqual(['biz-1', 'biz-2']);
        });
        expect(getFavoriteBusinesses).toHaveBeenCalledWith({ limit: 100 });
    });

    it('skips the initial favorites request for guests', async () => {
        const { result } = renderHook(() => useFavoriteBusinesses({
            isAuthenticated: false,
            isCustomerRole: false,
        }));

        await waitFor(() => {
            expect(result.current.favoriteBusinessIds.size).toBe(0);
        });
        expect(getFavoriteBusinesses).not.toHaveBeenCalled();
    });

    it('toggles a business favorite while keeping the button event isolated', async () => {
        getFavoriteBusinesses.mockResolvedValue({
            data: {
                data: [],
            },
        });
        let resolveToggle: ((value: { data: { favorite: boolean } }) => void) | null = null;
        toggleFavoriteBusiness.mockImplementation(() => new Promise((resolve) => {
            resolveToggle = resolve;
        }));

        const { result } = renderHook(() => useFavoriteBusinesses({
            isAuthenticated: true,
            isCustomerRole: true,
        }));

        await waitFor(() => {
            expect(getFavoriteBusinesses).toHaveBeenCalledTimes(1);
        });

        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        let togglePromise: Promise<void> | undefined;
        act(() => {
            togglePromise = result.current.handleToggleFavorite({
                preventDefault,
                stopPropagation,
            } as unknown as React.MouseEvent<HTMLButtonElement>, 'biz-3');
        });

        expect(result.current.favoriteProcessingId).toBe('biz-3');

        await act(async () => {
            resolveToggle?.({
                data: {
                    favorite: true,
                },
            });
            await togglePromise;
        });

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(stopPropagation).toHaveBeenCalledTimes(1);
        expect(toggleFavoriteBusiness).toHaveBeenCalledWith({ businessId: 'biz-3' });
        expect(result.current.favoriteBusinessIds.has('biz-3')).toBe(true);
        expect(result.current.favoriteProcessingId).toBe(null);
    });
});
