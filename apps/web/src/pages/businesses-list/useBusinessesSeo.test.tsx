import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Business, Category, Province } from './types';
import { useBusinessesSeo } from './useBusinessesSeo';

const {
    applySeoMeta,
    removeJsonLd,
    upsertJsonLd,
} = vi.hoisted(() => ({
    applySeoMeta: vi.fn(),
    removeJsonLd: vi.fn(),
    upsertJsonLd: vi.fn(),
}));

vi.mock('../../seo/meta', () => ({
    applySeoMeta,
    removeJsonLd,
    upsertJsonLd,
}));

function createBusiness(overrides: Partial<Business> = {}): Business {
    return {
        id: 'biz-1',
        name: 'Cafe Central',
        slug: 'cafe-central',
        description: 'Cafe de especialidad',
        address: 'Calle 1',
        verified: true,
        images: [],
        ...overrides,
    };
}

function createCategory(overrides: Partial<Category> = {}): Category {
    return {
        id: 'cat-1',
        name: 'Cafes',
        slug: 'cafes',
        ...overrides,
    };
}

function createProvince(overrides: Partial<Province> = {}): Province {
    return {
        id: 'prov-1',
        name: 'Santo Domingo',
        slug: 'santo-domingo',
        ...overrides,
    };
}

describe('useBusinessesSeo', () => {
    beforeEach(() => {
        applySeoMeta.mockReset();
        removeJsonLd.mockReset();
        upsertJsonLd.mockReset();

        window.history.replaceState({}, '', '/businesses');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('applies seo meta and json-ld for a category and province listing with businesses', () => {
        const activeCategory = createCategory();
        const activeProvince = createProvince();
        const origin = window.location.origin;
        const businesses = [
            createBusiness(),
            createBusiness({
                id: 'biz-2',
                name: 'Panaderia Norte',
                slug: 'panaderia-norte',
            }),
        ];

        renderHook(() => useBusinessesSeo({
            activeCategory,
            activeCategoryDisplayName: 'Cafes',
            activeIntent: null,
            activeProvince,
            businesses,
            intentSlug: undefined,
            seoCanonicalPath: '/negocios/santo-domingo/cafes',
        }));

        expect(applySeoMeta).toHaveBeenCalledWith({
            title: 'Cafes en Santo Domingo | AquiTa.do',
            description: 'Descubre cafes en Santo Domingo. Compara opciones locales, contacta por WhatsApp y reserva en AquiTa.do.',
            canonicalPath: '/negocios/santo-domingo/cafes',
        });

        expect(upsertJsonLd).toHaveBeenCalledWith('businesses-list-breadcrumb', {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
                {
                    '@type': 'ListItem',
                    position: 1,
                    name: 'Inicio',
                    item: `${origin}/`,
                },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'Negocios',
                    item: `${origin}/businesses`,
                },
                {
                    '@type': 'ListItem',
                    position: 3,
                    name: 'Santo Domingo',
                    item: `${origin}/negocios/provincia/santo-domingo`,
                },
                {
                    '@type': 'ListItem',
                    position: 4,
                    name: 'Cafes',
                    item: `${origin}/negocios/santo-domingo/cafes`,
                },
            ],
        });

        expect(upsertJsonLd).toHaveBeenCalledWith('businesses-list-itemlist', {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Cafes en Santo Domingo',
            itemListElement: [
                {
                    '@type': 'ListItem',
                    position: 1,
                    name: 'Cafe Central',
                    url: `${origin}/businesses/cafe-central`,
                },
                {
                    '@type': 'ListItem',
                    position: 2,
                    name: 'Panaderia Norte',
                    url: `${origin}/businesses/panaderia-norte`,
                },
            ],
        });
    });

    it('removes the empty item list and cleans both json-ld entries on unmount', () => {
        const { unmount } = renderHook(() => useBusinessesSeo({
            activeCategory: null,
            activeCategoryDisplayName: '',
            activeIntent: {
                label: 'Negocios con delivery',
                description: 'Encuentra negocios que ofrecen delivery en Republica Dominicana.',
            },
            activeProvince: null,
            businesses: [],
            intentSlug: 'con-delivery',
            seoCanonicalPath: '/negocios/intencion/con-delivery',
        }));

        expect(applySeoMeta).toHaveBeenCalledWith({
            title: 'Negocios con delivery | AquiTa.do',
            description: 'Encuentra negocios que ofrecen delivery en Republica Dominicana. Contacta por WhatsApp o teléfono desde AquiTa.do.',
            canonicalPath: '/negocios/intencion/con-delivery',
        });
        expect(removeJsonLd).toHaveBeenCalledWith('businesses-list-itemlist');

        unmount();

        expect(removeJsonLd).toHaveBeenCalledWith('businesses-list-breadcrumb');
        expect(removeJsonLd).toHaveBeenCalledWith('businesses-list-itemlist');
    });
});
