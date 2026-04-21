import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ListingControlsBar } from './ListingControlsBar';

describe('ListingControlsBar', () => {
    it('renders a sticky discovery toolbar shell', () => {
        render(
            <ListingControlsBar
                activeFilterCount={2}
                currentProvince=""
                currentView="list"
                filtersOpen={false}
                mappableResultsCount={8}
                onMapIntent={vi.fn()}
                onProvinceChange={vi.fn()}
                onSearchInputChange={vi.fn()}
                onSortChange={vi.fn()}
                onToggleFilters={vi.fn()}
                onViewModeChange={vi.fn()}
                provinces={[]}
                resultsCountLabel="Mostrando 8 resultados"
                searchInput=""
                sortKey="relevance"
                totalVisibleResults={8}
            />,
        );

        const searchInput = screen.getByPlaceholderText('Buscar restaurantes, colmados o servicios');
        const toolbar = searchInput.closest('.results-toolbar');

        expect(toolbar).toHaveClass('results-toolbar--sticky');
    });
});
