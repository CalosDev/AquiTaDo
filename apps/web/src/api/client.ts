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

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

type RetryableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

let refreshRequestPromise: Promise<string | null> | null = null;

function clearAuthStorage() {
    localStorage.removeItem('accessToken');
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

            localStorage.setItem('accessToken', newAccessToken);
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
        const token = localStorage.getItem('accessToken');
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
            const hadAccessToken = !!localStorage.getItem('accessToken');

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
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));

            if (hadAccessToken && window.location.pathname !== '/login') {
                window.location.assign('/login');
            }
        }
        return Promise.reject(error);
    }
);

export default api;
