function parseBooleanFlag(rawValue: string | undefined, defaultValue: boolean): boolean {
    if (rawValue === undefined) {
        return defaultValue;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
    }

    return defaultValue;
}

export const featureFlags = {
    discoveryCoreMode: parseBooleanFlag(import.meta.env.VITE_DISCOVERY_CORE_MODE, true),
    aiConcierge: !parseBooleanFlag(import.meta.env.VITE_DISCOVERY_CORE_MODE, true)
        && parseBooleanFlag(import.meta.env.VITE_FEATURE_AI_CONCIERGE, false),
    sponsoredAds: !parseBooleanFlag(import.meta.env.VITE_DISCOVERY_CORE_MODE, true)
        && parseBooleanFlag(import.meta.env.VITE_FEATURE_SPONSORED_ADS, false),
    bookings: !parseBooleanFlag(import.meta.env.VITE_DISCOVERY_CORE_MODE, true)
        && parseBooleanFlag(import.meta.env.VITE_FEATURE_BOOKINGS, false),
    checkins: !parseBooleanFlag(import.meta.env.VITE_DISCOVERY_CORE_MODE, true)
        && parseBooleanFlag(import.meta.env.VITE_FEATURE_CHECKINS, false),
    messaging: !parseBooleanFlag(import.meta.env.VITE_DISCOVERY_CORE_MODE, true)
        && parseBooleanFlag(import.meta.env.VITE_FEATURE_MESSAGING, false),
} as const;
