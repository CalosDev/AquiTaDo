import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import { BusinessDetails } from './BusinessDetails';
import { renderWithProviders } from '../test/renderWithProviders';

const mockBusiness = {
    id: 'biz-1',
    name: 'Cafe AquiTa',
    slug: 'cafe-aquita',
    description: 'Cafe de especialidad con brunch y reposteria artesanal.',
    address: 'Av. Winston Churchill 101',
    verified: true,
    claimStatus: 'CLAIMED',
    openNow: true,
    todayHoursLabel: '8:00 AM - 8:00 PM',
    createdAt: '2025-01-10T12:00:00.000Z',
    updatedAt: '2026-04-19T12:00:00.000Z',
    latitude: 18.47,
    longitude: -69.94,
    profileCompletenessScore: 92,
    reputationScore: 88,
    priceRange: 'MID',
    province: { id: 'prov-1', name: 'Distrito Nacional' },
    city: { id: 'city-1', name: 'Santo Domingo' },
    sector: { name: 'Piantini' },
    categories: [
        {
            category: {
                name: 'Cafe',
                icon: 'coffee',
                parent: { name: 'Restaurantes' },
            },
        },
    ],
    features: [],
    images: [
        { id: 'img-1', url: '/uploads/businesses/img-1.jpg', caption: 'Barra principal' },
        { id: 'img-2', url: '/uploads/businesses/img-2.jpg', caption: 'Salon interior', isCover: true },
        { id: 'img-3', url: '/uploads/businesses/img-3.jpg', caption: 'Cafe servido' },
        { id: 'img-4', url: '/uploads/businesses/img-4.jpg', caption: 'Terraza' },
    ],
    reviews: [
        {
            id: 'review-1',
            rating: 5,
            comment: 'Excelente cafe',
            createdAt: '2026-04-18T12:00:00.000Z',
            user: { name: 'Ana' },
        },
    ],
    _count: { reviews: 5 },
};

const endpointsMock = vi.hoisted(() => ({
    getBySlug: vi.fn(async () => ({ data: mockBusiness })),
    getByIdentifier: vi.fn(async () => ({ data: mockBusiness })),
    trackEvent: vi.fn(async () => undefined),
    getBusinessProfile: vi.fn(async () => ({
        data: {
            business: {
                id: mockBusiness.id,
                reputationScore: 88,
                reputationTier: 'GOLD',
                verified: true,
            },
            metrics: {
                averageRating: 4.8,
                reviewCount: 5,
                bookings: {
                    completed: 0,
                    confirmed: 0,
                    pending: 0,
                    canceled: 0,
                    noShow: 0,
                },
                successfulTransactions: 0,
                grossRevenue: 0,
            },
        },
    })),
    getPublicPromotions: vi.fn(async () => ({ data: [] })),
    getNearby: vi.fn(async () => ({ data: [] })),
    getReviews: vi.fn(async () => ({ data: mockBusiness.reviews })),
}));

vi.mock('../api/endpoints', () => ({
    analyticsApi: {
        trackEvent: endpointsMock.trackEvent,
    },
    bookingsApi: {
        create: vi.fn(async () => undefined),
    },
    businessApi: {
        getBySlug: endpointsMock.getBySlug,
        getByIdentifier: endpointsMock.getByIdentifier,
        getNearby: endpointsMock.getNearby,
        createPublicLead: vi.fn(async () => undefined),
        createClaimRequest: vi.fn(async () => undefined),
    },
    checkinsApi: {
        getBusinessStats: vi.fn(async () => ({ data: null })),
        create: vi.fn(async () => undefined),
    },
    favoritesApi: {
        getFavoriteBusinesses: vi.fn(async () => ({ data: { data: [] } })),
        getMyLists: vi.fn(async () => ({ data: { data: [] } })),
        toggleFavoriteBusiness: vi.fn(async () => ({ data: { favorite: null } })),
        createList: vi.fn(async () => ({ data: { id: 'list-1', name: 'Favoritos' } })),
        addBusinessToList: vi.fn(async () => undefined),
    },
    messagingApi: {
        createConversation: vi.fn(async () => undefined),
    },
    promotionsApi: {
        getPublic: endpointsMock.getPublicPromotions,
    },
    reputationApi: {
        getBusinessProfile: endpointsMock.getBusinessProfile,
    },
    reviewApi: {
        getByBusiness: endpointsMock.getReviews,
        create: vi.fn(async () => undefined),
    },
    whatsappApi: {
        createClickToChatLink: vi.fn(async () => ({ data: { url: 'https://wa.me/18095550101' } })),
    },
}));

describe('BusinessDetails visual gallery', () => {
    it('renders the photo-led hero and visual walkthrough when the business has multiple images', async () => {
        renderWithProviders(
            <Routes>
                <Route path="/businesses/:slug" element={<BusinessDetails />} />
            </Routes>,
            {
                isAuthenticated: false,
                user: null,
                router: { initialEntries: ['/businesses/cafe-aquita'] },
            },
        );

        expect(await screen.findByText(/galeria 4 fotos/i)).toBeInTheDocument();
        expect(screen.getByText(/recorrido visual/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /seleccionar foto 2/i })).toBeInTheDocument();
    });
});
