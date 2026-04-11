import type { AxiosResponse } from 'axios';
import api, { getAccessToken } from './client';

const REFERENCE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_DISCOVERY_TTL_MS = 90 * 1000;
const PUBLIC_NEARBY_TTL_MS = 60 * 1000;
const PUBLIC_DETAIL_TTL_MS = 120 * 1000;
const ADMIN_INSIGHTS_TTL_MS = 15 * 1000;

type CachedRequest<T = AxiosResponse> = {
    promise: Promise<T>;
    expiresAt: number;
};

let categoriesCache: CachedRequest | null = null;
let featuresCache: CachedRequest | null = null;
let provincesCache: CachedRequest | null = null;
const citiesCacheByProvince = new Map<string, CachedRequest>();
const sectorsCacheByCity = new Map<string, CachedRequest>();
const discoveryCacheByKey = new Map<string, CachedRequest>();
const nearbyCacheByKey = new Map<string, CachedRequest>();
const publicDetailCacheByKey = new Map<string, CachedRequest>();
const observabilitySummaryCacheByKey = new Map<string, CachedRequest>();
const healthDashboardCacheByKey = new Map<string, CachedRequest>();

function resolveCachedRequest<T>(
    cacheEntry: CachedRequest<T> | null,
    fetcher: () => Promise<T>,
    ttlMs: number = REFERENCE_TTL_MS,
): CachedRequest<T> {
    if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
        return cacheEntry;
    }

    const nextEntry: CachedRequest<T> = {
        expiresAt: Date.now() + ttlMs,
        promise: fetcher(),
    };
    nextEntry.promise = nextEntry.promise.catch((error) => {
        nextEntry.expiresAt = 0;
        throw error;
    });

    return nextEntry;
}

function sortRecordEntries(
    value: Record<string, string | number | boolean> | undefined,
): Array<[string, string | number | boolean]> {
    return Object.entries(value ?? {})
        .filter(([, entryValue]) => entryValue !== '' && entryValue !== undefined && entryValue !== null)
        .sort(([left], [right]) => left.localeCompare(right));
}

function buildCacheKey(
    prefix: string,
    value?: Record<string, string | number | boolean> | string,
): string {
    if (typeof value === 'string') {
        return `${prefix}:${value}`;
    }

    const searchParams = new URLSearchParams();
    for (const [entryKey, entryValue] of sortRecordEntries(value)) {
        searchParams.set(entryKey, String(entryValue));
    }

    return `${prefix}:${searchParams.toString() || 'default'}`;
}

function resolveMappedCachedRequest<T>(
    cache: Map<string, CachedRequest<T>>,
    cacheKey: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
): Promise<T> {
    const nextEntry = resolveCachedRequest(cache.get(cacheKey) ?? null, fetcher, ttlMs);
    cache.set(cacheKey, nextEntry);

    if (cache.size > 40) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }

    return nextEntry.promise;
}

function clearMappedCache(cache: Map<string, CachedRequest>): void {
    cache.clear();
}

function shouldUsePublicDetailCache(): boolean {
    return !getAccessToken();
}

function resetBusinessDiscoveryCaches(): void {
    clearMappedCache(discoveryCacheByKey);
    clearMappedCache(nearbyCacheByKey);
    clearMappedCache(publicDetailCacheByKey);
}

// ---- Auth ----
export const authApi = {
    register: (data: { name: string; email: string; password: string; phone?: string; role?: 'USER' | 'BUSINESS_OWNER' }) =>
        api.post('/auth/register', data),
    login: (data: { email: string; password: string; twoFactorCode?: string }) =>
        api.post('/auth/login', data),
    loginWithGoogle: (data: { idToken: string; role?: 'USER' | 'BUSINESS_OWNER'; twoFactorCode?: string }) =>
        api.post('/auth/google', data),
    requestPasswordReset: (data: { email: string }) =>
        api.post('/auth/forgot-password', data),
    resetPassword: (data: { token: string; newPassword: string }) =>
        api.post('/auth/reset-password', data),
    refresh: () => api.post('/auth/refresh', {}),
    logout: () => api.post('/auth/logout', {}),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
        api.post('/auth/change-password', data),
    getProfile: () => api.get('/users/me'),
    getTwoFactorStatus: () => api.get('/auth/2fa/status'),
    setupTwoFactor: () => api.post('/auth/2fa/setup', {}),
    enableTwoFactor: (data: { code: string }) => api.post('/auth/2fa/enable', data),
    disableTwoFactor: (data: { code: string }) => api.post('/auth/2fa/disable', data),
};

