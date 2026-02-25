import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Footer } from './Footer';

describe('Footer', () => {
    it('renders main branding text', () => {
        render(
            <MemoryRouter>
                <Footer />
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: /aqui/i })).toBeInTheDocument();
        expect(screen.getByText(/Explora/i)).toBeInTheDocument();
    });
});
