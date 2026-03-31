import {
    createDefaultBusinessHours,
    type BusinessHourEntry,
} from '../../lib/businessProfile';

export interface Category {
    id: string;
    name: string;
    icon?: string;
    parentId?: string | null;
    parent?: { id: string; name: string } | null;
    children?: Array<{ id: string }>;
}

export interface Feature {
    id: string;
    name: string;
}

export interface Province {
    id: string;
    name: string;
}

export interface City {
    id: string;
    name: string;
}

export interface Sector {
    id: string;
    name: string;
}

export interface BusinessImage {
    id: string;
    url: string;
    caption?: string | null;
    sortOrder?: number;
    isCover?: boolean;
    type?: 'COVER' | 'GALLERY' | 'MENU' | 'INTERIOR' | 'EXTERIOR';
}

export interface BusinessDetail {
    id: string;
    slug: string;
    name: string;
    description: string;
    phone?: string | null;
    whatsapp?: string | null;
    website?: string | null;
    email?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    priceRange?: string | null;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    province?: { id: string; name: string } | null;
    city?: { id: string; name: string } | null;
    sector?: { id: string; name: string } | null;
    categories?: Array<{ category: { id: string; name: string; icon?: string; parent?: { name: string } | null } }>;
    features?: Array<{ feature: { id: string; name: string } }>;
    images?: BusinessImage[];
    hours?: BusinessHourEntry[];
    profileCompletenessScore?: number;
}

export interface EditFormData {
    name: string;
    description: string;
    phone: string;
    whatsapp: string;
    website: string;
    email: string;
    instagramUrl: string;
    facebookUrl: string;
    tiktokUrl: string;
    priceRange: string;
    address: string;
    provinceId: string;
    cityId: string;
    sectorId: string;
    latitude: string;
    longitude: string;
    categoryIds: string[];
    featureIds: string[];
    hours: BusinessHourEntry[];
}

export const EMPTY_FORM: EditFormData = {
    name: '',
    description: '',
    phone: '',
    whatsapp: '',
    website: '',
    email: '',
    instagramUrl: '',
    facebookUrl: '',
    tiktokUrl: '',
    priceRange: '',
    address: '',
    provinceId: '',
    cityId: '',
    sectorId: '',
    latitude: '',
    longitude: '',
    categoryIds: [],
    featureIds: [],
    hours: createDefaultBusinessHours(),
};