// ---- Users ----
export const usersApi = {
    getMyProfileDetails: () => api.get('/users/me/profile'),
    updateMyProfile: (data: { name?: string; phone?: string }) =>
        api.patch('/users/me', data),
};

// ---- Businesses ----
export const businessApi = {
    getAll: (params?: Record<string, string | number | boolean>) =>
        resolveMappedCachedRequest(
            discoveryCacheByKey,
            buildCacheKey('public-businesses', params),
            PUBLIC_DISCOVERY_TTL_MS,
            () => api.get('/businesses', { params }),
        ),
    prefetchDiscoveryLanding: () => {
        void Promise.allSettled([
            businessApi.getAll({ page: 1, limit: 12 }),
            categoryApi.getAll(),
            locationApi.getProvinces(),
        ]);
    },
    getMine: () => api.get('/businesses/my'),
    getAllAdmin: (params?: Record<string, string | number | boolean>) =>
        api.get('/businesses/admin/all', { params }),
    getCatalogQuality: (params?: { limit?: number }) =>
        api.get('/businesses/admin/catalog-quality', { params }),
    claimSearch: (params: {
        q: string;
        provinceId?: string;
        cityId?: string;
        sectorId?: string;
        address?: string;
        phone?: string;
        whatsapp?: string;
        website?: string;
        instagramUrl?: string;
        latitude?: number;
        longitude?: number;
        categoryIds?: string;
        limit?: number;
    }) =>
        api.get('/businesses/claim-search', { params }),
    getClaimRequestsAdmin: (params?: { status?: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELED'; limit?: number }) =>
        api.get('/businesses/admin/claim-requests', { params }),
    getDuplicateCasesAdmin: (params?: { status?: 'MERGED' | 'DISMISSED' | 'CONFLICT'; limit?: number }) =>
        api.get('/businesses/admin/duplicate-cases', { params }),
    reviewClaimRequestAdmin: (
        claimRequestId: string,
        data: { status: 'APPROVED' | 'REJECTED'; notes?: string },
    ) => api.post(`/businesses/admin/claim-requests/${claimRequestId}/review`, data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    createAdminCatalog: (data: Record<string, unknown>) => api.post('/businesses/admin/catalog', data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    resolveDuplicateCaseAdmin: (data: {
        status: 'MERGED' | 'DISMISSED' | 'CONFLICT';
        businessIds: string[];
        primaryBusinessId?: string;
        reasons?: string[];
        notes?: string;
    }) => api.post('/businesses/admin/duplicate-cases/resolve', data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    getOwnershipHistoryAdmin: (businessId: string, params?: { limit?: number }) =>
        api.get(`/businesses/admin/${businessId}/ownership-history`, { params }),
    revokeOwnershipAdmin: (businessId: string, ownershipId: string, data: { reason: string }) =>
        api.post(`/businesses/admin/${businessId}/ownerships/${ownershipId}/revoke`, data).then((response) => {
            resetBusinessDiscoveryCaches();
            return response;
        }),
    getByIdentifier: (identifier: string) => (
        shouldUsePublicDetailCache()
            ? resolveMappedCachedRequest(
                publicDetailCacheByKey,
                buildCacheKey('public-business-detail-identifier', identifier),
                PUBLIC_DETAIL_TTL_MS,
                () => api.get(`/businesses/${identifier}`),
            )
            : api.get(`/businesses/${identifier}`)
    ),
    getById: (id: string) => api.get(`/businesses/${id}`),
    getBySlug: (slug: string) => (
        shouldUsePublicDetailCache()
            ? resolveMappedCachedRequest(
                publicDetailCacheByKey,
                buildCacheKey('public-business-detail-slug', slug),
                PUBLIC_DETAIL_TTL_MS,
                () => api.get(`/businesses/${slug}`),
            )
            : api.get(`/businesses/${slug}`)
    ),
    prefetchPublicDetail: (params: { slug?: string | null; id?: string | null }) => {
        const slug = params.slug?.trim();
        const id = params.id?.trim();

        if (slug) {
            void businessApi.getBySlug(slug).catch(() => {
                if (id) {
                    return businessApi.getByIdentifier(id);
                }
                return undefined;
            });
            return;
        }

        if (id) {
            void businessApi.getByIdentifier(id).catch(() => undefined);
        }
    },
    createPublicLead: (
        businessId: string,
        data: {
            contactName: string;
            contactPhone: string;
            contactEmail?: string;
            message: string;
            preferredChannel?: 'WHATSAPP' | 'PHONE' | 'EMAIL';
        },
    ) => api.post(`/businesses/${businessId}/public-lead`, data),
    createClaimRequest: (
        businessId: string,
        data: {
            evidenceType: 'PHONE' | 'EMAIL' | 'WEBSITE' | 'INSTAGRAM' | 'DOCUMENT' | 'NOTE' | 'OTHER';
            evidenceValue?: string;
            notes?: string;
        },
    ) => api.post(`/businesses/${businessId}/claim-requests`, data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    create: (data: Record<string, unknown>) => api.post('/businesses', data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    update: (id: string, data: Record<string, unknown>) => api.put(`/businesses/${id}`, data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    delete: (id: string, data: { reason: string }) => api.delete(`/businesses/${id}`, { data }).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
    getNearby: (params: { lat: number; lng: number; radius?: number; categoryId?: string; sectorId?: string }) =>
        resolveMappedCachedRequest(
            nearbyCacheByKey,
            buildCacheKey('public-businesses-nearby', params),
            PUBLIC_NEARBY_TTL_MS,
            () => api.get('/businesses/nearby', { params }),
        ),
    verify: (id: string) => api.put(`/businesses/${id}/verify`).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
};

export const businessSuggestionApi = {
    create: (data: {
        name: string;
        description?: string;
        categoryId?: string;
        address: string;
        provinceId: string;
        cityId?: string;
        phone?: string;
        whatsapp?: string;
        website?: string;
        email?: string;
        notes?: string;
    }) => api.post('/business-suggestions', data),
    getMine: (params?: { status?: 'PENDING' | 'APPROVED' | 'REJECTED'; limit?: number }) =>
        api.get('/business-suggestions/my', { params }),
    getAdmin: (params?: { status?: 'PENDING' | 'APPROVED' | 'REJECTED'; limit?: number }) =>
        api.get('/business-suggestions/admin', { params }),
    reviewAdmin: (
        suggestionId: string,
        data: {
            status: 'APPROVED' | 'REJECTED';
            notes?: string;
            publicStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
            ignorePotentialDuplicates?: boolean;
        },
    ) => api.post(`/business-suggestions/admin/${suggestionId}/review`, data).then((response) => {
        resetBusinessDiscoveryCaches();
        return response;
    }),
};

// ---- Categories ----
export const categoryApi = {
    getAll: () => {
        categoriesCache = resolveCachedRequest(
            categoriesCache,
            () => api.get('/categories'),
        );
        return categoriesCache.promise;
    },
    create: (data: { name: string; slug: string; icon?: string; parentId?: string }) =>
        api.post('/categories', data).then((response) => {
            categoriesCache = null;
            return response;
        }),
    update: (id: string, data: { name?: string; slug?: string; icon?: string; parentId?: string | null }) =>
        api.put(`/categories/${id}`, data).then((response) => {
            categoriesCache = null;
            return response;
        }),
    delete: (id: string) => api.delete(`/categories/${id}`).then((response) => {
        categoriesCache = null;
        return response;
    }),
};

// ---- Features ----
export const featuresApi = {
    getAll: () => {
        featuresCache = resolveCachedRequest(
            featuresCache,
            () => api.get('/features'),
        );
        return featuresCache.promise;
    },
};

// ---- Locations ----
export const locationApi = {
    getProvinces: () => {
        provincesCache = resolveCachedRequest(
            provincesCache,
            () => api.get('/provinces'),
        );
        return provincesCache.promise;
    },
    getCities: (provinceId: string) => {
        const cached = resolveCachedRequest(
            citiesCacheByProvince.get(provinceId) ?? null,
            () => api.get(`/provinces/${provinceId}/cities`),
        );
        citiesCacheByProvince.set(provinceId, cached);
        return cached.promise;
    },
    getSectors: (cityId: string) => {
        const cached = resolveCachedRequest(
            sectorsCacheByCity.get(cityId) ?? null,
            () => api.get(`/cities/${cityId}/sectors`),
        );
        sectorsCacheByCity.set(cityId, cached);
        return cached.promise;
    },
};

// ---- Reviews ----
export const reviewApi = {
    create: (data: { rating: number; comment?: string; businessId: string }) =>
        api.post('/reviews', data),
    getByBusiness: (businessId: string) => api.get(`/reviews/business/${businessId}`),
    getFlagged: (params?: { limit?: number; businessId?: string }) =>
        api.get('/reviews/moderation/flagged', { params }),
    moderate: (
        reviewId: string,
        data: { status: 'APPROVED' | 'FLAGGED'; reason?: string },
    ) => api.patch(`/reviews/${reviewId}/moderation`, data),
};

// ---- Uploads ----
export const uploadApi = {
    uploadAvatar: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post('/upload/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    deleteAvatar: () =>
        api.delete('/upload/avatar'),
    uploadBusinessImage: (businessId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('businessId', businessId);
        return api.post('/upload/business-image', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    deleteBusinessImage: (imageId: string) =>
        api.delete(`/upload/business-image/${imageId}`),
    updateBusinessImage: (
        imageId: string,
        data: {
            caption?: string | null;
            sortOrder?: number;
            isCover?: boolean;
            type?: 'COVER' | 'GALLERY' | 'MENU' | 'INTERIOR' | 'EXTERIOR';
        },
    ) => api.patch(`/upload/business-image/${imageId}`, data),
};

// ---- Organizations ----
export const organizationApi = {
    getMine: () => api.get('/organizations/mine'),
    create: (data: { name: string }) => api.post('/organizations', data),
    getById: (organizationId: string) => api.get(`/organizations/${organizationId}`),
    update: (organizationId: string, data: { name?: string }) =>
        api.patch(`/organizations/${organizationId}`, data),
    getSubscription: (organizationId: string) =>
        api.get(`/organizations/${organizationId}/subscription`),
    updateSubscription: (
        organizationId: string,
        data: {
            plan: 'FREE' | 'GROWTH' | 'SCALE';
            subscriptionStatus?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
            subscriptionRenewsAt?: string;
        },
    ) => api.patch(`/organizations/${organizationId}/subscription`, data),
    getUsage: (organizationId: string) => api.get(`/organizations/${organizationId}/usage`),
    getAuditLogs: (organizationId: string, params?: { limit?: number }) =>
        api.get(`/organizations/${organizationId}/audit-logs`, { params }),
    getMembers: (organizationId: string) => api.get(`/organizations/${organizationId}/members`),
    getInvites: (organizationId: string) => api.get(`/organizations/${organizationId}/invites`),
    inviteMember: (
        organizationId: string,
        data: { email: string; role?: 'OWNER' | 'MANAGER' | 'STAFF' },
    ) => api.post(`/organizations/${organizationId}/invites`, data),
    acceptInvite: (token: string) => api.post(`/organizations/invites/${token}/accept`),
    updateMemberRole: (
        organizationId: string,
        userId: string,
        data: { role: 'OWNER' | 'MANAGER' | 'STAFF' },
    ) => api.patch(`/organizations/${organizationId}/members/${userId}/role`, data),
    removeMember: (organizationId: string, userId: string) =>
        api.delete(`/organizations/${organizationId}/members/${userId}`),
};

// ---- Plans ----
export const plansApi = {
    getAll: () => api.get('/plans'),
};

// ---- Subscriptions ----
export const subscriptionsApi = {
    getCurrent: () => api.get('/subscriptions/current'),
    createCheckoutSession: (data: { planCode: 'FREE' | 'GROWTH' | 'SCALE'; successUrl: string; cancelUrl: string }) =>
        api.post('/subscriptions/checkout-session', data),
    cancelAtPeriodEnd: () => api.post('/subscriptions/cancel-at-period-end'),
};

// ---- Payments ----
export const paymentsApi = {
    getMyPayments: (params?: { limit?: number }) => api.get('/payments/my', { params }),
    getMyInvoices: (params?: { limit?: number }) => api.get('/payments/invoices/my', { params }),
    getBillingSummary: (params?: { from?: string; to?: string }) =>
        api.get('/payments/reports/summary/my', { params }),
    getFiscalSummary: (params?: { from?: string; to?: string }) =>
        api.get('/payments/reports/fiscal/my', { params }),
    exportInvoicesCsv: (params?: { from?: string; to?: string }) =>
        api.get('/payments/invoices/export.csv', { params, responseType: 'blob' }),
    exportPaymentsCsv: (params?: { from?: string; to?: string }) =>
        api.get('/payments/payments/export.csv', { params, responseType: 'blob' }),
    exportFiscalCsv: (params?: { from?: string; to?: string }) =>
        api.get('/payments/reports/fiscal/export.csv', { params, responseType: 'blob' }),
    getAdsWalletOverview: (params?: { limit?: number }) =>
        api.get('/payments/ads-wallet/my', { params }),
    createAdsWalletCheckoutSession: (data: { amount: number; successUrl: string; cancelUrl: string }) =>
        api.post('/payments/ads-wallet/checkout-session', data),
    createBookingCheckoutSession: (
        bookingId: string,
        data: { successUrl: string; cancelUrl: string },
    ) => api.post(`/payments/marketplace/bookings/${bookingId}/checkout-session`, data),
};

// ---- Promotions ----
export const promotionsApi = {
    getPublic: (params?: Record<string, string | number | boolean>) => api.get('/promotions', { params }),
    getMine: (params?: Record<string, string | number | boolean>) => api.get('/promotions/my', { params }),
    create: (data: {
        businessId: string;
        title: string;
        description?: string;
        discountType: 'PERCENTAGE' | 'FIXED';
        discountValue: number;
        couponCode?: string;
        startsAt: string;
        endsAt: string;
        maxRedemptions?: number;
        isFlashOffer?: boolean;
        isActive?: boolean;
    }) => api.post('/promotions', data),
    update: (id: string, data: Record<string, unknown>) => api.put(`/promotions/${id}`, data),
    delete: (id: string) => api.delete(`/promotions/${id}`),
};

// ---- Bookings ----
export const bookingsApi = {
    create: (data: {
        businessId: string;
        scheduledFor: string;
        partySize?: number;
        notes?: string;
        promotionId?: string;
        couponCode?: string;
        quotedAmount?: number;
        depositAmount?: number;
        currency?: string;
    }) => api.post('/bookings', data),
    getMineAsUser: (params?: Record<string, string | number | boolean>) => api.get('/bookings/me', { params }),
    getMineAsOrganization: (params?: Record<string, string | number | boolean>) =>
        api.get('/bookings/my', { params }),
    updateStatus: (id: string, data: {
        status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW';
        quotedAmount?: number;
        depositAmount?: number;
        notes?: string;
    }) => api.patch(`/bookings/${id}/status`, data),
    getTransactionsMyOrganization: (params?: Record<string, string | number | boolean>) =>
        api.get('/bookings/transactions/my', { params }),
};

// ---- Analytics ----
export const analyticsApi = {
    trackEvent: (data: {
        businessId: string;
        eventType: 'VIEW' | 'CLICK' | 'CONVERSION' | 'RESERVATION_REQUEST';
        occurredAt?: string;
        visitorId?: string;
        amount?: number;
    }) => api.post('/telemetry/business', data),
    getMyDashboard: (params?: { days?: number }) => api.get('/analytics/dashboard/my', { params }),
    getBusinessAnalytics: (businessId: string, params?: { days?: number }) =>
        api.get(`/analytics/business/${businessId}`, { params }),
    getMarketInsights: (params?: {
        days?: number;
        provinceId?: string;
        categoryId?: string;
        limit?: number;
    }) => api.get('/analytics/market-insights', { params }),
    generateMarketReport: (data: {
        reportType: 'PROVINCE_CATEGORY_DEMAND' | 'TRENDING_BUSINESSES' | 'CONVERSION_BENCHMARK';
        days?: number;
        provinceId?: string;
        categoryId?: string;
    }) => api.post('/analytics/market-reports/generate', data),
    listMarketReports: (params?: {
        reportType?: 'PROVINCE_CATEGORY_DEMAND' | 'TRENDING_BUSINESSES' | 'CONVERSION_BENCHMARK';
        limit?: number;
    }) => api.get('/analytics/market-reports', { params }),
    getMarketReportById: (reportId: string) => api.get(`/analytics/market-reports/${reportId}`),
    trackGrowthEvent: (data: {
        eventType:
            | 'SEARCH_QUERY'
            | 'SEARCH_RESULT_CLICK'
            | 'CONTACT_CLICK'
            | 'WHATSAPP_CLICK'
            | 'BOOKING_INTENT'
            | 'SHARE_CLICK'
            | 'PASSWORD_RESET_REQUEST'
            | 'PASSWORD_RESET_COMPLETE'
            | 'GOOGLE_AUTH_SUCCESS'
            | 'LISTING_FILTER_APPLY'
            | 'LISTING_VIEW_CHANGE'
            | 'LISTING_MAP_SELECT'
            | 'PREMODERATION_FLAGGED'
            | 'PREMODERATION_RELEASED'
            | 'PREMODERATION_CONFIRMED'
            | 'BUSINESS_ONBOARDING_STEP'
            | 'BUSINESS_ONBOARDING_COMPLETE'
            | 'CLAIM_CTA_CLICK'
            | 'CLAIM_REQUEST_SUBMITTED'
            | 'USER_SUGGESTION_SUBMITTED';
        businessId?: string;
        categoryId?: string;
        provinceId?: string;
        cityId?: string;
        visitorId?: string;
        sessionId?: string;
        variantKey?: string;
        searchQuery?: string;
        metadata?: Record<string, unknown>;
        occurredAt?: string;
    }) => api.post('/telemetry/growth', data),
    getGrowthInsights: (params?: {
        days?: number;
        provinceId?: string;
        categoryId?: string;
        limit?: number;
    }) => api.get('/analytics/growth/insights', { params }),
};

// ---- WhatsApp ----
export const whatsappApi = {
    createClickToChatLink: (data: {
        businessId: string;
        source?: string;
        sessionId?: string;
        visitorId?: string;
        variantKey?: string;
    }) => api.post('/whatsapp/click-to-chat', data),
    getMyConversations: (params?: Record<string, string | number | boolean>) =>
        api.get('/whatsapp/conversations/my', { params }),
    updateConversationStatus: (
        conversationId: string,
        data: {
            status?: 'OPEN' | 'CLOSED' | 'ESCALATED';
            autoResponderActive?: boolean;
        },
    ) => api.patch(`/whatsapp/conversations/my/${conversationId}/status`, data),
};

// ---- Messaging ----
export const messagingApi = {
    createConversation: (data: { businessId: string; subject?: string; message: string }) =>
        api.post('/messaging/conversations', data),
    getMyConversations: (params?: Record<string, string | number | boolean>) =>
        api.get('/messaging/conversations/me', { params }),
    getMyConversationThread: (conversationId: string) =>
        api.get(`/messaging/conversations/me/${conversationId}`),
    sendMessageAsCustomer: (conversationId: string, data: { content: string }) =>
        api.post(`/messaging/conversations/me/${conversationId}/messages`, data),
    getOrgConversations: (params?: Record<string, string | number | boolean>) =>
        api.get('/messaging/conversations/my', { params }),
    getOrgConversationThread: (conversationId: string) =>
        api.get(`/messaging/conversations/my/${conversationId}`),
    sendMessageAsOrg: (conversationId: string, data: { content: string }) =>
        api.post(`/messaging/conversations/my/${conversationId}/messages`, data),
    updateConversationStatus: (
        conversationId: string,
        data: { status: 'OPEN' | 'CLOSED' | 'CONVERTED' },
    ) => api.patch(`/messaging/conversations/my/${conversationId}/status`, data),
    convertConversationToBooking: (
        conversationId: string,
        data: {
            scheduledFor: string;
            partySize?: number;
            notes?: string;
            quotedAmount?: number;
            depositAmount?: number;
            currency?: string;
            promotionId?: string;
        },
    ) => api.post(`/messaging/conversations/my/${conversationId}/convert-booking`, data),
};

// ---- CRM ----
export const crmApi = {
    getCustomers: (params?: {
        search?: string;
        businessId?: string;
        page?: number;
        limit?: number;
    }) => api.get('/crm/customers/my', { params }),
    getCustomerHistory: (customerUserId: string, params?: { businessId?: string }) =>
        api.get(`/crm/customers/${customerUserId}/history`, { params }),
    getPipeline: (params?: {
        businessId?: string;
        stage?: 'LEAD' | 'QUOTED' | 'BOOKED' | 'PAID' | 'LOST';
        limit?: number;
    }) => api.get('/crm/pipeline/my', { params }),
    createLead: (data: {
        businessId: string;
        customerUserId?: string;
        conversationId?: string;
        bookingId?: string;
        title: string;
        notes?: string;
        estimatedValue?: number;
        expectedCloseAt?: string;
    }) => api.post('/crm/pipeline/my/leads', data),
    updateLeadStage: (
        leadId: string,
        data: {
            stage: 'LEAD' | 'QUOTED' | 'BOOKED' | 'PAID' | 'LOST';
            lostReason?: string;
        },
    ) => api.patch(`/crm/pipeline/my/leads/${leadId}/stage`, data),
};

// ---- Favorites ----
export const favoritesApi = {
    getFavoriteBusinesses: (params?: { page?: number; limit?: number; businessId?: string }) =>
        api.get('/favorites/businesses/my', { params }),
    toggleFavoriteBusiness: (data: { businessId: string }) =>
        api.post('/favorites/businesses/toggle', data),
    getMyLists: (params?: { page?: number; limit?: number }) =>
        api.get('/favorites/lists/my', { params }),
    createList: (data: { name: string; description?: string; isPublic?: boolean }) =>
        api.post('/favorites/lists', data),
    deleteList: (listId: string) =>
        api.delete(`/favorites/lists/${listId}`),
    addBusinessToList: (listId: string, data: { businessId: string }) =>
        api.post(`/favorites/lists/${listId}/items`, data),
    removeBusinessFromList: (listId: string, businessId: string) =>
        api.delete(`/favorites/lists/${listId}/items/${businessId}`),
};

// ---- Check-ins / Loyalty ----
export const checkinsApi = {
    create: (data: {
        businessId: string;
        latitude?: number;
        longitude?: number;
        note?: string;
    }) => api.post('/checkins', data),
    getMine: (params?: { page?: number; limit?: number }) =>
        api.get('/checkins/my', { params }),
    getBusinessStats: (businessId: string) =>
        api.get(`/checkins/business/${businessId}/stats`),
};

// ---- Reputation ----
export const reputationApi = {
    getRankings: (params?: { provinceId?: string; limit?: number }) =>
        api.get('/reputation/rankings', { params }),
    getBusinessProfile: (businessId: string) => api.get(`/reputation/business/${businessId}`),
};

// ---- Ads ----
export const adsApi = {
    getPlacements: (params?: { provinceId?: string; categoryId?: string; limit?: number }) =>
        api.get('/ads/placements', { params }),
    trackImpression: (campaignId: string, data?: { visitorId?: string; placementKey?: string }) =>
        api.post(`/ads/campaigns/${campaignId}/impression`, data ?? {}),
    trackClick: (campaignId: string, data?: { visitorId?: string; placementKey?: string }) =>
        api.post(`/ads/campaigns/${campaignId}/click`, data ?? {}),
    createCampaign: (data: {
        businessId: string;
        name: string;
        targetProvinceId?: string;
        targetCategoryId?: string;
        dailyBudget: number;
        totalBudget: number;
        bidAmount: number;
        startsAt: string;
        endsAt: string;
        status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED';
    }) => api.post('/ads/campaigns', data),
    getMyCampaigns: (params?: Record<string, string | number | boolean>) =>
        api.get('/ads/campaigns/my', { params }),
    updateCampaignStatus: (
        campaignId: string,
        data: { status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'REJECTED' },
    ) => api.patch(`/ads/campaigns/${campaignId}/status`, data),
};

// ---- Verification ----
export const verificationApi = {
    uploadDocumentFile: (businessId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('businessId', businessId);
        return api.post('/verification/documents/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    submitDocument: (data: {
        businessId: string;
        documentType: 'ID_CARD' | 'TAX_CERTIFICATE' | 'BUSINESS_LICENSE' | 'ADDRESS_PROOF' | 'SELFIE' | 'OTHER';
        fileUrl: string;
    }) => api.post('/verification/documents', data),
    getMyDocuments: (params?: Record<string, string | number | boolean>) =>
        api.get('/verification/documents/my', { params }),
    submitBusiness: (businessId: string, data?: { notes?: string }) =>
        api.post(`/verification/businesses/${businessId}/submit`, data ?? {}),
    getBusinessStatus: (businessId: string) =>
        api.get(`/verification/businesses/${businessId}/status`),
    getPendingBusinessesAdmin: (params?: { limit?: number }) =>
        api.get('/verification/admin/pending-businesses', { params }),
    getModerationQueueAdmin: (params?: { limit?: number }) =>
        api.get('/verification/admin/moderation-queue', { params }),
    resolvePreventiveModerationAdmin: (
        businessId: string,
        data: { decision: 'APPROVE_FOR_KYC' | 'KEEP_BLOCKED'; notes?: string },
    ) => api.patch(`/verification/admin/businesses/${businessId}/pre-moderation`, data),
    reviewBusinessAdmin: (
        businessId: string,
        data: { status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'; notes?: string },
    ) => api.patch(`/verification/admin/businesses/${businessId}/review`, data),
    reviewDocumentAdmin: (
        documentId: string,
        data: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; rejectionReason?: string },
    ) => api.patch(`/verification/admin/documents/${documentId}/review`, data),
};

// ---- Observability ----
export const observabilityApi = {
    getMetrics: () => api.get<string>('/observability/metrics', { responseType: 'text' }),
    getSummary: () =>
        resolveMappedCachedRequest(
            observabilitySummaryCacheByKey,
            buildCacheKey('admin-observability-summary'),
            ADMIN_INSIGHTS_TTL_MS,
            () => api.get('/observability/summary'),
        ),
};

// ---- Health ----
export const healthApi = {
    getLiveness: () => api.get('/health'),
    getReadiness: () => api.get('/health/ready'),
    getDashboard: () =>
        resolveMappedCachedRequest(
            healthDashboardCacheByKey,
            buildCacheKey('admin-health-dashboard'),
            ADMIN_INSIGHTS_TTL_MS,
            () => api.get('/health/dashboard'),
        ),
};
