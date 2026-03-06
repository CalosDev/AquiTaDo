/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_API_TIMEOUT_MS?: string;
    readonly VITE_PUBLIC_WEB_URL?: string;
    readonly VITE_FEATURE_AI_CONCIERGE?: string;
    readonly VITE_FEATURE_SPONSORED_ADS?: string;
    readonly VITE_FEATURE_BOOKINGS?: string;
    readonly VITE_FEATURE_CHECKINS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
