import type { BusinessHourEntry } from '../../lib/businessProfile';

export interface BusinessCategoryEntry {
    category: {
        name: string;
        icon?: string;
        parent?: { name: string } | null;
    };
}

export interface BusinessFeatureEntry {
    feature: {
        name: string;
    };
}

export interface BusinessImageEntry {
    id: string;
    url: string;
    caption?: string | null;
    isCover?: boolean;
    type?: string;
}

export interface Business {
    id: string;
    name: string;
    slug: string;
    createdAt?: string;
    updatedAt?: string;
    description: string;
    phone?: string;
    whatsapp?: string;
    website?: string | null;
    email?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    priceRange?: string | null;
    address: string;
    latitude?: number;
    longitude?: number;
    verified: boolean;
    publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
    claimStatus?: 'UNCLAIMED' | 'PENDING_CLAIM' | 'CLAIMED';
    source?: 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
    isClaimable?: boolean;
    openNow?: boolean | null;
    todayHoursLabel?: string | null;
    profileCompletenessScore?: number;
    reputationScore?: number | string | null;
    province?: { name: string };
    city?: { name: string };
    sector?: { name: string } | null;
    images: BusinessImageEntry[];
    categories?: BusinessCategoryEntry[];
    features?: BusinessFeatureEntry[];
    hours?: BusinessHourEntry[];
    reviews?: {
        id: string;
        rating: number;
        comment?: string;
        user: { name: string };
        createdAt: string;
    }[];
    _count?: { reviews: number };
    owner?: { name: string };
}

export interface ReviewEntry {
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
    user: {
        id?: string;
        name: string;
    };
}

export interface PublicPromotion {
    id: string;
    title: string;
    description?: string | null;
    discountType: 'PERCENTAGE' | 'FIXED';
    discountValue: string | number;
    couponCode?: string | null;
    endsAt: string;
    isFlashOffer?: boolean;
}

export interface NearbyBusiness {
    id: string;
    name: string;
    slug: string;
    address?: string;
    distance?: number | string | null;
}

export interface CheckInStats {
    businessId: string;
    totalCheckIns: number;
    last24HoursCheckIns: number;
    verifiedCheckIns: number;
    uniqueUsers: number;
}

export interface ReputationProfile {
    business: {
        id: string;
        reputationScore: number;
        reputationTier: 'BRONZE' | 'SILVER' | 'GOLD';
        verified: boolean;
        verifiedAt?: string | null;
    };
    metrics: {
        averageRating: number;
        reviewCount: number;
        bookings: {
            completed: number;
            confirmed: number;
            pending: number;
            canceled: number;
            noShow: number;
        };
        successfulTransactions: number;
        grossRevenue: number;
    };
}

export interface FavoriteList {
    id: string;
    name: string;
}

export interface ReviewFormState {
    rating: number;
    comment: string;
}

export interface MessageFormState {
    subject: string;
    content: string;
}

export interface BookingFormState {
    scheduledFor: string;
    partySize: string;
    notes: string;
}

export interface PublicLeadFormState {
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    message: string;
}

export type ContactPlacement = 'sidebar_card' | 'sidebar_primary' | 'sticky_mobile' | 'public_lead_form';
