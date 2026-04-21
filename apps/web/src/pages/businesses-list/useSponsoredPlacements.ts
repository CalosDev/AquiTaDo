import { useCallback, useEffect, useState } from 'react';
import { adsApi } from '../../api/endpoints';
import { getOrCreateVisitorId } from '../../lib/clientContext';
import type { SponsoredPlacement } from './types';

export function scheduleIdleTask(task: () => void): () => void {
    if (typeof window === 'undefined') {
        task();
        return () => undefined;
    }

    const idleWindow = window as Window & {
        requestIdleCallback?: (
            callback: IdleRequestCallback,
            options?: IdleRequestOptions,
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
        const callbackId = idleWindow.requestIdleCallback(() => {
            task();
        }, { timeout: 650 });

        return () => idleWindow.cancelIdleCallback?.(callbackId);
    }

    const timeoutId = window.setTimeout(task, 220);
    return () => window.clearTimeout(timeoutId);
}

type UseSponsoredPlacementsOptions = {
    businessesCount: number;
    currentCategory: string;
    currentProvince: string;
    loadError: string;
    loading: boolean;
    showSponsoredAds: boolean;
};

export function useSponsoredPlacements({
    businessesCount,
    currentCategory,
    currentProvince,
    loadError,
    loading,
    showSponsoredAds,
}: UseSponsoredPlacementsOptions) {
    const [sponsoredPlacements, setSponsoredPlacements] = useState<SponsoredPlacement[]>([]);
    const [sponsoredPlacementsLoading, setSponsoredPlacementsLoading] = useState(false);

    const resetSponsoredPlacements = useCallback(() => {
        setSponsoredPlacements([]);
        setSponsoredPlacementsLoading(false);
    }, []);

    useEffect(() => {
        if (!showSponsoredAds) {
            resetSponsoredPlacements();
            return;
        }

        if (loading || loadError || businessesCount === 0) {
            if (!loading && businessesCount === 0) {
                resetSponsoredPlacements();
            }
            return;
        }

        let active = true;
        setSponsoredPlacementsLoading(true);
        const cancelIdleTask = scheduleIdleTask(() => {
            void adsApi.getPlacements({
                provinceId: currentProvince || undefined,
                categoryId: currentCategory || undefined,
                limit: 3,
            })
                .then((response) => {
                    if (!active) {
                        return;
                    }
                    setSponsoredPlacements((response.data || []) as SponsoredPlacement[]);
                })
                .catch(() => {
                    if (!active) {
                        return;
                    }
                    setSponsoredPlacements([]);
                })
                .finally(() => {
                    if (active) {
                        setSponsoredPlacementsLoading(false);
                    }
                });
        });

        return () => {
            active = false;
            cancelIdleTask();
        };
    }, [
        businessesCount,
        currentCategory,
        currentProvince,
        loadError,
        loading,
        resetSponsoredPlacements,
        showSponsoredAds,
    ]);

    useEffect(() => {
        if (!showSponsoredAds || sponsoredPlacements.length === 0) {
            return;
        }

        const visitorId = getOrCreateVisitorId();
        sponsoredPlacements.forEach((placement) => {
            void adsApi.trackImpression(placement.campaign.id, {
                visitorId,
                placementKey: 'businesses-list',
            }).catch(() => undefined);
        });
    }, [showSponsoredAds, sponsoredPlacements]);

    return {
        resetSponsoredPlacements,
        sponsoredPlacements,
        sponsoredPlacementsLoading,
    };
}
