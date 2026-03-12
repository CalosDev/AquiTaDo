import {
    BusinessHourProfile,
    calculateBusinessProfileCompletenessScore,
} from '../businesses/business-profile';

type RankedCategory = {
    category?: {
        name?: string | null;
    } | null;
};

type RankedImage = {
    url: string;
    isCover?: boolean | null;
};

type RankedProvince = {
    name?: string | null;
};

type RankedCity = {
    name?: string | null;
};

type RankedSector = {
    name?: string | null;
};

export type DiscoveryRankingCandidate = {
    name: string;
    description?: string | null;
    address?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    website?: string | null;
    email?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    priceRange?: string | null;
    verified: boolean;
    reputationScore?: number | string | { toString(): string } | null;
    createdAt: Date | string;
    latitude?: number | null;
    longitude?: number | null;
    province?: RankedProvince | null;
    city?: RankedCity | null;
    sector?: RankedSector | null;
    categories?: RankedCategory[];
    images?: RankedImage[];
    hours?: BusinessHourProfile[];
    _count?: {
        reviews?: number;
    };
};

export type DiscoveryPopularitySignals = {
    views: number;
    clicks: number;
    reservationRequests: number;
};

export type DiscoveryRankingContext = {
    search?: string | null;
    lat?: number | null;
    lng?: number | null;
    radiusKm?: number | null;
};

export type DiscoveryRankingBreakdown = {
    queryMatch: number;
    verification: number;
    reputation: number;
    reviews: number;
    profileCompleteness: number;
    distance: number;
    popularity: number;
    recency: number;
    distanceKm: number | null;
};

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value: number | string | { toString(): string } | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: string | null | undefined): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function calculateQueryMatchScore(candidate: DiscoveryRankingCandidate, search: string | null | undefined): number {
    const normalizedSearch = normalizeText(search);
    if (!normalizedSearch) {
        return 0;
    }

    const normalizedName = normalizeText(candidate.name);
    const normalizedDescription = normalizeText(candidate.description);
    const normalizedAddress = normalizeText(candidate.address);
    const normalizedProvince = normalizeText(candidate.province?.name);
    const normalizedCity = normalizeText(candidate.city?.name);
    const categoryTexts = (candidate.categories ?? [])
        .map((row) => normalizeText(row.category?.name))
        .filter(Boolean);

    let score = 0;

    if (normalizedName === normalizedSearch) {
        score += 12;
    } else if (normalizedName.startsWith(normalizedSearch)) {
        score += 10;
    } else if (normalizedName.includes(normalizedSearch)) {
        score += 8;
    }

    if (categoryTexts.some((value) => value.includes(normalizedSearch))) {
        score += 4;
    }

    if (
        normalizedCity.includes(normalizedSearch)
        || normalizedProvince.includes(normalizedSearch)
        || normalizedAddress.includes(normalizedSearch)
    ) {
        score += 3;
    }

    if (normalizedDescription.includes(normalizedSearch)) {
        score += 2;
    }

    return clamp(score, 0, 12);
}

export function calculateBasicProfileCompleteness(candidate: DiscoveryRankingCandidate): number {
    return Math.round((calculateBusinessProfileCompletenessScore(candidate) / 5) * 100) / 100;
}

export function haversineDistanceKm(
    originLat: number,
    originLng: number,
    targetLat: number,
    targetLng: number,
): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(targetLat - originLat);
    const deltaLng = toRadians(targetLng - originLng);
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(toRadians(originLat)) * Math.cos(toRadians(targetLat)) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}

function calculateDistanceScore(distanceKm: number | null, radiusKm: number | null | undefined): number {
    if (distanceKm === null) {
        return 0;
    }

    const effectiveRadius = radiusKm && radiusKm > 0 ? radiusKm : 25;
    const normalized = clamp(1 - (distanceKm / effectiveRadius), 0, 1);
    return normalized * 14;
}

function calculatePopularityScore(signals: DiscoveryPopularitySignals): number {
    const viewsScore = (clamp(signals.views, 0, 500) / 500) * 4;
    const clicksScore = (clamp(signals.clicks, 0, 120) / 120) * 2;
    const reservationScore = (clamp(signals.reservationRequests, 0, 30) / 30) * 2;
    return viewsScore + clicksScore + reservationScore;
}

function calculateRecencyScore(createdAt: Date | string): number {
    const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (Number.isNaN(created.getTime())) {
        return 0;
    }

    const ageInDays = Math.max((Date.now() - created.getTime()) / (1000 * 60 * 60 * 24), 0);
    if (ageInDays <= 30) {
        return 4;
    }

    if (ageInDays <= 90) {
        return 2.5;
    }

    if (ageInDays <= 180) {
        return 1;
    }

    return 0;
}

export function calculateBusinessDiscoveryRelevance(
    candidate: DiscoveryRankingCandidate,
    context: DiscoveryRankingContext,
    popularitySignals: DiscoveryPopularitySignals = {
        views: 0,
        clicks: 0,
        reservationRequests: 0,
    },
): { score: number; breakdown: DiscoveryRankingBreakdown } {
    const queryMatch = calculateQueryMatchScore(candidate, context.search);
    const verification = candidate.verified ? 18 : 0;
    const reputationValue = toFiniteNumber(candidate.reputationScore) ?? 0;
    const reputation = (clamp(reputationValue, 0, 100) / 100) * 18;
    const reviewsCount = clamp(candidate._count?.reviews ?? 0, 0, 25);
    const reviews = (reviewsCount / 25) * 14;
    const profileCompleteness = calculateBasicProfileCompleteness(candidate);

    let distanceKm: number | null = null;
    if (
        typeof context.lat === 'number'
        && typeof context.lng === 'number'
        && typeof candidate.latitude === 'number'
        && typeof candidate.longitude === 'number'
    ) {
        distanceKm = haversineDistanceKm(context.lat, context.lng, candidate.latitude, candidate.longitude);
    }

    const distance = calculateDistanceScore(distanceKm, context.radiusKm);
    const popularity = calculatePopularityScore(popularitySignals);
    const recency = calculateRecencyScore(candidate.createdAt);

    const rawScore = queryMatch + verification + reputation + reviews + profileCompleteness + distance + popularity + recency;
    const score = Math.round(clamp(rawScore, 0, 100) * 100) / 100;

    return {
        score,
        breakdown: {
            queryMatch: Math.round(queryMatch * 100) / 100,
            verification: Math.round(verification * 100) / 100,
            reputation: Math.round(reputation * 100) / 100,
            reviews: Math.round(reviews * 100) / 100,
            profileCompleteness: Math.round(profileCompleteness * 100) / 100,
            distance: Math.round(distance * 100) / 100,
            popularity: Math.round(popularity * 100) / 100,
            recency: Math.round(recency * 100) / 100,
            distanceKm: distanceKm === null ? null : Math.round(distanceKm * 100) / 100,
        },
    };
}
