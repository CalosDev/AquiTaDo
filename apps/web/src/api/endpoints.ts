import api from './client';

// ---- Auth ----
export const authApi = {
    register: (data: { name: string; email: string; password: string; phone?: string }) =>
        api.post('/auth/register', data),
    login: (data: { email: string; password: string }) =>
        api.post('/auth/login', data),
    refresh: (data: { refreshToken: string }) =>
        api.post('/auth/refresh', data),
    logout: (data: { refreshToken: string }) =>
        api.post('/auth/logout', data),
    getProfile: () => api.get('/users/me'),
};

// ---- Businesses ----
export const businessApi = {
    getAll: (params?: Record<string, string | number | boolean>) =>
        api.get('/businesses', { params }),
    getMine: () => api.get('/businesses/my'),
    getAllAdmin: (params?: Record<string, string | number | boolean>) =>
        api.get('/businesses/admin/all', { params }),
    getById: (id: string) => api.get(`/businesses/${id}`),
    create: (data: Record<string, unknown>) => api.post('/businesses', data),
    update: (id: string, data: Record<string, unknown>) => api.put(`/businesses/${id}`, data),
    delete: (id: string) => api.delete(`/businesses/${id}`),
    getNearby: (params: { lat: number; lng: number; radius?: number }) =>
        api.get('/businesses/nearby', { params }),
    verify: (id: string) => api.put(`/businesses/${id}/verify`),
};

// ---- Categories ----
export const categoryApi = {
    getAll: () => api.get('/categories'),
    create: (data: { name: string; slug: string; icon?: string }) =>
        api.post('/categories', data),
    update: (id: string, data: { name?: string; slug?: string; icon?: string }) =>
        api.put(`/categories/${id}`, data),
    delete: (id: string) => api.delete(`/categories/${id}`),
};

// ---- Locations ----
export const locationApi = {
    getProvinces: () => api.get('/provinces'),
    getCities: (provinceId: string) => api.get(`/provinces/${provinceId}/cities`),
};

// ---- Reviews ----
export const reviewApi = {
    create: (data: { rating: number; comment?: string; businessId: string }) =>
        api.post('/reviews', data),
    getByBusiness: (businessId: string) => api.get(`/reviews/business/${businessId}`),
};

// ---- Uploads ----
export const uploadApi = {
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
    }) => api.post('/analytics/events', data),
    getMyDashboard: (params?: { days?: number }) => api.get('/analytics/dashboard/my', { params }),
    getBusinessAnalytics: (businessId: string, params?: { days?: number }) =>
        api.get(`/analytics/business/${businessId}`, { params }),
};
