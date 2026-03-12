import { describe, expect, it } from 'vitest';
import {
    calculateBasicProfileCompleteness,
    calculateBusinessDiscoveryRelevance,
    haversineDistanceKm,
} from './discovery-ranking';

describe('discovery ranking', () => {
    it('prioritizes trusted and complete businesses over recent sparse profiles', () => {
        const established = calculateBusinessDiscoveryRelevance(
            {
                name: 'Cafe Local',
                description: 'Cafe de especialidad en Naco',
                address: 'Calle Principal, Naco',
                phone: '8095550101',
                whatsapp: '8095550101',
                verified: true,
                reputationScore: 82,
                createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
                categories: [{ category: { name: 'Restaurantes' } }],
                images: [{ url: '/cafe.jpg' }],
                city: { name: 'Santo Domingo' },
                province: { name: 'Distrito Nacional' },
                _count: { reviews: 18 },
            },
            { search: 'cafe' },
            { views: 180, clicks: 40, reservationRequests: 8 },
        );

        const sparseRecent = calculateBusinessDiscoveryRelevance(
            {
                name: 'Cafe Nuevo',
                description: '',
                address: '',
                verified: false,
                reputationScore: 10,
                createdAt: new Date(),
                categories: [],
                images: [],
                city: null,
                province: { name: 'Distrito Nacional' },
                _count: { reviews: 0 },
            },
            { search: 'cafe' },
            { views: 0, clicks: 0, reservationRequests: 0 },
        );

        expect(established.score).toBeGreaterThan(sparseRecent.score);
        expect(established.breakdown.profileCompleteness).toBeGreaterThan(sparseRecent.breakdown.profileCompleteness);
    });

    it('adds distance weight when geolocation is available', () => {
        const near = calculateBusinessDiscoveryRelevance(
            {
                name: 'Ferreteria Centro',
                verified: true,
                reputationScore: 70,
                createdAt: new Date(),
                latitude: 18.4861,
                longitude: -69.9312,
                categories: [{ category: { name: 'Ferreterias' } }],
                images: [{ url: '/ferreteria.jpg' }],
                city: { name: 'Santo Domingo' },
                province: { name: 'Distrito Nacional' },
                _count: { reviews: 8 },
            },
            { lat: 18.4858, lng: -69.9310, radiusKm: 5 },
        );

        const far = calculateBusinessDiscoveryRelevance(
            {
                name: 'Ferreteria Lejana',
                verified: true,
                reputationScore: 70,
                createdAt: new Date(),
                latitude: 18.65,
                longitude: -70.05,
                categories: [{ category: { name: 'Ferreterias' } }],
                images: [{ url: '/ferreteria.jpg' }],
                city: { name: 'Santo Domingo' },
                province: { name: 'Distrito Nacional' },
                _count: { reviews: 8 },
            },
            { lat: 18.4858, lng: -69.9310, radiusKm: 5 },
        );

        expect(near.breakdown.distanceKm).not.toBeNull();
        expect(far.breakdown.distanceKm).not.toBeNull();
        expect(near.breakdown.distance).toBeGreaterThan(far.breakdown.distance);
        expect(near.score).toBeGreaterThan(far.score);
    });

    it('computes maximum profile completeness for a rich public business profile', () => {
        const score = calculateBasicProfileCompleteness({
            name: 'Salon RD',
            description: 'Salon de belleza',
            address: 'Av. Kennedy',
            phone: '8095550000',
            whatsapp: '8095550000',
            website: 'https://salon-rd.do',
            email: 'hola@salon-rd.do',
            instagramUrl: 'https://instagram.com/salonrd',
            priceRange: 'MID',
            verified: true,
            createdAt: new Date(),
            latitude: 18.4861,
            longitude: -69.9312,
            categories: [{ category: { name: 'Salones' } }],
            images: [{ url: '/salon.jpg', isCover: true }],
            city: { name: 'Santo Domingo' },
            sector: { name: 'Naco' },
            hours: [
                { dayOfWeek: 1, opensAt: '08:00', closesAt: '18:00', closed: false },
                { dayOfWeek: 2, opensAt: '08:00', closesAt: '18:00', closed: false },
                { dayOfWeek: 3, opensAt: '08:00', closesAt: '18:00', closed: false },
                { dayOfWeek: 4, opensAt: '08:00', closesAt: '18:00', closed: false },
                { dayOfWeek: 5, opensAt: '08:00', closesAt: '18:00', closed: false },
            ],
        });

        expect(score).toBe(20);
    });

    it('computes haversine distance consistently', () => {
        const distanceKm = haversineDistanceKm(18.4861, -69.9312, 18.4896, -69.9312);
        expect(distanceKm).toBeGreaterThan(0.3);
        expect(distanceKm).toBeLessThan(0.5);
    });
});
