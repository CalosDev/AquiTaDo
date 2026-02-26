import axios, { AxiosError, AxiosRequestConfig } from 'axios';

function resolveApiBaseUrl(rawBaseUrl: string): string {
    const normalizedBaseUrl = rawBaseUrl.trim().replace(/\/+$/, '');
    if (!normalizedBaseUrl) {
        return 'http://localhost:3000/api';
    }

    if (normalizedBaseUrl.endsWith('/api')) {
        return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl}/api`;
}

const API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_URL || 'http://localhost:3000');
const ACCESS_TOKEN_STORAGE_KEY = 'accessToken';
const hasWindow = typeof window !== 'undefined';

let accessTokenMemory: string | null = null;

function hydrateAccessTokenFromStorage(): void {
    if (!hasWindow) {
        return;
    }

    const sessionToken = sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    const legacyLocalToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    accessTokenMemory = sessionToken ?? legacyLocalToken;

    if (!sessionToken && legacyLocalToken) {
        sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, legacyLocalToken);
    }

    if (legacyLocalToken) {
        localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
}

hydrateAccessTokenFromStorage();

export function getAccessToken(): string | null {
    return accessTokenMemory;
}

export function setAccessToken(token: string | null): void {
    accessTokenMemory = token;

    if (!hasWindow) {
        return;
    }

    if (token) {
        sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
        localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
        return;
    }

    sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function clearAccessToken(): void {
    setAccessToken(null);
}

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15_000,
    headers: {
        'Content-Type': 'application/json',
    },
});

type RetryableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

let refreshRequestPromise: Promise<string | null> | null = null;

function clearAuthStorage() {
    clearAccessToken();
    if (!hasWindow) {
        return;
    }

    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('activeOrganizationId');
}

function shouldSkipRefresh(url: string | undefined): boolean {
    if (!url) {
        return false;
    }

    return (
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/logout')
    );
}

async function requestAccessTokenRefresh(): Promise<string | null> {
    if (refreshRequestPromise) {
        return refreshRequestPromise;
    }

    if (!hasWindow) {
        return null;
    }

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
        return null;
    }

    refreshRequestPromise = axios
        .post<{ accessToken: string; refreshToken: string; user?: unknown }>(
            `${API_BASE_URL}/auth/refresh`,
            { refreshToken },
            {
                headers: { 'Content-Type': 'application/json' },
            },
        )
        .then((response) => {
            const newAccessToken = response.data.accessToken;
            const newRefreshToken = response.data.refreshToken;

            if (!newAccessToken || !newRefreshToken) {
                return null;
            }

            setAccessToken(newAccessToken);
            localStorage.setItem('refreshToken', newRefreshToken);

            if (response.data.user) {
                localStorage.setItem('user', JSON.stringify(response.data.user));
            }

            return newAccessToken;
        })
        .catch(() => null)
        .finally(() => {
            refreshRequestPromise = null;
        });

    return refreshRequestPromise;
}

// Request interceptor to add JWT token
api.interceptors.request.use(
    (config) => {
        const token = getAccessToken();
        config.headers = config.headers ?? {};

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        const activeOrganizationId = localStorage.getItem('activeOrganizationId');
        if (activeOrganizationId) {
            config.headers['x-organization-id'] = activeOrganizationId;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const status = error.response?.status;
        const originalRequest = error.config as RetryableRequestConfig | undefined;

        if (status === 401 && originalRequest) {
            const hadAccessToken = !!getAccessToken();

            if (!originalRequest._retry && !shouldSkipRefresh(originalRequest.url)) {
                originalRequest._retry = true;
                const refreshedAccessToken = await requestAccessTokenRefresh();

                if (refreshedAccessToken) {
                    originalRequest.headers = originalRequest.headers ?? {};
                    originalRequest.headers.Authorization = `Bearer ${refreshedAccessToken}`;
                    return api(originalRequest);
                }
            }

            clearAuthStorage();
            if (hasWindow) {
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            }

            if (hasWindow && hadAccessToken && window.location.pathname !== '/login') {
                window.location.assign('/login');
            }
        }
        return Promise.reject(error);
    }
);

export default api;
