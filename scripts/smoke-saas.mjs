import { randomUUID } from 'crypto';

const DEFAULT_API_BASE_URL = 'http://localhost:3000';
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_SMOKE_PASSWORD = 'SmokePass123!';
const LOCAL_ADMIN_EMAIL = 'admin@aquita.do';
const LOCAL_ADMIN_PASSWORD = 'admin12345';

function normalizeBaseUrl(rawUrl, fallbackUrl) {
    const normalized = (rawUrl ?? fallbackUrl).trim().replace(/\/+$/, '');
    if (!normalized) {
        throw new Error('Base URL cannot be empty');
    }
    return normalized;
}

function isLocalApiBaseUrl(apiBaseUrl) {
    try {
        const hostname = new URL(apiBaseUrl).hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1';
    } catch {
        return false;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function formatResponsePayload(response) {
    if (response.json !== null) {
        return JSON.stringify(response.json);
    }
    return response.text.slice(0, 600);
}

async function request(apiBaseUrl, path, options = {}) {
    const {
        method = 'GET',
        token,
        cookie,
        organizationId,
        headers: customHeaders,
        body,
        accept = 'application/json',
    } = options;

    const headers = {
        accept,
        ...(customHeaders ?? {}),
    };

    if (token) {
        headers.authorization = `Bearer ${token}`;
    }

    if (cookie) {
        headers.cookie = cookie;
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
                throw new Error(`${method} ${path} returned invalid JSON`);
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

    throw new Error(`${label} failed with HTTP ${response.status}. Response: ${formatResponsePayload(response)}`);
}

function getCookieFromResponse(response, cookieName) {
    const raw = response.headers.get('set-cookie') ?? '';
    if (!raw) {
        return null;
    }

    const candidate = raw
        .split(',')
        .find((chunk) => chunk.includes(`${cookieName}=`));

    return candidate?.split(';')[0]?.trim() ?? null;
}

async function registerActor(apiBaseUrl, options) {
    const {
        runId,
        label,
        role,
        name,
        phone,
        password = DEFAULT_SMOKE_PASSWORD,
    } = options;

    const email = `${label}.${runId}@example.com`;
    const registerResponse = await request(apiBaseUrl, '/api/auth/register', {
        method: 'POST',
        body: {
            name,
            email,
            password,
            phone,
            role,
        },
    });
    assertStatus(registerResponse, [201], `POST /api/auth/register (${label})`);

    const accessToken = registerResponse.json?.accessToken;
    const userId = registerResponse.json?.user?.id;
    assert(typeof accessToken === 'string', `Missing access token for ${label}`);
    assert(typeof userId === 'string', `Missing user id for ${label}`);

    return {
        label,
        role,
        email,
        password,
        userId,
        accessToken,
        refreshCookie: getCookieFromResponse(registerResponse, 'aquita_refresh_token'),
    };
}

async function loginActor(apiBaseUrl, options) {
    const { email, password, label } = options;
    const loginResponse = await request(apiBaseUrl, '/api/auth/login', {
        method: 'POST',
        body: {
            email,
            password,
        },
    });
    assertStatus(loginResponse, [200], `POST /api/auth/login (${label})`);

    const accessToken = loginResponse.json?.accessToken;
    const userId = loginResponse.json?.user?.id;
    assert(typeof accessToken === 'string', `Missing access token for ${label}`);
    assert(typeof userId === 'string', `Missing user id for ${label}`);

    return {
        label,
        role: loginResponse.json?.user?.role ?? 'UNKNOWN',
        email,
        password,
        userId,
        accessToken,
        refreshCookie: getCookieFromResponse(loginResponse, 'aquita_refresh_token'),
    };
}

async function maybeRefreshActorToken(apiBaseUrl, actor) {
    if (!actor.refreshCookie) {
        return actor;
    }

    const refreshResponse = await request(apiBaseUrl, '/api/auth/refresh', {
        method: 'POST',
        cookie: actor.refreshCookie,
    });
    assertStatus(refreshResponse, [200], `POST /api/auth/refresh (${actor.label})`);

    const refreshedAccessToken = refreshResponse.json?.accessToken;
    assert(typeof refreshedAccessToken === 'string', `Missing refreshed access token for ${actor.label}`);

    return {
        ...actor,
        accessToken: refreshedAccessToken,
    };
}

async function exerciseSelfEndpoints(apiBaseUrl, actor, patchBody) {
    const meResponse = await request(apiBaseUrl, '/api/users/me', {
        token: actor.accessToken,
    });
    assertStatus(meResponse, [200], `GET /api/users/me (${actor.label})`);

    const updateResponse = await request(apiBaseUrl, '/api/users/me', {
        method: 'PATCH',
        token: actor.accessToken,
        body: patchBody,
    });
    assertStatus(updateResponse, [200], `PATCH /api/users/me (${actor.label})`);

    const profileResponse = await request(apiBaseUrl, '/api/users/me/profile', {
        token: actor.accessToken,
    });
    assertStatus(profileResponse, [200], `GET /api/users/me/profile (${actor.label})`);

    const twoFactorStatusResponse = await request(apiBaseUrl, '/api/auth/2fa/status', {
        token: actor.accessToken,
    });
    assertStatus(twoFactorStatusResponse, [200], `GET /api/auth/2fa/status (${actor.label})`);
}

async function loadCatalog(apiBaseUrl) {
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
    const bookingFeatureId = featuresResponse.json.find((feature) =>
        typeof feature?.name === 'string'
        && feature.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('reserv'),
    )?.id;

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

    return {
        categoryId,
        featureId,
        bookingFeatureId: typeof bookingFeatureId === 'string' ? bookingFeatureId : null,
        provinceId,
        cityId,
    };
}

async function resolveAdminActor(apiBaseUrl) {
    const email = process.env.SAAS_SMOKE_ADMIN_EMAIL?.trim();
    const password = process.env.SAAS_SMOKE_ADMIN_PASSWORD?.trim();

    if (email && password) {
        return loginActor(apiBaseUrl, {
            email,
            password,
            label: 'admin',
        });
    }

    if (isLocalApiBaseUrl(apiBaseUrl)) {
        console.log('Using local seeded admin credentials for SaaS smoke');
        return loginActor(apiBaseUrl, {
            email: LOCAL_ADMIN_EMAIL,
            password: LOCAL_ADMIN_PASSWORD,
            label: 'admin',
        });
    }

    console.log('Skipping admin flows: set SAAS_SMOKE_ADMIN_EMAIL and SAAS_SMOKE_ADMIN_PASSWORD');
    return null;
}

async function createOrganization(apiBaseUrl, owner, runId) {
    const createOrganizationResponse = await request(apiBaseUrl, '/api/organizations', {
        method: 'POST',
        token: owner.accessToken,
        body: {
            name: `Smoke Org ${runId}`,
        },
    });
    assertStatus(createOrganizationResponse, [201], 'POST /api/organizations');

    const organizationId = createOrganizationResponse.json?.id;
    assert(typeof organizationId === 'string', 'Missing organization id');

    const myOrganizationsResponse = await request(apiBaseUrl, '/api/organizations/mine', {
        token: owner.accessToken,
    });
    assertStatus(myOrganizationsResponse, [200], 'GET /api/organizations/mine');
    assert(
        Array.isArray(myOrganizationsResponse.json)
        && myOrganizationsResponse.json.some((organization) => organization.id === organizationId),
        'Created organization is missing from /api/organizations/mine',
    );

    const organizationEndpoints = [
        `/api/organizations/${organizationId}`,
        `/api/organizations/${organizationId}/members`,
        `/api/organizations/${organizationId}/invites`,
        `/api/organizations/${organizationId}/subscription`,
        `/api/organizations/${organizationId}/usage`,
        `/api/organizations/${organizationId}/audit-logs`,
    ];

    for (const endpoint of organizationEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: owner.accessToken,
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const updateOrganizationResponse = await request(apiBaseUrl, `/api/organizations/${organizationId}`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: {
            name: `Smoke Org ${runId} Updated`,
        },
    });
    assertStatus(updateOrganizationResponse, [200], `PATCH /api/organizations/${organizationId}`);

    const updateSubscriptionResponse = await request(
        apiBaseUrl,
        `/api/organizations/${organizationId}/subscription`,
        {
            method: 'PATCH',
            token: owner.accessToken,
            body: {
                plan: 'FREE',
                subscriptionStatus: 'ACTIVE',
            },
        },
    );
    assertStatus(updateSubscriptionResponse, [200], `PATCH /api/organizations/${organizationId}/subscription`);

    const inviteResponse = await request(apiBaseUrl, `/api/organizations/${organizationId}/invites`, {
        method: 'POST',
        token: owner.accessToken,
        body: {
            email: `invite.${runId}@example.com`,
            role: 'STAFF',
        },
    });
    assertStatus(inviteResponse, [201], `POST /api/organizations/${organizationId}/invites`);

    return organizationId;
}

async function createBusiness(apiBaseUrl, owner, organizationId, catalog, runId) {
    const featureIds = [catalog.featureId, catalog.bookingFeatureId].filter(Boolean);
    const createBusinessResponse = await request(apiBaseUrl, '/api/businesses', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            name: `Smoke Business ${runId}`,
            description: 'Business created by smoke flow for end to end validation.',
            phone: '+18095550002',
            whatsapp: '+18095550003',
            address: 'Calle Principal 123',
            provinceId: catalog.provinceId,
            cityId: catalog.cityId,
            latitude: 18.4861,
            longitude: -69.9312,
            categoryIds: [catalog.categoryId],
            featureIds,
        },
    });
    assertStatus(createBusinessResponse, [201], 'POST /api/businesses');

    const businessId = createBusinessResponse.json?.id;
    assert(typeof businessId === 'string', 'Missing business id');

    const ownerBusinessEndpoints = [
        '/api/businesses/my',
        `/api/businesses/${businessId}`,
    ];

    for (const endpoint of ownerBusinessEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: owner.accessToken,
            organizationId,
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const updateBusinessResponse = await request(apiBaseUrl, `/api/businesses/${businessId}`, {
        method: 'PUT',
        token: owner.accessToken,
        organizationId,
        body: {
            description: 'Updated description by smoke flow.',
            address: 'Calle Secundaria 456',
            categoryIds: [catalog.categoryId],
            featureIds,
        },
    });
    assertStatus(updateBusinessResponse, [200], `PUT /api/businesses/${businessId}`);

    return businessId;
}

async function runPublicDiscoverySmoke(apiBaseUrl, businessName, businessId) {
    const publicBusinessesResponse = await request(apiBaseUrl, '/api/businesses?limit=5');
    assertStatus(publicBusinessesResponse, [200], 'GET /api/businesses');

    const nearbyResponse = await request(
        apiBaseUrl,
        '/api/businesses/nearby?lat=18.4861&lng=-69.9312&radius=10',
    );
    assertStatus(nearbyResponse, [200], 'GET /api/businesses/nearby');

    const searchBusinessesResponse = await request(
        apiBaseUrl,
        `/api/search/businesses?q=${encodeURIComponent(businessName)}&limit=5`,
    );
    assertStatus(searchBusinessesResponse, [200], 'GET /api/search/businesses');

    const discoveryResponse = await request(
        apiBaseUrl,
        '/api/discovery/businesses/nearby?lat=18.4861&lng=-69.9312&radiusKm=10&limit=5',
    );
    assertStatus(discoveryResponse, [200], 'GET /api/discovery/businesses/nearby');

    const reputationProfileResponse = await request(apiBaseUrl, `/api/reputation/business/${businessId}`);
    assertStatus(reputationProfileResponse, [200], `GET /api/reputation/business/${businessId}`);

    const rankingsResponse = await request(apiBaseUrl, '/api/reputation/rankings?limit=10');
    assertStatus(rankingsResponse, [200], 'GET /api/reputation/rankings');
}

async function verifyBusinessIfAdminAvailable(apiBaseUrl, admin, businessId) {
    if (!admin) {
        return false;
    }

    const verifyBusinessResponse = await request(apiBaseUrl, `/api/businesses/${businessId}/verify`, {
        method: 'PUT',
        token: admin.accessToken,
    });
    assertStatus(verifyBusinessResponse, [200], `PUT /api/businesses/${businessId}/verify`);
    return true;
}

async function runCustomerFavoritesSmoke(apiBaseUrl, customer, businessId, runId) {
    const favoriteBusinessesResponse = await request(apiBaseUrl, '/api/favorites/businesses/my?limit=8', {
        token: customer.accessToken,
    });
    assertStatus(favoriteBusinessesResponse, [200], 'GET /api/favorites/businesses/my');

    const businessListsResponse = await request(apiBaseUrl, '/api/favorites/lists/my?limit=8', {
        token: customer.accessToken,
    });
    assertStatus(businessListsResponse, [200], 'GET /api/favorites/lists/my');

    const addFavoriteResponse = await request(apiBaseUrl, '/api/favorites/businesses/toggle', {
        method: 'POST',
        token: customer.accessToken,
        body: {
            businessId,
        },
    });
    assertStatus(addFavoriteResponse, [200, 201], 'POST /api/favorites/businesses/toggle (add)');

    const createListResponse = await request(apiBaseUrl, '/api/favorites/lists', {
        method: 'POST',
        token: customer.accessToken,
        body: {
            name: `Smoke List ${runId}`,
            description: 'List created by smoke flow.',
            isPublic: false,
        },
    });
    assertStatus(createListResponse, [200, 201], 'POST /api/favorites/lists');

    const listId = createListResponse.json?.id;
    assert(typeof listId === 'string', 'Missing favorite list id');

    const addToListResponse = await request(apiBaseUrl, `/api/favorites/lists/${listId}/items`, {
        method: 'POST',
        token: customer.accessToken,
        body: {
            businessId,
        },
    });
    assertStatus(addToListResponse, [200, 201], `POST /api/favorites/lists/${listId}/items`);

    const removeFromListResponse = await request(
        apiBaseUrl,
        `/api/favorites/lists/${listId}/items/${businessId}`,
        {
            method: 'DELETE',
            token: customer.accessToken,
        },
    );
    assertStatus(removeFromListResponse, [200], `DELETE /api/favorites/lists/${listId}/items/${businessId}`);

    const deleteListResponse = await request(apiBaseUrl, `/api/favorites/lists/${listId}`, {
        method: 'DELETE',
        token: customer.accessToken,
    });
    assertStatus(deleteListResponse, [200], `DELETE /api/favorites/lists/${listId}`);

    const removeFavoriteResponse = await request(apiBaseUrl, '/api/favorites/businesses/toggle', {
        method: 'POST',
        token: customer.accessToken,
        body: {
            businessId,
        },
    });
    assertStatus(removeFavoriteResponse, [200, 201], 'POST /api/favorites/businesses/toggle (remove)');
}

async function runPromotionsSmoke(apiBaseUrl, owner, organizationId, businessId, runId) {
    const now = Date.now();
    const startsAt = new Date(now - 60 * 60 * 1000).toISOString();
    const endsAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();

    const createPromotionResponse = await request(apiBaseUrl, '/api/promotions', {
        method: 'POST',
        token: owner.accessToken,
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
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(myPromotionsResponse, [200], 'GET /api/promotions/my');

    const updatePromotionResponse = await request(apiBaseUrl, `/api/promotions/${promotionId}`, {
        method: 'PUT',
        token: owner.accessToken,
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

    return promotionId;
}

async function runCustomerActivitySmoke(apiBaseUrl, customer, businessId, promotionId) {
    const checkInResponse = await request(apiBaseUrl, '/api/checkins', {
        method: 'POST',
        token: customer.accessToken,
        body: {
            businessId,
        },
    });
    assertStatus(checkInResponse, [200, 201], 'POST /api/checkins');

    const myCheckInsResponse = await request(apiBaseUrl, '/api/checkins/my?limit=5', {
        token: customer.accessToken,
    });
    assertStatus(myCheckInsResponse, [200], 'GET /api/checkins/my');

    const checkInStatsResponse = await request(apiBaseUrl, `/api/checkins/business/${businessId}/stats`);
    assertStatus(checkInStatsResponse, [200], `GET /api/checkins/business/${businessId}/stats`);

    const bookingResponse = await request(apiBaseUrl, '/api/bookings', {
        method: 'POST',
        token: customer.accessToken,
        body: {
            businessId,
            promotionId,
            scheduledFor: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
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
 
    const myBookingsResponse = await request(apiBaseUrl, '/api/bookings/me?limit=10', {
        token: customer.accessToken,
    });
    assertStatus(myBookingsResponse, [200], 'GET /api/bookings/me');

    const createConversationResponse = await request(apiBaseUrl, '/api/messaging/conversations', {
        method: 'POST',
        token: customer.accessToken,
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
    assert(typeof conversationId === 'string', 'Missing conversation id');

    const myConversationsResponse = await request(apiBaseUrl, '/api/messaging/conversations/me?limit=10', {
        token: customer.accessToken,
    });
    assertStatus(myConversationsResponse, [200], 'GET /api/messaging/conversations/me');

    const customerThreadResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/me/${conversationId}`,
        {
            token: customer.accessToken,
        },
    );
    assertStatus(customerThreadResponse, [200], `GET /api/messaging/conversations/me/${conversationId}`);

    const customerMessageResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/me/${conversationId}/messages`,
        {
            method: 'POST',
            token: customer.accessToken,
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

    const createReviewResponse = await request(apiBaseUrl, '/api/reviews', {
        method: 'POST',
        token: customer.accessToken,
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

    return {
        bookingId,
        conversationId,
        reviewId,
    };
}

async function runOwnerOperationalSmoke(apiBaseUrl, owner, organizationId, customerUserId, businessId, promotionId, bookingId, conversationId) {
    const orgBookingsResponse = await request(apiBaseUrl, '/api/bookings/my?limit=10', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(orgBookingsResponse, [200], 'GET /api/bookings/my');

    const bookingStatusResponse = await request(apiBaseUrl, `/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        token: owner.accessToken,
        organizationId,
        body: {
            status: 'CONFIRMED',
            quotedAmount: 1500,
            depositAmount: 300,
            notes: 'Confirmed by smoke flow',
        },
    });
    assertStatus(bookingStatusResponse, [200], `PATCH /api/bookings/${bookingId}/status`);

    const orgTransactionsResponse = await request(apiBaseUrl, '/api/bookings/transactions/my?limit=10', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(orgTransactionsResponse, [200], 'GET /api/bookings/transactions/my');

    const orgConversationsResponse = await request(apiBaseUrl, '/api/messaging/conversations/my?limit=10', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(orgConversationsResponse, [200], 'GET /api/messaging/conversations/my');

    const orgThreadResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/my/${conversationId}`,
        {
            token: owner.accessToken,
            organizationId,
        },
    );
    assertStatus(orgThreadResponse, [200], `GET /api/messaging/conversations/my/${conversationId}`);

    const orgMessageResponse = await request(
        apiBaseUrl,
        `/api/messaging/conversations/my/${conversationId}/messages`,
        {
            method: 'POST',
            token: owner.accessToken,
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
            token: owner.accessToken,
            organizationId,
            body: {
                scheduledFor: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
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
        [200, 201],
        `POST /api/messaging/conversations/my/${conversationId}/convert-booking`,
    );

    const crmCustomersResponse = await request(apiBaseUrl, '/api/crm/customers/my?limit=10', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(crmCustomersResponse, [200], 'GET /api/crm/customers/my');

    const crmHistoryResponse = await request(
        apiBaseUrl,
        `/api/crm/customers/${customerUserId}/history?businessId=${businessId}`,
        {
            token: owner.accessToken,
            organizationId,
        },
    );
    assertStatus(crmHistoryResponse, [200], `GET /api/crm/customers/${customerUserId}/history`);

    const analyticsEventResponse = await request(apiBaseUrl, '/api/analytics/events', {
        method: 'POST',
        body: {
            businessId,
            eventType: 'VIEW',
            amount: 0,
        },
    });
    assertStatus(analyticsEventResponse, [201], 'POST /api/analytics/events');

    const growthEventResponse = await request(apiBaseUrl, '/api/telemetry/growth', {
        method: 'POST',
        token: owner.accessToken,
        body: {
            eventType: 'LISTING_VIEW_CHANGE',
            businessId,
            metadata: {
                viewMode: 'list',
            },
        },
    });
    assertStatus(growthEventResponse, [200, 201], 'POST /api/telemetry/growth');

    const analyticsDashboardResponse = await request(apiBaseUrl, '/api/analytics/dashboard/my?days=30', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(analyticsDashboardResponse, [200], 'GET /api/analytics/dashboard/my');

    const analyticsBusinessResponse = await request(
        apiBaseUrl,
        `/api/analytics/business/${businessId}?days=30`,
        {
            token: owner.accessToken,
            organizationId,
        },
    );
    assertStatus(analyticsBusinessResponse, [200], `GET /api/analytics/business/${businessId}`);
}

async function runMonetizationSmoke(apiBaseUrl, owner, organizationId, bookingId) {
    const subscriptionCurrentResponse = await request(apiBaseUrl, '/api/subscriptions/current', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(subscriptionCurrentResponse, [200], 'GET /api/subscriptions/current');

    const subscriptionCheckoutResponse = await request(apiBaseUrl, '/api/subscriptions/checkout-session', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            planCode: 'GROWTH',
            successUrl: 'http://localhost:8080/dashboard?status=ok',
            cancelUrl: 'http://localhost:8080/dashboard?status=cancel',
        },
    });
    assertStatus(subscriptionCheckoutResponse, [201, 503], 'POST /api/subscriptions/checkout-session');

    const subscriptionCancelResponse = await request(apiBaseUrl, '/api/subscriptions/cancel-at-period-end', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(subscriptionCancelResponse, [200, 400, 503], 'POST /api/subscriptions/cancel-at-period-end');

    const paginatedPaymentEndpoints = [
        '/api/payments/my',
        '/api/payments/invoices/my',
        '/api/payments/ads-wallet/my',
    ];

    for (const endpoint of paginatedPaymentEndpoints) {
        const response = await request(apiBaseUrl, `${endpoint}?limit=10`, {
            token: owner.accessToken,
            organizationId,
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const billingReportEndpoints = [
        '/api/payments/reports/summary/my',
        '/api/payments/reports/fiscal/my',
    ];

    for (const endpoint of billingReportEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: owner.accessToken,
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
            token: owner.accessToken,
            organizationId,
            accept: 'text/csv',
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const adsWalletCheckoutResponse = await request(apiBaseUrl, '/api/payments/ads-wallet/checkout-session', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            amount: 250,
            successUrl: 'http://localhost:8080/dashboard?adsWallet=ok',
            cancelUrl: 'http://localhost:8080/dashboard?adsWallet=cancel',
        },
    });
    assertStatus(adsWalletCheckoutResponse, [201, 503], 'POST /api/payments/ads-wallet/checkout-session');

    const bookingCheckoutResponse = await request(
        apiBaseUrl,
        `/api/payments/marketplace/bookings/${bookingId}/checkout-session`,
        {
            method: 'POST',
            token: owner.accessToken,
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
}

async function runAdsSmoke(apiBaseUrl, owner, organizationId, businessId, catalog, runId) {
    const createCampaignResponse = await request(apiBaseUrl, '/api/ads/campaigns', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            businessId,
            name: `Smoke Campaign ${runId}`,
            targetProvinceId: catalog.provinceId,
            targetCategoryId: catalog.categoryId,
            dailyBudget: 100,
            totalBudget: 500,
            bidAmount: 10,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'DRAFT',
        },
    });
    assertStatus(createCampaignResponse, [201], 'POST /api/ads/campaigns');

    const campaignsResponse = await request(apiBaseUrl, '/api/ads/campaigns/my?limit=10', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(campaignsResponse, [200], 'GET /api/ads/campaigns/my');

    const placementsResponse = await request(
        apiBaseUrl,
        `/api/ads/placements?provinceId=${catalog.provinceId}&categoryId=${catalog.categoryId}&limit=5`,
    );
    assertStatus(placementsResponse, [200], 'GET /api/ads/placements');
}

async function runVerificationSmoke(apiBaseUrl, owner, admin, organizationId, businessId, verificationFileUrl) {
    if (!verificationFileUrl) {
        console.log('Skipping verification document flow: set SAAS_SMOKE_VERIFICATION_FILE_URL to enable it');
        return;
    }

    const verificationDocumentResponse = await request(apiBaseUrl, '/api/verification/documents', {
        method: 'POST',
        token: owner.accessToken,
        organizationId,
        body: {
            businessId,
            documentType: 'BUSINESS_LICENSE',
            fileUrl: verificationFileUrl,
        },
    });
    assertStatus(verificationDocumentResponse, [201], 'POST /api/verification/documents');

    const verificationDocumentId = verificationDocumentResponse.json?.id;
    assert(typeof verificationDocumentId === 'string', 'Missing verification document id');

    const verificationDocumentsResponse = await request(apiBaseUrl, '/api/verification/documents/my?limit=10', {
        token: owner.accessToken,
        organizationId,
    });
    assertStatus(verificationDocumentsResponse, [200], 'GET /api/verification/documents/my');

    const verificationSubmitResponse = await request(
        apiBaseUrl,
        `/api/verification/businesses/${businessId}/submit`,
        {
            method: 'POST',
            token: owner.accessToken,
            organizationId,
            body: {
                notes: 'Smoke verification submission',
            },
        },
    );
    assertStatus(verificationSubmitResponse, [200, 201], `POST /api/verification/businesses/${businessId}/submit`);

    const verificationStatusResponse = await request(
        apiBaseUrl,
        `/api/verification/businesses/${businessId}/status`,
        {
            token: owner.accessToken,
            organizationId,
        },
    );
    assertStatus(verificationStatusResponse, [200], `GET /api/verification/businesses/${businessId}/status`);

    if (!admin) {
        return;
    }

    const pendingBusinessesResponse = await request(apiBaseUrl, '/api/verification/admin/pending-businesses?limit=50', {
        token: admin.accessToken,
    });
    assertStatus(pendingBusinessesResponse, [200], 'GET /api/verification/admin/pending-businesses');

    const reviewDocumentResponse = await request(
        apiBaseUrl,
        `/api/verification/admin/documents/${verificationDocumentId}/review`,
        {
            method: 'PATCH',
            token: admin.accessToken,
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
}

async function runAdminControlPlaneSmoke(apiBaseUrl, admin, catalog) {
    if (!admin) {
        return;
    }

    const adminReadEndpoints = [
        '/api/businesses/admin/all?limit=10',
        '/api/businesses/admin/catalog-quality?limit=10',
        `/api/analytics/growth/insights?days=30&limit=10&categoryId=${catalog.categoryId}`,
        `/api/analytics/market-insights?days=30&limit=10&provinceId=${catalog.provinceId}`,
        '/api/analytics/market-reports?limit=10',
        '/api/verification/admin/moderation-queue?limit=50',
        '/api/verification/admin/pending-businesses?limit=50',
        '/api/reviews/moderation/flagged?limit=50',
        '/api/health/dashboard',
        '/api/auth/2fa/status',
    ];

    for (const endpoint of adminReadEndpoints) {
        const response = await request(apiBaseUrl, endpoint, {
            token: admin.accessToken,
        });
        assertStatus(response, [200], `GET ${endpoint}`);
    }

    const metricsResponse = await request(apiBaseUrl, '/api/observability/metrics', {
        token: admin.accessToken,
        accept: 'text/plain',
    });
    assertStatus(metricsResponse, [200], 'GET /api/observability/metrics');
    assert(
        metricsResponse.text.includes('aquita_http_request_duration_seconds')
        || metricsResponse.text.includes('aquita_http_requests_total'),
        'Metrics payload is missing expected counters',
    );

    const generateMarketReportResponse = await request(apiBaseUrl, '/api/analytics/market-reports/generate', {
        method: 'POST',
        token: admin.accessToken,
        body: {
            reportType: 'PROVINCE_CATEGORY_DEMAND',
            days: 30,
            provinceId: catalog.provinceId,
            categoryId: catalog.categoryId,
        },
    });
    assertStatus(generateMarketReportResponse, [200, 201], 'POST /api/analytics/market-reports/generate');

    const marketReportId = generateMarketReportResponse.json?.id;
    if (typeof marketReportId === 'string') {
        const marketReportResponse = await request(apiBaseUrl, `/api/analytics/market-reports/${marketReportId}`, {
            token: admin.accessToken,
        });
        assertStatus(marketReportResponse, [200], `GET /api/analytics/market-reports/${marketReportId}`);
    }

    const smokeCategorySlug = `smoke-category-${randomUUID().slice(0, 8)}`;
    const createCategoryResponse = await request(apiBaseUrl, '/api/categories', {
        method: 'POST',
        token: admin.accessToken,
        body: {
            name: 'Smoke Category Audit',
            slug: smokeCategorySlug,
            icon: 'S',
        },
    });
    assertStatus(createCategoryResponse, [201], 'POST /api/categories (admin)');

    const smokeCategoryId = createCategoryResponse.json?.id;
    assert(typeof smokeCategoryId === 'string', 'Missing smoke category id');

    const updateCategoryResponse = await request(apiBaseUrl, `/api/categories/${smokeCategoryId}`, {
        method: 'PUT',
        token: admin.accessToken,
        body: {
            name: 'Smoke Category Audit Updated',
            slug: `${smokeCategorySlug}-updated`,
        },
    });
    assertStatus(updateCategoryResponse, [200], `PUT /api/categories/${smokeCategoryId}`);

    const deleteCategoryResponse = await request(apiBaseUrl, `/api/categories/${smokeCategoryId}`, {
        method: 'DELETE',
        token: admin.accessToken,
    });
    assertStatus(deleteCategoryResponse, [200], `DELETE /api/categories/${smokeCategoryId}`);
}

async function runAdminModerationSmoke(apiBaseUrl, admin, reviewId) {
    if (!admin || !reviewId) {
        return;
    }

    const flaggedReviewsResponse = await request(apiBaseUrl, '/api/reviews/moderation/flagged?limit=50', {
        token: admin.accessToken,
    });
    assertStatus(flaggedReviewsResponse, [200], 'GET /api/reviews/moderation/flagged');

    const moderateReviewResponse = await request(apiBaseUrl, `/api/reviews/${reviewId}/moderation`, {
        method: 'PATCH',
        token: admin.accessToken,
        body: {
            status: 'APPROVED',
        },
    });
    assertStatus(moderateReviewResponse, [200], `PATCH /api/reviews/${reviewId}/moderation`);
}

async function main() {
    const apiBaseUrl = normalizeBaseUrl(process.env.SAAS_SMOKE_API_BASE_URL, DEFAULT_API_BASE_URL);
    const verificationFileUrl = process.env.SAAS_SMOKE_VERIFICATION_FILE_URL?.trim();
    const runId = randomUUID().slice(0, 8);

    console.log(`Running SaaS role matrix smoke against ${apiBaseUrl} (run=${runId})`);

    const catalog = await loadCatalog(apiBaseUrl);

    let owner = await registerActor(apiBaseUrl, {
        runId,
        label: 'owner',
        role: 'BUSINESS_OWNER',
        name: `Smoke Owner ${runId}`,
        phone: '+18095550000',
    });
    owner = await maybeRefreshActorToken(apiBaseUrl, owner);
    await exerciseSelfEndpoints(apiBaseUrl, owner, {
        name: `Smoke Owner ${runId} Updated`,
        phone: '+18095550001',
    });

    const customer = await registerActor(apiBaseUrl, {
        runId,
        label: 'customer',
        role: 'USER',
        name: `Smoke Customer ${runId}`,
        phone: '+18095550100',
    });
    await exerciseSelfEndpoints(apiBaseUrl, customer, {
        name: `Smoke Customer ${runId} Updated`,
        phone: '+18095550101',
    });

    const admin = await resolveAdminActor(apiBaseUrl);
    const organizationId = await createOrganization(apiBaseUrl, owner, runId);
    const businessId = await createBusiness(apiBaseUrl, owner, organizationId, catalog, runId);

    await runPublicDiscoverySmoke(apiBaseUrl, `Smoke Business ${runId}`, businessId);
    const businessVerifiedViaAdmin = await verifyBusinessIfAdminAvailable(apiBaseUrl, admin, businessId);
    await runAdminControlPlaneSmoke(apiBaseUrl, admin, catalog);

    if (businessVerifiedViaAdmin) {
        await runCustomerFavoritesSmoke(apiBaseUrl, customer, businessId, runId);
        const promotionId = await runPromotionsSmoke(apiBaseUrl, owner, organizationId, businessId, runId);
        const customerActivity = await runCustomerActivitySmoke(apiBaseUrl, customer, businessId, promotionId);

        await runOwnerOperationalSmoke(
            apiBaseUrl,
            owner,
            organizationId,
            customer.userId,
            businessId,
            promotionId,
            customerActivity.bookingId,
            customerActivity.conversationId,
        );

        await runMonetizationSmoke(apiBaseUrl, owner, organizationId, customerActivity.bookingId);
        await runAdsSmoke(apiBaseUrl, owner, organizationId, businessId, catalog, runId);
        await runVerificationSmoke(apiBaseUrl, owner, admin, organizationId, businessId, verificationFileUrl);
        await runAdminModerationSmoke(apiBaseUrl, admin, customerActivity.reviewId);
    } else {
        console.log('Skipping verified USER and BUSINESS_OWNER flows because admin verification is unavailable');
    }

    console.log('SaaS role matrix smoke passed');
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SaaS smoke flow failed: ${message}`);
    process.exitCode = 1;
});
