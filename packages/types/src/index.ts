// ============================================================
// AquiTa.do — Shared Type Definitions
// ============================================================

// ---- Enums ----
export enum Role {
    USER = 'USER',
    BUSINESS_OWNER = 'BUSINESS_OWNER',
    ADMIN = 'ADMIN',
}

// ---- User ----
export interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: Role;
    createdAt: string;
    updatedAt: string;
}

export interface CreateUserDto {
    name: string;
    email: string;
    password: string;
    phone?: string;
}

export interface LoginDto {
    email: string;
    password: string;
}

export interface AuthResponse {
    accessToken: string;
    user: User;
}

// ---- Business ----
export interface Business {
    id: string;
    name: string;
    slug: string;
    description: string;
    phone?: string;
    whatsapp?: string;
    address: string;
    provinceId: string;
    cityId?: string;
    latitude?: number;
    longitude?: number;
    ownerId: string;
    verified: boolean;
    createdAt: string;
    province?: Province;
    city?: City;
    categories?: Category[];
    images?: BusinessImage[];
    reviews?: Review[];
    features?: Feature[];
    owner?: User;
    _count?: {
        reviews: number;
    };
    averageRating?: number;
}

export interface CreateBusinessDto {
    name: string;
    description: string;
    phone?: string;
    whatsapp?: string;
    address: string;
    provinceId: string;
    cityId?: string;
    latitude?: number;
    longitude?: number;
    categoryIds?: string[];
    featureIds?: string[];
}

export interface UpdateBusinessDto extends Partial<CreateBusinessDto> { }

// ---- Category ----
export interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
}

// ---- Province & City ----
export interface Province {
    id: string;
    name: string;
    slug: string;
    cities?: City[];
}

export interface City {
    id: string;
    name: string;
    provinceId: string;
    province?: Province;
}

// ---- Review ----
export interface Review {
    id: string;
    rating: number;
    comment?: string;
    userId: string;
    businessId: string;
    createdAt: string;
    user?: User;
}

export interface CreateReviewDto {
    rating: number;
    comment?: string;
    businessId: string;
}

// ---- Business Image ----
export interface BusinessImage {
    id: string;
    url: string;
    businessId: string;
}

// ---- Feature ----
export interface Feature {
    id: string;
    name: string;
}

// ---- Pagination ----
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ---- Query Params ----
export interface BusinessQueryParams {
    search?: string;
    categoryId?: string;
    provinceId?: string;
    cityId?: string;
    verified?: boolean;
    page?: number;
    limit?: number;
    lat?: number;
    lng?: number;
    radius?: number;
}

// ---- API Response ----
export interface ApiResponse<T> {
    success: boolean;
    data: T;
    message?: string;
}

export interface ApiError {
    statusCode: number;
    message: string;
    error?: string;
}
