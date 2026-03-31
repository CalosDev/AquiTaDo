import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, MemoryRouterProps } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext } from '../context/AuthContext';
import { OrganizationContext, OrganizationSummary } from '../context/OrganizationContext';

type UserRole = 'USER' | 'BUSINESS_OWNER' | 'ADMIN';

interface TestUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
}

interface RenderWithProvidersOptions {
    isAuthenticated?: boolean;
    user?: TestUser | null;
    organization?: OrganizationSummary | null;
    organizations?: OrganizationSummary[];
    router?: Omit<MemoryRouterProps, 'children'>;
    renderOptions?: Omit<RenderOptions, 'wrapper'>;
}

const EMPTY_ORGS: OrganizationSummary[] = [];

export function renderWithProviders(
    ui: ReactElement,
    {
        isAuthenticated = false,
        user = null,
        organization = null,
        organizations = EMPTY_ORGS,
        router,
        renderOptions,
    }: RenderWithProvidersOptions = {},
) {
    const authUser = user && isAuthenticated
        ? user
        : null;

    const authValue = {
        user: authUser,
        token: isAuthenticated ? 'token' : null,
        refreshToken: null,
        loading: false,
        login: vi.fn(),
        loginWithGoogle: vi.fn(),
        register: vi.fn(),
        refreshProfile: vi.fn(),
        logout: vi.fn(),
        isAuthenticated,
        isAdmin: authUser?.role === 'ADMIN',
        isBusinessOwner: authUser?.role === 'BUSINESS_OWNER',
        isCustomer: authUser?.role === 'USER',
    };

    const organizationValue = {
        organizations,
        activeOrganizationId: organization?.id || null,
        activeOrganization: organization,
        loading: false,
        error: '',
        refreshOrganizations: vi.fn(async () => undefined),
        setActiveOrganizationId: vi.fn(),
    };

    return render(
        <MemoryRouter {...router}>
            <AuthContext.Provider value={authValue}>
                <OrganizationContext.Provider value={organizationValue}>
                    {ui}
                </OrganizationContext.Provider>
            </AuthContext.Provider>
        </MemoryRouter>,
        renderOptions,
    );
}
