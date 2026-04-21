import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessCard } from './BusinessCard';
import type { Business } from './types';

function createBusiness(overrides: Partial<Business> = {}): Business {
    return {
        id: 'biz-1',
        name: 'Cafe Central',
        slug: 'cafe-central',
        description: 'Cafe de especialidad',
        address: 'Calle 1',
        verified: true,
        openNow: true,
        todayHoursLabel: '8:00 AM - 6:00 PM',
        latitude: 18.48,
        longitude: -69.9,
        priceRange: '$$',
        reputationScore: 92,
        distanceKm: 2.4,
        province: { name: 'Distrito Nacional' },
        city: { name: 'Santo Domingo' },
        sector: { id: 'sector-1', name: 'Naco' },
        images: [],
        categories: [
            { category: { name: 'Cafe', parent: { name: 'Restaurantes' } } },
            { category: { name: 'Desayunos' } },
        ],
        _count: { reviews: 12 },
        ...overrides,
    };
}

function renderBusinessCard(props: Partial<React.ComponentProps<typeof BusinessCard>> = {}) {
    const business = props.business ?? createBusiness();

    render(
        <MemoryRouter>
            <BusinessCard
                business={business}
                businessPath={`/businesses/${business.slug}`}
                currentView="list"
                isAuthenticated={true}
                isCustomerRole={true}
                isFavorite={false}
                isFavoriteProcessing={false}
                isMappable={true}
                isPriorityImage={false}
                isSelectedOnMap={false}
                locationLabel="Naco · Santo Domingo"
                onBusinessClick={vi.fn()}
                onPrefetchBusiness={vi.fn()}
                onSelectBusiness={vi.fn()}
                onToggleFavorite={vi.fn()}
                priceChip="$$"
                primaryCategoryPath="Restaurantes / Cafe"
                ratingDisplay="4.6"
                reviewCount={12}
                secondaryCategoryName="Desayunos"
                trust={null}
                {...props}
            />
        </MemoryRouter>,
    );
}

describe('BusinessCard', () => {
    afterEach(() => {
        cleanup();
    });

    it('keeps the favorite button isolated from the card link click', async () => {
        const user = userEvent.setup();
        const onBusinessClick = vi.fn();
        const onToggleFavorite = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            event.stopPropagation();
        });

        renderBusinessCard({
            onBusinessClick,
            onToggleFavorite,
        });

        await user.click(screen.getByRole('button', { name: /Guardar Cafe Central en favoritos/i }));

        expect(onToggleFavorite).toHaveBeenCalledTimes(1);
        expect(onBusinessClick).not.toHaveBeenCalled();
    });

    it('prefetches and selects the business on hover while map view is active', async () => {
        const user = userEvent.setup();
        const onPrefetchBusiness = vi.fn();
        const onSelectBusiness = vi.fn();

        renderBusinessCard({
            currentView: 'map',
            onPrefetchBusiness,
            onSelectBusiness,
        });

        await user.hover(screen.getAllByRole('link', { name: /Cafe Central/i })[0]);

        expect(onPrefetchBusiness).toHaveBeenCalledTimes(1);
        expect(onPrefetchBusiness).toHaveBeenCalledWith(expect.objectContaining({ id: 'biz-1' }));
        expect(onSelectBusiness).toHaveBeenCalledTimes(1);
        expect(onSelectBusiness).toHaveBeenCalledWith('biz-1');
    });
});
