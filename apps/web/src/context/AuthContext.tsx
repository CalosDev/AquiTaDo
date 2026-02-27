/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useState, useEffect, ReactNode } from 'react';
import { clearAccessToken, getAccessToken, setAccessToken } from '../api/client';
import { authApi } from '../api/endpoints';
import { UserRole, isUserRole } from '../auth/roles';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatarUrl?: string | null;
    role: UserRole;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
    refreshProfile: () => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isBusinessOwner: boolean;
    isCustomer: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [refreshToken, setRefreshToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const clearSession = useCallback(() => {
        setToken(null);
        setRefreshToken(null);
        setUser(null);
        clearAccessToken();
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('activeOrganizationId');
    }, []);

    const applySession = useCallback((payload: {
        accessToken: string;
        refreshToken: string;
        user: User;
    }) => {
        const normalizedRole: UserRole = isUserRole(payload.user.role) ? payload.user.role : 'USER';
        const normalizedUser: User = {
            ...payload.user,
            role: normalizedRole,
        };

        setToken(payload.accessToken);
        setRefreshToken(payload.refreshToken);
        setUser(normalizedUser);
        setAccessToken(payload.accessToken);
        localStorage.setItem('refreshToken', payload.refreshToken);
        localStorage.setItem('user', JSON.stringify(normalizedUser));
    }, []);

    const refreshProfile = useCallback(async () => {
        const response = await authApi.getProfile();
        const profileData = response.data as User;
        const profile: User = {
            ...profileData,
            role: isUserRole(profileData.role) ? profileData.role : 'USER',
        };
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
    }, []);

    useEffect(() => {
        const bootstrapAuth = async () => {
            const savedToken = getAccessToken();
            const savedRefreshToken = localStorage.getItem('refreshToken');

            if (!savedToken && !savedRefreshToken) {
                setLoading(false);
                return;
            }

            try {
                if (savedToken) {
                    setToken(savedToken);
                }
                if (savedRefreshToken) {
                    setRefreshToken(savedRefreshToken);
                }

                await refreshProfile();
            } catch {
                if (!savedRefreshToken) {
                    clearSession();
                    setLoading(false);
                    return;
                }

                try {
                    const refreshResponse = await authApi.refresh({ refreshToken: savedRefreshToken });
                    const { accessToken, refreshToken: rotatedRefreshToken, user: refreshedUser } = refreshResponse.data;
                    applySession({
                        accessToken,
                        refreshToken: rotatedRefreshToken,
                        user: refreshedUser,
                    });
                } catch {
                    clearSession();
                }
            } finally {
                setLoading(false);
            }
        };

        void bootstrapAuth();
    }, [applySession, clearSession, refreshProfile]);

    useEffect(() => {
        const handleUnauthorized = () => {
            clearSession();
        };

        window.addEventListener('auth:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }, [clearSession]);

    const login = async (email: string, password: string) => {
        const response = await authApi.login({ email, password });
        const { accessToken, refreshToken: newRefreshToken, user: userData } = response.data;
        applySession({
            accessToken,
            refreshToken: newRefreshToken,
            user: userData,
        });
    };

    const register = async (name: string, email: string, password: string, phone?: string) => {
        const response = await authApi.register({ name, email, password, phone });
        const { accessToken, refreshToken: newRefreshToken, user: userData } = response.data;
        applySession({
            accessToken,
            refreshToken: newRefreshToken,
            user: userData,
        });
    };

    const logout = async () => {
        const currentRefreshToken = refreshToken ?? localStorage.getItem('refreshToken');
        if (currentRefreshToken) {
            try {
                await authApi.logout({ refreshToken: currentRefreshToken });
            } catch {
                // Ignore network/logout errors and clear client state anyway.
            }
        }
        clearSession();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                refreshToken,
                loading,
                login,
                register,
                refreshProfile,
                logout,
                isAuthenticated: !!token,
                isAdmin: user?.role === 'ADMIN',
                isBusinessOwner: user?.role === 'BUSINESS_OWNER',
                isCustomer: user?.role === 'USER',
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
