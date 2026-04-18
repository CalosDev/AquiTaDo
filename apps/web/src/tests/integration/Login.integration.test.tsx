import type { ContextType } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../../context/AuthContext';
import { Login } from '../../pages/Login';

type AuthContextValue = NonNullable<ContextType<typeof AuthContext>>;

function renderLogin(options?: {
    login?: ReturnType<typeof vi.fn>;
    loginWithGoogle?: ReturnType<typeof vi.fn>;
}) {
    const login = options?.login ?? vi.fn(async () => undefined);
    const loginWithGoogle = options?.loginWithGoogle ?? vi.fn(async () => undefined);

    render(
        <MemoryRouter initialEntries={['/login']}>
            <AuthContext.Provider
                value={{
                    user: null,
                    token: null,
                    refreshToken: null,
                    loading: false,
                    login: login as AuthContextValue['login'],
                    loginWithGoogle: loginWithGoogle as AuthContextValue['loginWithGoogle'],
                    register: vi.fn() as AuthContextValue['register'],
                    refreshProfile: vi.fn() as AuthContextValue['refreshProfile'],
                    logout: vi.fn() as AuthContextValue['logout'],
                    isAuthenticated: false,
                    isAdmin: false,
                    isBusinessOwner: false,
                    isCustomer: false,
                }}
            >
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/app" element={<div>app shell</div>} />
                </Routes>
            </AuthContext.Provider>
        </MemoryRouter>,
    );

    return {
        login,
        user: userEvent.setup(),
    };
}

describe('Login page integration', () => {
    it('navigates to /app after a successful login', async () => {
        const { user } = renderLogin();

        await user.type(screen.getByLabelText(/Correo electr/i), 'admin@aquita.do');
        await user.type(screen.getByLabelText(/Contrase/i), 'admin12345');
        await user.click(screen.getByRole('button', { name: /Iniciar sesi/i }));

        await waitFor(() => expect(screen.getByText('app shell')).toBeInTheDocument());
    });

    it('surfaces backend errors without leaving the submit button stuck', async () => {
        const login = vi.fn(async () => {
            throw {
                response: {
                    data: {
                        message: 'Credenciales invalidas',
                    },
                },
            };
        });
        const { user } = renderLogin({ login });

        await user.type(screen.getByLabelText(/Correo electr/i), 'admin@aquita.do');
        await user.type(screen.getByLabelText(/Contrase/i), 'wrong-password');
        await user.click(screen.getByRole('button', { name: /Iniciar sesi/i }));

        await waitFor(() => expect(screen.getByText(/Credenciales invalidas/i)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Iniciar sesi/i })).toBeEnabled();
        expect(login).toHaveBeenCalledTimes(1);
    });
});
