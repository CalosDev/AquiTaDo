import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { Footer } from './Footer';

describe('Footer', () => {
    it('renders main branding text', () => {
        render(
            <MemoryRouter>
                <AuthContext.Provider
                    value={{
                        user: null,
                        token: null,
                        refreshToken: null,
                        loading: false,
                        login: vi.fn(),
                        register: vi.fn(),
                        refreshProfile: vi.fn(),
                        logout: vi.fn(),
                        isAuthenticated: false,
                        isAdmin: false,
                        isBusinessOwner: false,
                        isCustomer: false,
                    }}
                >
                    <Footer />
                </AuthContext.Provider>
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: /aqui/i })).toBeInTheDocument();
        expect(screen.getByText(/Explora/i)).toBeInTheDocument();
    });
});
