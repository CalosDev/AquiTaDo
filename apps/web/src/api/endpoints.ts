import api from './client';

// ---- Auth ----
export const authApi = {
    register: (data: { name: string; email: string; password: string; phone?: string }) =>
        api.post('/auth/register', data),
    login: (data: { email: string; password: string }) =>
        api.post('/auth/login', data),
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
};
