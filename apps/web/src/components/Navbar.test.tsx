import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Navbar } from './Navbar';
import { renderWithProviders } from '../test/renderWithProviders';

const USER = {
    id: 'user-1',
    name: 'Juan Perez',
    email: 'user@aquita.do',
    role: 'USER' as const,
};

const OWNER = {
    id: 'owner-1',
    name: 'Ana Negocio',
    email: 'owner@aquita.do',
    role: 'BUSINESS_OWNER' as const,
};

const ADMIN = {
    id: 'admin-1',
    name: 'Admin Operaciones',
    email: 'admin@aquita.do',
    role: 'ADMIN' as const,
};

describe('Navbar role navigation', () => {
    afterEach(() => {
        cleanup();
    });

    it('shows public links for guests', () => {
        renderWithProviders(<Navbar />, {
            isAuthenticated: false,
            user: null,
            router: { initialEntries: ['/'] },
        });

        expect(screen.getAllByRole('link', { name: /negocios/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: /nosotros/i }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('link', { name: /mi panel/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /seguridad/i })).not.toBeInTheDocument();
    });

    it('shows customer-only navigation for USER', () => {
        renderWithProviders(<Navbar />, {
            isAuthenticated: true,
            user: USER,
            router: { initialEntries: ['/app/customer'] },
        });

        expect(screen.getAllByRole('link', { name: /mi panel/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: /perfil/i }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('link', { name: /nosotros/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /seguridad/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /\+ registrar/i })).not.toBeInTheDocument();
    });

    it('shows business-owner CTA only for BUSINESS_OWNER', () => {
        renderWithProviders(<Navbar />, {
            isAuthenticated: true,
            user: OWNER,
            router: { initialEntries: ['/dashboard'] },
        });

        expect(screen.getAllByRole('link', { name: /panel negocio/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: /\+ registrar/i }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('link', { name: /seguridad/i })).not.toBeInTheDocument();
    });

    it('shows security navigation only for ADMIN', () => {
        renderWithProviders(<Navbar />, {
            isAuthenticated: true,
            user: ADMIN,
            router: { initialEntries: ['/admin'] },
        });

        expect(screen.getAllByRole('link', { name: /panel admin/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByRole('link', { name: /seguridad/i }).length).toBeGreaterThan(0);
        expect(screen.queryByRole('link', { name: /\+ registrar/i })).not.toBeInTheDocument();
    });
});
