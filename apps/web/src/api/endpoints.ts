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
    getFlagged: (params?: { limit?: number; businessId?: string }) =>
        api.get('/reviews/moderation/flagged', { params }),
    moderate: (
        reviewId: string,
        data: { status: 'APPROVED' | 'FLAGGED'; reason?: string },
    ) => api.patch(`/reviews/${reviewId}/moderation`, data),
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
    getBillingSummary: (params?: { from?: string; to?: string }) =>
        api.get('/payments/reports/summary/my', { params }),
    exportInvoicesCsv: (params?: { from?: string; to?: string }) =>
        api.get('/payments/invoices/export.csv', { params, responseType: 'blob' }),
    exportPaymentsCsv: (params?: { from?: string; to?: string }) =>
        api.get('/payments/payments/export.csv', { params, responseType: 'blob' }),
    getAdsWalletOverview: (params?: { limit?: number }) =>
        api.get('/payments/ads-wallet/my', { params }),
    createAdsWalletCheckoutSession: (data: { amount: number; successUrl: string; cancelUrl: string }) =>
        api.post('/payments/ads-wallet/checkout-session', data),
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
    reviewBusinessAdmin: (
        businessId: string,
        data: { status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED'; notes?: string },
    ) => api.patch(`/verification/admin/businesses/${businessId}/review`, data),
    reviewDocumentAdmin: (
        documentId: string,
        data: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; rejectionReason?: string },
    ) => api.patch(`/verification/admin/documents/${documentId}/review`, data),
};
