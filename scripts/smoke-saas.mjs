import { randomUUID } from 'crypto';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function request(apiBaseUrl, path, options = {}) {
    const {
        method = 'GET',
        token,
        organizationId,
        body,
        accept = 'application/json',
    } = options;

    const headers = {
        accept,
    };

    if (token) {
        headers.authorization = `Bearer ${token}`;
    }

    if (organizationId) {
        headers['x-organization-id'] = organizationId;
    }

    if (body !== undefined) {
        headers['content-type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${apiBaseUrl}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        const text = await response.text();
        const contentType = response.headers.get('content-type') ?? '';
        let json = null;
        if (contentType.includes('application/json') && text) {
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error(`${path} returned invalid JSON`);
            }
        }

        return {
            status: response.status,
            headers: response.headers,
            text,
            json,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function assertStatus(response, allowedStatusCodes, label) {
    if (allowedStatusCodes.includes(response.status)) {
        return;
    }

    const details = response.json ? JSON.stringify(response.json) : response.text;
    throw new Error(`${label} failed with HTTP ${response.status}. Response: ${details}`);
}

async function main() {
    const apiBaseUrl = normalizeBaseUrl(process.env.SAAS_SMOKE_API_BASE_URL, DEFAULT_API_BASE_URL);
    const runId = randomUUID().slice(0, 8);
    console.log(`Running SaaS smoke flow against ${apiBaseUrl} (run=${runId})`);

    const plansResponse = await request(apiBaseUrl, '/api/plans');
    assertStatus(plansResponse, [200], 'GET /api/plans');
    assert(Array.isArray(plansResponse.json) && plansResponse.json.length > 0, 'No plans available');

    const categoriesResponse = await request(apiBaseUrl, '/api/categories');
    assertStatus(categoriesResponse, [200], 'GET /api/categories');
    assert(Array.isArray(categoriesResponse.json) && categoriesResponse.json.length > 0, 'No categories available');
    const categoryId = categoriesResponse.json[0]?.id;
    assert(typeof categoryId === 'string', 'Missing category id');

    const featuresResponse = await request(apiBaseUrl, '/api/features');
    assertStatus(featuresResponse, [200], 'GET /api/features');
    assert(Array.isArray(featuresResponse.json) && featuresResponse.json.length > 0, 'No features available');
    const featureId = featuresResponse.json[0]?.id;
    assert(typeof featureId === 'string', 'Missing feature id');

    const provincesResponse = await request(apiBaseUrl, '/api/provinces');
    assertStatus(provincesResponse, [200], 'GET /api/provinces');
    assert(Array.isArray(provincesResponse.json) && provincesResponse.json.length > 0, 'No provinces available');
    const citiesResponse = await request(apiBaseUrl, '/api/cities');
    assertStatus(citiesResponse, [200], 'GET /api/cities');
    assert(Array.isArray(citiesResponse.json) && citiesResponse.json.length > 0, 'No cities available');
    const city = citiesResponse.json[0];
    const cityId = city?.id;
    const provinceId = city?.provinceId ?? city?.province?.id;
    assert(typeof provinceId === 'string', 'Missing province id linked to city');
    assert(typeof cityId === 'string', 'Missing city id');

    const userEmail = `smoke.${runId}@example.com`;
    const userPassword = 'SmokePass123!';
    const registerResponse = await request(apiBaseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            name: `Smoke User ${runId}`,
            email: userEmail,
            password: userPassword,
            phone: '+18095550000',
        },
    });
    assertStatus(registerResponse, [201], 'POST /api/auth/register');

    const initialAccessToken = registerResponse.json?.accessToken;
    const initialRefreshToken = registerResponse.json?.refreshToken;
    const userId = registerResponse.json?.user?.id;
    assert(typeof initialAccessToken === 'string', 'Missing accessToken from register');
    assert(typeof initialRefreshToken === 'string', 'Missing refreshToken from register');
    assert(typeof userId === 'string', 'Missing user id from register');

    const refreshResponse = await request(apiBaseUrl, '/api/auth/refresh', {
        method: 'POST',
        body: {
            refreshToken: initialRefreshToken,
        },
    });
    assertStatus(refreshResponse, [200], 'POST /api/auth/refresh');
    const accessToken = refreshResponse.json?.accessToken;
    const refreshToken = refreshResponse.json?.refreshToken;
    assert(typeof accessToken === 'string', 'Missing accessToken from refresh');
    assert(typeof refreshToken === 'string', 'Missing refreshToken from refresh');

    const meResponse = await request(apiBaseUrl, '/api/users/me', {
        token: accessToken,
    });
    assertStatus(meResponse, [200], 'GET /api/users/me');

    const updateMeResponse = await request(apiBaseUrl, '/api/users/me', {
        method: 'PATCH',
        token: accessToken,
        body: {
            name: `Smoke User ${runId} Updated`,
            phone: '+18095550001',
        },
    });
    assertStatus(updateMeResponse, [200], 'PATCH /api/users/me');

    const profileResponse = await request(apiBaseUrl, '/api/users/me/profile', {
        token: accessToken,
    });
    assertStatus(profileResponse, [200], 'GET /api/users/me/profile');

    const createOrganizationResponse = await request(apiBaseUrl, '/api/organizations', {
        method: 'POST',
        token: accessToken,
        body: {
            name: `Smoke Org ${runId}`,
        },
    });
    assertStatus(createOrganizationResponse, [201], 'POST /api/organizations');
    const organizationId = createOrganizationResponse.json?.id;
    assert(typeof organizationId === 'string', 'Missing organization id');

    const organizationEndpoints = [
        { path: '/api/organizations/mine', status: [200] },
        { path: `/api/organizations/${organizationId}`, status: [200] },
        { path: `/api/organizations/${organizationId}/members`, status: [200] },
        { path: `/api/organizations/${organizationId}/invites`, status: [200] },
        { path: `/api/organizations/${organizationId}/subscription`, status: [200] },
        { path: `/api/organizations/${organizationId}/usage`, status: [200] },
        { path: `/api/organizations/${organizationId}/audit-logs`, status: [200] },
    ];
    for (const endpoint of organizationEndpoints) {
        const response = await request(apiBaseUrl, endpoint.path, { token: accessToken });
        assertStatus(response, endpoint.status, `GET ${endpoint.path}`);
    }

    const patchOrganizationResponse = await request(apiBaseUrl, `/api/organizations/${organizationId}`, {
        method: 'PATCH',
        token: accessToken,
        body: {
            name: `Smoke Org ${runId} Updated`,
        },
    });
    assertStatus(patchOrganizationResponse, [200], `PATCH /api/organizations/${organizationId}`);

    const patchOrgSubscriptionResponse = await request(
        apiBaseUrl,
        `/api/organizations/${organizationId}/subscription`,
        {
            method: 'PATCH',
            token: accessToken,
            body: {
                plan: 'FREE',
                subscriptionStatus: 'ACTIVE',
            },
        },
    );
    assertStatus(
        patchOrgSubscriptionResponse,
        [200],
        `PATCH /api/organizations/${organizationId}/subscription`,
    );

    const inviteResponse = await request(apiBaseUrl, `/api/organizations/${organizationId}/invites`, {
        method: 'POST',
        token: accessToken,
        body: {
            email: `invite.${runId}@example.com`,
            role: 'STAFF',
        },
    });
    assertStatus(inviteResponse, [201], `POST /api/organizations/${organizationId}/invites`);

    const createBusinessResponse = await request(apiBaseUrl, '/api/businesses', {
        method: 'POST',
        token: accessToken,
        organizationId,
        body: {
            name: `Smoke Business ${runId}`,
            description: 'Business created by smoke flow for end to end validation.',
            phone: '+18095550002',
            whatsapp: '+18095550003',
            address: 'Calle Principal 123',
            provinceId,
            cityId,
            latitude: 18.4861,
            longitude: -69.9312,
            categoryIds: [categoryId],
            featureIds: [featureId],
        },
    });
    assertStatus(createBusinessResponse, [201], 'POST /api/businesses');
    const businessId = createBusinessResponse.json?.id;
    assert(typeof businessId === 'string', 'Missing business id');

    const businessesMineResponse = await request(apiBaseUrl, '/api/businesses/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(businessesMineResponse, [200], 'GET /api/businesses/my');

    const businessByIdResponse = await request(apiBaseUrl, `/api/businesses/${businessId}`, {
        token: accessToken,
        organizationId,
    });
    assertStatus(businessByIdResponse, [200], `GET /api/businesses/${businessId}`);

    const updateBusinessResponse = await request(apiBaseUrl, `/api/businesses/${businessId}`, {
        method: 'PUT',
        token: accessToken,
        organizationId,
        body: {
            description: 'Updated description by smoke flow.',
            address: 'Calle Secundaria 456',
            categoryIds: [categoryId],
            featureIds: [featureId],
        },
    });
    assertStatus(updateBusinessResponse, [200], `PUT /api/businesses/${businessId}`);

    const businessesPublicResponse = await request(apiBaseUrl, '/api/businesses');
    assertStatus(businessesPublicResponse, [200], 'GET /api/businesses');

    const businessesNearbyResponse = await request(
        apiBaseUrl,
        '/api/businesses/nearby?lat=18.4861&lng=-69.9312&radius=10',
    );
    assertStatus(businessesNearbyResponse, [200], 'GET /api/businesses/nearby');

    const adminLoginResponse = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
            email: 'admin@aquita.do',
            password: 'admin12345',
        },
    });
    assertStatus(adminLoginResponse, [200], 'POST /api/auth/login (admin)');
    const adminAccessToken = adminLoginResponse.json?.accessToken;
    assert(typeof adminAccessToken === 'string', 'Missing admin access token');

    const verifyBusinessResponse = await request(apiBaseUrl, `/api/businesses/${businessId}/verify`, {
        method: 'PUT',
        token: adminAccessToken,
    });
    assertStatus(verifyBusinessResponse, [200], `PUT /api/businesses/${businessId}/verify`);

    const searchBusinessesResponse = await request(
        apiBaseUrl,
        `/api/search/businesses?q=${encodeURIComponent(`Smoke Business ${runId}`)}&limit=5`,
    );
    assertStatus(searchBusinessesResponse, [200], 'GET /api/search/businesses');
    assert(
        Array.isArray(searchBusinessesResponse.json?.data),
        'Search payload must include data array',
    );

    const discoveryResponse = await request(
        apiBaseUrl,
        '/api/discovery/businesses/nearby?lat=18.4861&lng=-69.9312&radiusKm=10&limit=5',
    );
    assertStatus(discoveryResponse, [200], 'GET /api/discovery/businesses/nearby');
    assert(
        Array.isArray(discoveryResponse.json?.data),
        'Discovery payload must include data array',
    );

    const now = Date.now();
    const startsAt = new Date(now - 60 * 60 * 1000).toISOString();
    const endsAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    const createPromotionResponse = await request(apiBaseUrl, '/api/promotions', {
        method: 'POST',
        token: accessToken,
        organizationId,
        body: {
            businessId,
            title: `Smoke Promo ${runId}`,
            description: 'Promotion created by smoke flow.',
            discountType: 'PERCENTAGE',
            discountValue: 15,
            couponCode: `SMOKE${runId.toUpperCase()}`,
            startsAt,
            endsAt,
            maxRedemptions: 100,
            isFlashOffer: true,
            isActive: true,
        },
    });
    assertStatus(createPromotionResponse, [201], 'POST /api/promotions');
    const promotionId = createPromotionResponse.json?.id;
    assert(typeof promotionId === 'string', 'Missing promotion id');

    const myPromotionsResponse = await request(apiBaseUrl, '/api/promotions/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(myPromotionsResponse, [200], 'GET /api/promotions/my');

    const updatePromotionResponse = await request(apiBaseUrl, `/api/promotions/${promotionId}`, {
        method: 'PUT',
        token: accessToken,
        organizationId,
        body: {
            title: `Smoke Promo ${runId} Updated`,
            discountValue: 12,
            endsAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
        },
    });
    assertStatus(updatePromotionResponse, [200], `PUT /api/promotions/${promotionId}`);

    const publicPromotionsResponse = await request(apiBaseUrl, '/api/promotions');
    assertStatus(publicPromotionsResponse, [200], 'GET /api/promotions');

    const bookingResponse = await request(apiBaseUrl, '/api/bookings', {
        method: 'POST',
        token: accessToken,
        body: {
            businessId,
            promotionId,
            scheduledFor: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
            partySize: 2,
            notes: 'Smoke booking flow.',
            quotedAmount: 1500,
            depositAmount: 300,
            currency: 'DOP',
        },
    });
    assertStatus(bookingResponse, [201], 'POST /api/bookings');
    const bookingId = bookingResponse.json?.id;
    assert(typeof bookingId === 'string', 'Missing booking id');

    const myBookingsResponse = await request(apiBaseUrl, '/api/bookings/me', {
        token: accessToken,
    });
    assertStatus(myBookingsResponse, [200], 'GET /api/bookings/me');

    const orgBookingsResponse = await request(apiBaseUrl, '/api/bookings/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(orgBookingsResponse, [200], 'GET /api/bookings/my');

    const bookingStatusResponse = await request(apiBaseUrl, `/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        token: accessToken,
        organizationId,
        body: {
            status: 'CONFIRMED',
            quotedAmount: 1500,
            depositAmount: 300,
            notes: 'Confirmed by smoke flow',
        },
    });
    assertStatus(bookingStatusResponse, [200], `PATCH /api/bookings/${bookingId}/status`);

    const orgTransactionsResponse = await request(apiBaseUrl, '/api/bookings/transactions/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(orgTransactionsResponse, [200], 'GET /api/bookings/transactions/my');

    const createConversationResponse = await request(apiBaseUrl, '/api/messaging/conversations', {
        method: 'POST',
        token: accessToken,
        body: {
            businessId,
            subject: 'Need availability',
            message: 'Can you share availability for this weekend?',
        },
    });
    assertStatus(createConversationResponse, [201], 'POST /api/messaging/conversations');
    const conversationId =
        createConversationResponse.json?.id
        ?? createConversationResponse.json?.data?.id;
    assert(
        typeof conversationId === 'string',
        `Missing conversation id. Response: ${JSON.stringify(createConversationResponse.json)}`,
    );

    const myConversationsResponse = await request(apiBaseUrl, '/api/messaging/conversations/me', {
        token: accessToken,
    });
    assertStatus(myConversationsResponse, [200], 'GET /api/messaging/conversations/me');

    const customerThreadResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/me/${conversationId}`,
        {
            token: accessToken,
        },
    );
    assertStatus(customerThreadResponse, [200], `GET /api/messaging/conversations/me/${conversationId}`);

    const customerMessageResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/me/${conversationId}/messages`,
        {
            method: 'POST',
            token: accessToken,
            body: {
                content: 'Adding a follow up message from customer.',
            },
        },
    );
    assertStatus(
        customerMessageResponse,
        [201],
        `POST /api/messaging/conversations/me/${conversationId}/messages`,
    );

    const orgConversationsResponse = await request(apiBaseUrl, '/api/messaging/conversations/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(orgConversationsResponse, [200], 'GET /api/messaging/conversations/my');

    const orgThreadResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/my/${conversationId}`,
        {
            token: accessToken,
            organizationId,
        },
    );
    assertStatus(orgThreadResponse, [200], `GET /api/messaging/conversations/my/${conversationId}`);

    const orgMessageResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/my/${conversationId}/messages`,
        {
            method: 'POST',
            token: accessToken,
            organizationId,
            body: {
                content: 'Response from business side in smoke flow.',
            },
        },
    );
    assertStatus(
        orgMessageResponse,
        [201],
        `POST /api/messaging/conversations/my/${conversationId}/messages`,
    );

    const convertConversationResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/my/${conversationId}/convert-booking`,
        {
            method: 'POST',
            token: accessToken,
            organizationId,
            body: {
                scheduledFor: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
                partySize: 4,
                notes: 'Converted from conversation by smoke flow.',
                quotedAmount: 2200,
                depositAmount: 500,
                currency: 'DOP',
                promotionId,
            },
        },
    );
    assertStatus(
        convertConversationResponse,
        [201, 200],
        `POST /api/messaging/conversations/my/${conversationId}/convert-booking`,
    );

    const crmCustomersResponse = await request(apiBaseUrl, '/api/crm/customers/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(crmCustomersResponse, [200], 'GET /api/crm/customers/my');

    const crmHistoryResponse = await request(
        apiBaseUrl,
        `/api/crm/customers/${userId}/history?businessId=${businessId}`,
        {
            token: accessToken,
            organizationId,
        },
    );
    assertStatus(crmHistoryResponse, [200], `GET /api/crm/customers/${userId}/history`);

    const analyticsEventResponse = await request(apiBaseUrl, '/api/analytics/events', {
        method: 'POST',
        body: {
            businessId,
            eventType: 'VIEW',
            amount: 0,
        },
    });
    assertStatus(analyticsEventResponse, [201], 'POST /api/analytics/events');

    const analyticsDashboardResponse = await request(apiBaseUrl, '/api/analytics/dashboard/my?days=30', {
        token: accessToken,
        organizationId,
    });
    assertStatus(analyticsDashboardResponse, [200], 'GET /api/analytics/dashboard/my');

    const analyticsBusinessResponse = await request(
        apiBaseUrl,
        `/api/analytics/business/${businessId}?days=30`,
        {
            token: accessToken,
            organizationId,
        },
    );
    assertStatus(analyticsBusinessResponse, [200], `GET /api/analytics/business/${businessId}`);

    const createReviewResponse = await request(apiBaseUrl, '/api/reviews', {
        method: 'POST',
        token: accessToken,
        body: {
            businessId,
            rating: 5,
            comment: 'Excellent experience from smoke flow.',
        },
    });
    assertStatus(createReviewResponse, [201], 'POST /api/reviews');
    const reviewId = createReviewResponse.json?.id;
    assert(typeof reviewId === 'string', 'Missing review id');

    const businessReviewsResponse = await request(apiBaseUrl, `/api/reviews/business/${businessId}`);
    assertStatus(businessReviewsResponse, [200], `GET /api/reviews/business/${businessId}`);

    const flaggedReviewsResponse = await request(apiBaseUrl, '/api/reviews/moderation/flagged', {
        token: adminAccessToken,
    });
    assertStatus(flaggedReviewsResponse, [200], 'GET /api/reviews/moderation/flagged');

    const moderateReviewResponse = await request(apiBaseUrl, `/api/reviews/${reviewId}/moderation`, {
        method: 'PATCH',
        token: adminAccessToken,
        body: {
            status: 'APPROVED',
        },
    });
    assertStatus(moderateReviewResponse, [200], `PATCH /api/reviews/${reviewId}/moderation`);

    const rankingsResponse = await request(apiBaseUrl, '/api/reputation/rankings?limit=10');
    assertStatus(rankingsResponse, [200], 'GET /api/reputation/rankings');

    const reputationProfileResponse = await request(apiBaseUrl, `/api/reputation/business/${businessId}`);
    assertStatus(reputationProfileResponse, [200], `GET /api/reputation/business/${businessId}`);

    const recalculateResponse = await request(
        apiBaseUrl,
        `/api/reputation/business/${businessId}/recalculate`,
        {
            method: 'POST',
            token: adminAccessToken,
        },
    );
    assertStatus(recalculateResponse, [201, 200], `POST /api/reputation/business/${businessId}/recalculate`);

    const createCampaignResponse = await request(apiBaseUrl, '/api/ads/campaigns', {
        method: 'POST',
        token: accessToken,
        organizationId,
        body: {
            businessId,
            name: `Smoke Campaign ${runId}`,
            targetProvinceId: provinceId,
            targetCategoryId: categoryId,
            dailyBudget: 100,
            totalBudget: 500,
            bidAmount: 10,
            startsAt: new Date(now).toISOString(),
            endsAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'DRAFT',
        },
    });
    assertStatus(createCampaignResponse, [201], 'POST /api/ads/campaigns');
    const campaignId = createCampaignResponse.json?.id;
    assert(typeof campaignId === 'string', 'Missing campaign id');

    const campaignsResponse = await request(apiBaseUrl, '/api/ads/campaigns/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(campaignsResponse, [200], 'GET /api/ads/campaigns/my');

    const placementsResponse = await request(
        apiBaseUrl,
        `/api/ads/placements?provinceId=${provinceId}&categoryId=${categoryId}&limit=5`,
    );
    assertStatus(placementsResponse, [200], 'GET /api/ads/placements');

    const verificationDocumentResponse = await request(apiBaseUrl, '/api/verification/documents', {
        method: 'POST',
        token: accessToken,
        organizationId,
        body: {
            businessId,
            documentType: 'BUSINESS_LICENSE',
            fileUrl: `https://example.com/documents/${runId}.pdf`,
        },
    });
    assertStatus(verificationDocumentResponse, [201], 'POST /api/verification/documents');
    const verificationDocumentId = verificationDocumentResponse.json?.id;
    assert(typeof verificationDocumentId === 'string', 'Missing verification document id');

    const verificationDocumentsResponse = await request(apiBaseUrl, '/api/verification/documents/my', {
        token: accessToken,
        organizationId,
    });
    assertStatus(verificationDocumentsResponse, [200], 'GET /api/verification/documents/my');

    const verificationSubmitResponse = await request(
        apiBaseUrl,
        `/api/verification/businesses/${businessId}/submit`,
        {
            method: 'POST',
            token: accessToken,
            organizationId,
            body: {
                notes: 'Smoke verification submission',
            },
        },
    );
    assertStatus(verificationSubmitResponse, [201, 200], `POST /api/verification/businesses/${businessId}/submit`);

    const verificationStatusResponse = await request(
        apiBaseUrl,
        `/api/verification/businesses/${businessId}/status`,
        {
            token: accessToken,
            organizationId,
        },
    );
    assertStatus(verificationStatusResponse, [200], `GET /api/verification/businesses/${businessId}/status`);

    const pendingBusinessesResponse = await request(apiBaseUrl, '/api/verification/admin/pending-businesses', {
        token: adminAccessToken,
    });
    assertStatus(pendingBusinessesResponse, [200], 'GET /api/verification/admin/pending-businesses');

    const reviewDocumentResponse = await request(
        apiBaseUrl,
        `/api/verification/admin/documents/${verificationDocumentId}/review`,
        {
            method: 'PATCH',
            token: adminAccessToken,
            body: {
                status: 'APPROVED',
            },
        },
    );
    assertStatus(
        reviewDocumentResponse,
        [200],
        `PATCH /api/verification/admin/documents/${verificationDocumentId}/review`,
    );

    const subscriptionCurrentResponse = await request(apiBaseUrl, '/api/subscriptions/current', {
        token: accessToken,
        organizationId,
    });
    assertStatus(subscriptionCurrentResponse, [200], 'GET /api/subscriptions/current');

    const subscriptionCheckoutResponse = await request(apiBaseUrl, '/api/subscriptions/checkout-session', {
        method: 'POST',
        token: accessToken,
        organizationId,
        body: {
            planCode: 'GROWTH',
            successUrl: 'http://localhost:8080/dashboard?status=ok',
            cancelUrl: 'http://localhost:8080/dashboard?status=cancel',
        },
    });
    assertStatus(
        subscriptionCheckoutResponse,
        [201, 503],
        'POST /api/subscriptions/checkout-session',
    );

    const subscriptionCancelResponse = await request(apiBaseUrl, '/api/subscriptions/cancel-at-period-end', {
        method: 'POST',
        token: accessToken,
        organizationId,
    });
    assertStatus(
        subscriptionCancelResponse,
        [200, 400, 503],
        'POST /api/subscriptions/cancel-at-period-end',
    );

    const paymentEndpoints = [
        '/api/payments/my',
        '/api/payments/invoices/my',
        '/api/payments/reports/summary/my',
        '/api/payments/reports/fiscal/my',
        '/api/payments/ads-wallet/my',
    ];
    for (const endpoint of paymentEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: accessToken,
            organizationId,
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const csvEndpoints = [
        '/api/payments/invoices/export.csv',
        '/api/payments/payments/export.csv',
        '/api/payments/reports/fiscal/export.csv',
    ];
    for (const endpoint of csvEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: accessToken,
            organizationId,
            accept: 'text/csv',
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const adsWalletCheckoutResponse = await request(apiBaseUrl, '/api/payments/ads-wallet/checkout-session', {
        method: 'POST',
        token: accessToken,
        organizationId,
        body: {
            amount: 250,
            successUrl: 'http://localhost:8080/dashboard?adsWallet=ok',
            cancelUrl: 'http://localhost:8080/dashboard?adsWallet=cancel',
        },
    });
    assertStatus(
        adsWalletCheckoutResponse,
        [201, 503],
        'POST /api/payments/ads-wallet/checkout-session',
    );

    const bookingCheckoutResponse = await request(
        apiBaseUrl,
        `/api/payments/marketplace/bookings/${bookingId}/checkout-session`,
        {
            method: 'POST',
            token: accessToken,
            body: {
                successUrl: 'http://localhost:8080/bookings?payment=ok',
                cancelUrl: 'http://localhost:8080/bookings?payment=cancel',
            },
        },
    );
    assertStatus(
        bookingCheckoutResponse,
        [201, 503],
        `POST /api/payments/marketplace/bookings/${bookingId}/checkout-session`,
    );

    const smokeCategorySlug = `smoke-category-${runId}`;
    const createCategoryResponse = await request(apiBaseUrl, '/api/categories', {
        method: 'POST',
        token: adminAccessToken,
        body: {
            name: `Smoke Category ${runId}`,
            slug: smokeCategorySlug,
            icon: 'S',
        },
    });
    assertStatus(createCategoryResponse, [201], 'POST /api/categories (admin)');
    const smokeCategoryId = createCategoryResponse.json?.id;
    assert(typeof smokeCategoryId === 'string', 'Missing smoke category id');

    const updateCategoryResponse = await request(apiBaseUrl, `/api/categories/${smokeCategoryId}`, {
        method: 'PUT',
        token: adminAccessToken,
        body: {
            name: `Smoke Category ${runId} Updated`,
            slug: `${smokeCategorySlug}-updated`,
        },
    });
    assertStatus(updateCategoryResponse, [200], `PUT /api/categories/${smokeCategoryId}`);

    const deleteCategoryResponse = await request(apiBaseUrl, `/api/categories/${smokeCategoryId}`, {
        method: 'DELETE',
        token: adminAccessToken,
    });
    assertStatus(deleteCategoryResponse, [200], `DELETE /api/categories/${smokeCategoryId}`);

    const logoutResponse = await request(apiBaseUrl, '/api/auth/logout', {
        method: 'POST',
        body: {
            refreshToken,
        },
    });
    assertStatus(logoutResponse, [200], 'POST /api/auth/logout');

    console.log('SaaS smoke flow passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SaaS smoke flow failed: ${message}`);
    process.exitCode = 1;
});
