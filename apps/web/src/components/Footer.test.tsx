import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';
import { renderWithProviders } from '../test/renderWithProviders';

describe('Footer', () => {
    it('renders main branding text', () => {
        renderWithProviders(<Footer />, {
            isAuthenticated: false,
            user: null,
            router: { initialEntries: ['/'] },
        });

        expect(screen.getByRole('link', { name: /aqui/i })).toBeInTheDocument();
        expect(screen.getByText(/Explora/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /crear cuenta/i })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /panel admin/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /seguridad/i })).not.toBeInTheDocument();
    });

    it('renders compact footer navigation for auth surfaces', () => {
        renderWithProviders(<Footer compact />, {
            isAuthenticated: false,
            user: null,
            router: { initialEntries: ['/login'] },
        });

        const footers = screen.getAllByRole('contentinfo');
        const compactFooter = footers[footers.length - 1];

        expect(within(compactFooter).getByRole('link', { name: /aqui/i })).toBeInTheDocument();
        expect(within(compactFooter).getByRole('link', { name: /negocios/i })).toBeInTheDocument();
        expect(within(compactFooter).queryByText(/Geografia RD/i)).not.toBeInTheDocument();
    });
});
