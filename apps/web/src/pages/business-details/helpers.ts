import type { BusinessFeatureEntry, BusinessImageEntry } from './types';

export async function getCurrentLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return null;
    }

    return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) =>
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }),
            () => resolve(null),
            {
                enableHighAccuracy: false,
                timeout: 5000,
                maximumAge: 60_000,
            },
        );
    });
}

export function formatDaysAgo(value?: string): string | null {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const days = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / (1000 * 60 * 60 * 24)));
    if (days === 0) {
        return 'Actualizado hoy';
    }
    if (days === 1) {
        return 'Actualizado hace 1 dia';
    }
    return `Actualizado hace ${days} dias`;
}

export function tierLabel(tier: 'BRONZE' | 'SILVER' | 'GOLD'): string {
    if (tier === 'GOLD') {
        return 'Oro';
    }
    if (tier === 'SILVER') {
        return 'Plata';
    }
    return 'Bronce';
}

export function formatCurrencyDop(value: number): string {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP',
        maximumFractionDigits: 0,
    }).format(value);
}

export function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function getDisplayInitial(value: string | undefined): string {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
        return '?';
    }

    return normalized.charAt(0).toUpperCase();
}

export function findPreferredGalleryIndex(images: BusinessImageEntry[]): number {
    if (images.length === 0) {
        return 0;
    }

    const coverIndex = images.findIndex((image) => image.isCover);
    return coverIndex >= 0 ? coverIndex : 0;
}

export interface HeroGalleryEntry {
    index: number;
    image: BusinessImageEntry;
}

export interface HeroGalleryState {
    lead: HeroGalleryEntry | null;
    previews: HeroGalleryEntry[];
    remainingCount: number;
}

export function buildHeroGallery(
    images: BusinessImageEntry[],
    activeIndex: number,
    maxPreviewCount = 3,
): HeroGalleryState {
    if (images.length === 0) {
        return {
            lead: null,
            previews: [],
            remainingCount: 0,
        };
    }

    const safeIndex = Math.min(Math.max(activeIndex, 0), images.length - 1);
    const lead: HeroGalleryEntry = {
        index: safeIndex,
        image: images[safeIndex],
    };
    const previews = images
        .map((image, index) => ({ index, image }))
        .filter((entry) => entry.index !== safeIndex)
        .slice(0, maxPreviewCount);

    return {
        lead,
        previews,
        remainingCount: Math.max(0, images.length - 1 - previews.length),
    };
}

export function renderStars(rating: number): string {
    const normalized = Math.max(0, Math.min(5, Math.round(rating)));
    return `${'★'.repeat(normalized)}${'☆'.repeat(5 - normalized)}`;
}

const FILLED_STAR = '★';
const EMPTY_STAR = '☆';

export function renderStarsSafe(rating: number): string {
    const normalized = Math.max(0, Math.min(5, Math.round(rating)));
    return `${FILLED_STAR.repeat(normalized)}${EMPTY_STAR.repeat(5 - normalized)}`;
}

const BOOKING_FEATURE_CANONICAL = 'reservaciones';

export function businessSupportsBooking(features?: BusinessFeatureEntry[]): boolean {
    if (!features || features.length === 0) {
        return false;
    }

    return features.some((entry) => normalizeText(entry.feature.name) === BOOKING_FEATURE_CANONICAL);
}
