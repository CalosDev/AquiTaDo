import axios from 'axios';

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

// Request interceptor to add JWT token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
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
    (error) => {
        if (error.response?.status === 401) {
            const hadToken = !!localStorage.getItem('accessToken');
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
            localStorage.removeItem('activeOrganizationId');
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));

            if (hadToken && window.location.pathname !== '/login') {
                window.location.assign('/login');
            }
        }
        return Promise.reject(error);
    }
);

export default api;
