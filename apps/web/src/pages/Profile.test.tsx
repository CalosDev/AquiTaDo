import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Profile } from './Profile';
import { renderWithProviders } from '../test/renderWithProviders';

const endpointsMock = vi.hoisted(() => ({
    getMyProfileDetails: vi.fn(),
    updateMyProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    deleteAvatar: vi.fn(),
}));

vi.mock('../api/endpoints', () => ({
    usersApi: {
        getMyProfileDetails: endpointsMock.getMyProfileDetails,
        updateMyProfile: endpointsMock.updateMyProfile,
    },
    uploadApi: {
        uploadAvatar: endpointsMock.uploadAvatar,
        deleteAvatar: endpointsMock.deleteAvatar,
    },
}));

describe('Profile layout stability', () => {
    it('renders the role hero immediately from auth context while profile data is loading', () => {
        endpointsMock.getMyProfileDetails.mockReturnValue(new Promise(() => undefined));

        renderWithProviders(<Profile />, {
            isAuthenticated: true,
            user: {
                id: 'admin-1',
                name: 'Admin RD',
                email: 'admin@aquita.do',
                role: 'ADMIN',
            },
            router: { initialEntries: ['/profile'] },
        });

        expect(screen.getByText('Administrador')).toBeInTheDocument();
        expect(screen.getByText('Mi Perfil')).toBeInTheDocument();
        expect(screen.getByText('Usuarios')).toBeInTheDocument();
    });
});
