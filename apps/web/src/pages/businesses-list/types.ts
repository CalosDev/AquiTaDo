export interface Business {
    id: string;
    name: string;
    slug: string;
    description: string;
    address: string;
    verified: boolean;
    openNow?: boolean | null;
    todayHoursLabel?: string | null;
    profileCompletenessScore?: number;
    latitude?: number | null;
    longitude?: number | null;
    priceRange?: string | null;
    reputationScore?: number | string | null;
    relevanceScore?: number | null;
    distanceKm?: number | null;
    province?: { name: string };
    city?: { name: string } | null;
    sector?: { id: string; name: string } | null;
    images: { url: string }[];
    categories?: { category: { name: string; icon?: string; parent?: { name: string } | null } }[];
    _count?: { reviews: number };
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    parentId?: string | null;
    parent?: { id: string; name: string } | null;
    children?: Array<{ id: string }>;
}

export interface Province {
    id: string;
    name: string;
    slug: string;
}

export interface City {
    id: string;
    name: string;
}

export interface Sector {
    id: string;
    name: string;
}

export interface SponsoredPlacement {
    placementRank: number;
    campaign: {
        id: string;
        name: string;
        bidAmount: number;
        ctr: number;
    };
    business: {
        id: string;
        name: string;
        slug: string;
        province?: { name: string };
        city?: { name: string };
        categories?: { name: string; icon?: string }[];
    };
}

export type ListingViewMode = 'list' | 'map';
