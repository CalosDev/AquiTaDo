import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { renderWithProviders } from '../test/renderWithProviders';

const USER = {
    id: 'user-1',
    name: 'Usuario RD',
    email: 'user@aquita.do',
    role: 'USER' as const,
};

const OWNER = {
    id: 'owner-1',
    name: 'Owner RD',
    email: 'owner@aquita.do',
    role: 'BUSINESS_OWNER' as const,
};

const ADMIN = {
    id: 'admin-1',
    name: 'Admin RD',
    email: 'admin@aquita.do',
    role: 'ADMIN' as const,
};

function renderRoute({
    initialPath,
    isAuthenticated,
    user,
    roles,
    unauthorizedRedirectTo,
}: {
    initialPath: string;
    isAuthenticated: boolean;
    user: typeof USER | typeof OWNER | typeof ADMIN | null;
    roles?: Array<'USER' | 'BUSINESS_OWNER' | 'ADMIN'>;
    unauthorizedRedirectTo?: string;
}) {
    return renderWithProviders(
        <Routes>
            <Route
                path="/dashboard"
                element={(
                    <ProtectedRoute roles={roles} unauthorizedRedirectTo={unauthorizedRedirectTo}>
                        <div>contenido protegido</div>
                    </ProtectedRoute>
                )}
            />
            <Route
                path="/admin"
                element={(
                    <ProtectedRoute roles={['ADMIN']}>
                        <div>contenido admin</div>
                    </ProtectedRoute>
                )}
            />
            <Route path="/login" element={<div>pantalla login</div>} />
            <Route path="/app/customer" element={<div>panel cliente</div>} />
            <Route path="/forbidden" element={<div>forbidden</div>} />
        </Routes>,
        {
            isAuthenticated,
            user,
            router: { initialEntries: [initialPath] },
        },
    );
}

describe('ProtectedRoute', () => {
    afterEach(() => {
        cleanup();
    });

    it('redirects unauthenticated users to login', () => {
        renderRoute({
            initialPath: '/dashboard',
            isAuthenticated: false,
            user: null,
            roles: ['BUSINESS_OWNER'],
        });

        expect(screen.getByText('pantalla login')).toBeInTheDocument();
    });

    it('redirects authenticated user with wrong role to role home', () => {
        renderRoute({
            initialPath: '/dashboard',
            isAuthenticated: true,
            user: USER,
            roles: ['BUSINESS_OWNER'],
        });

        expect(screen.getByText('panel cliente')).toBeInTheDocument();
    });

    it('supports custom unauthorized redirect path', () => {
        renderRoute({
            initialPath: '/dashboard',
            isAuthenticated: true,
            user: USER,
            roles: ['BUSINESS_OWNER'],
            unauthorizedRedirectTo: '/forbidden',
        });

        expect(screen.getByText('forbidden')).toBeInTheDocument();
    });

    it('renders protected content when role is allowed', () => {
        renderRoute({
            initialPath: '/dashboard',
            isAuthenticated: true,
            user: OWNER,
            roles: ['BUSINESS_OWNER'],
        });

        expect(screen.getByText('contenido protegido')).toBeInTheDocument();
    });

    it('redirects admin away from owner-only dashboard to admin home', () => {
        renderRoute({
            initialPath: '/dashboard',
            isAuthenticated: true,
            user: ADMIN,
            roles: ['BUSINESS_OWNER'],
        });

        expect(screen.getByText('contenido admin')).toBeInTheDocument();
    });

    it('redirects business owner away from admin-only route to owner home', () => {
        renderRoute({
            initialPath: '/admin',
            isAuthenticated: true,
            user: OWNER,
        });

        expect(screen.getByText('contenido protegido')).toBeInTheDocument();
    });

    it('redirects user away from admin-only route to customer home', () => {
        renderRoute({
            initialPath: '/admin',
            isAuthenticated: true,
            user: USER,
        });

        expect(screen.getByText('panel cliente')).toBeInTheDocument();
    });
});
