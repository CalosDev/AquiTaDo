import type { MouseEvent } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { favoritesApi } from '../../api/endpoints';

type UseFavoriteBusinessesOptions = {
    isAuthenticated: boolean;
    isCustomerRole: boolean;
};

export function useFavoriteBusinesses({
    isAuthenticated,
    isCustomerRole,
}: UseFavoriteBusinessesOptions) {
    const [favoriteBusinessIds, setFavoriteBusinessIds] = useState<Set<string>>(new Set());
    const [favoriteProcessingId, setFavoriteProcessingId] = useState<string | null>(null);

    useEffect(() => {
        if (!isAuthenticated || !isCustomerRole) {
            setFavoriteBusinessIds(new Set());
            return;
        }

        let active = true;
        void favoritesApi.getFavoriteBusinesses({ limit: 100 })
            .then((response) => {
                if (!active) {
                    return;
                }
                const ids = new Set<string>(
                    ((response.data?.data ?? []) as Array<{ businessId: string }>).map((item) => item.businessId),
                );
                setFavoriteBusinessIds(ids);
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [isAuthenticated, isCustomerRole]);

    const handleToggleFavorite = useCallback(async (event: MouseEvent<HTMLButtonElement>, businessId: string) => {
        event.preventDefault();
        event.stopPropagation();

        if (!isAuthenticated || !isCustomerRole) {
            return;
        }

        setFavoriteProcessingId(businessId);
        try {
            const response = await favoritesApi.toggleFavoriteBusiness({ businessId });
            const nextFavorite = Boolean(response.data?.favorite);

            setFavoriteBusinessIds((previous) => {
                const next = new Set(previous);
                if (nextFavorite) {
                    next.add(businessId);
                } else {
                    next.delete(businessId);
                }
                return next;
            });
        } catch {
            // Keep list flow stable even if favorites call fails.
        } finally {
            setFavoriteProcessingId(null);
        }
    }, [isAuthenticated, isCustomerRole]);

    return {
        favoriteBusinessIds,
        favoriteProcessingId,
        handleToggleFavorite,
    };
}
