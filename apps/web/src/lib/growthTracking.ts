import { analyticsApi } from '../api/endpoints';
import { getOrCreateSessionId, getOrCreateVisitorId } from './clientContext';

export type GrowthTrackingEventType =
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
    | 'BUSINESS_ONBOARDING_COMPLETE';

type GrowthTrackingPayload = {
    eventType: GrowthTrackingEventType;
    businessId?: string;
    categoryId?: string;
    provinceId?: string;
    cityId?: string;
    variantKey?: string;
    searchQuery?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
};

export function trackGrowthEvent(payload: GrowthTrackingPayload) {
    return analyticsApi.trackGrowthEvent({
        ...payload,
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
    }).catch(() => undefined);
}
