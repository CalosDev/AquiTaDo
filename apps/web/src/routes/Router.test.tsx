import { cleanup, screen } from '@testing-library/react';
import { Outlet } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { AppRouter } from './Router';

function createModule(label: string, exportName: string) {
    return {
        [exportName]: () => <div>{label}</div>,
    };
}

vi.mock('../layouts/MainLayout', () => ({
    MainLayout: () => <Outlet />,
}));

vi.mock('../layouts/AuthLayout', () => ({
    AuthLayout: () => <Outlet />,
}));

vi.mock('../layouts/DashboardLayout', () => ({
    DashboardLayout: () => <Outlet />,
}));

vi.mock('../layouts/AdminLayout', () => ({
    AdminLayout: () => <Outlet />,
}));

vi.mock('./preload', () => ({
    pageLoaders: {
        home: async () => createModule('home page', 'Home'),
        appHome: async () => createModule('app home page', 'AppHome'),
        customerDashboard: async () => createModule('customer dashboard page', 'CustomerDashboard'),
        businessesList: async () => createModule('businesses list page', 'BusinessesList'),
        businessDetails: async () => createModule('business details page', 'BusinessDetails'),
        login: async () => createModule('login page', 'Login'),
        forgotPassword: async () => createModule('forgot password page', 'ForgotPassword'),
        resetPassword: async () => createModule('reset password page', 'ResetPassword'),
        register: async () => createModule('register page', 'Register'),
        suggestBusiness: async () => createModule('suggest business page', 'SuggestBusiness'),
        registerBusiness: async () => createModule('register business page', 'RegisterBusiness'),
        editBusiness: async () => createModule('edit business page', 'EditBusiness'),
        dashboardBusiness: async () => createModule('dashboard business page', 'DashboardBusiness'),
        adminDashboard: async () => createModule('admin dashboard page', 'AdminDashboard'),
        terms: async () => createModule('terms page', 'Terms'),
        privacy: async () => createModule('privacy page', 'Privacy'),
        about: async () => createModule('about page', 'About'),
        notFound: async () => createModule('not found page', 'NotFound'),
        profile: async () => createModule('profile page', 'Profile'),
        adminSecurity: async () => createModule('admin security page', 'AdminSecurity'),
        acceptOrganizationInvite: async () => createModule('invite page', 'AcceptOrganizationInvite'),
    },
}));

describe('AppRouter auth routes', () => {
    afterEach(() => {
        cleanup();
    });

    it('redirects unauthenticated users away from /security', async () => {
        renderWithProviders(<AppRouter />, {
            isAuthenticated: false,
            user: null,
            router: { initialEntries: ['/security'] },
        });

        expect(await screen.findByText('login page')).toBeInTheDocument();
        expect(screen.queryByText('admin security page')).not.toBeInTheDocument();
    });

    it('redirects non-admin users away from /security', async () => {
        renderWithProviders(<AppRouter />, {
            isAuthenticated: true,
            user: {
                id: 'user-1',
                name: 'Usuario RD',
                email: 'user@aquita.do',
                role: 'USER',
            },
            router: { initialEntries: ['/security'] },
        });

        expect(await screen.findByText('customer dashboard page')).toBeInTheDocument();
        expect(screen.queryByText('admin security page')).not.toBeInTheDocument();
    });

    it('allows admin users into /security', async () => {
        renderWithProviders(<AppRouter />, {
            isAuthenticated: true,
            user: {
                id: 'admin-1',
                name: 'Admin RD',
                email: 'admin@aquita.do',
                role: 'ADMIN',
            },
            router: { initialEntries: ['/security'] },
        });

        expect(await screen.findByText('admin security page')).toBeInTheDocument();
    });
});
