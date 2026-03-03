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
    register: (
        name: string,
        email: string,
        password: string,
        phone?: string,
        role?: 'USER' | 'BUSINESS_OWNER',
    ) => Promise<void>;
    refreshProfile: () => Promise<void>;
    logout: () => Promise<void>;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isBusinessOwner: boolean;
    isCustomer: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_HINT_STORAGE_KEY = 'aquita_has_session';
const canUseWindow = typeof window !== 'undefined';

function isTokenExpiredOrNearExpiry(token: string): boolean {
    try {
        const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
        const expSeconds = Number(payload?.exp);
        if (!Number.isFinite(expSeconds)) {
            return false;
        }

        // Refresh one minute before expiration to avoid bootstrap 401 noise.
        return (expSeconds * 1000) <= (Date.now() + 60_000);
    } catch {
        return true;
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const clearSession = useCallback(() => {
        setToken(null);
        setUser(null);
        clearAccessToken();
        localStorage.removeItem('user');
        localStorage.removeItem('activeOrganizationId');
        localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
    }, []);

    const applySession = useCallback((payload: {
        accessToken: string;
        user: User;
    }) => {
        const normalizedRole: UserRole = isUserRole(payload.user.role) ? payload.user.role : 'USER';
        const normalizedUser: User = {
            ...payload.user,
            role: normalizedRole,
        };

        setToken(payload.accessToken);
        setUser(normalizedUser);
        setAccessToken(payload.accessToken);
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        localStorage.setItem(SESSION_HINT_STORAGE_KEY, '1');
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
            const hasSessionHint = canUseWindow
                ? localStorage.getItem(SESSION_HINT_STORAGE_KEY) === '1'
                : false;

            if (savedToken && !isTokenExpiredOrNearExpiry(savedToken)) {
                try {
                    setToken(savedToken);
                    await refreshProfile();
                } catch {
                    clearSession();
                } finally {
                    setLoading(false);
                }
                return;
            }

            if (!hasSessionHint) {
                setLoading(false);
                return;
            }

            try {
                const refreshResponse = await authApi.refresh();
                const { accessToken, user: refreshedUser } = refreshResponse.data;

                if (!accessToken || !refreshedUser) {
                    clearSession();
                    setLoading(false);
                    return;
                }

                applySession({
                    accessToken,
                    user: refreshedUser,
                });
            } catch {
                clearSession();
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
        const { accessToken, user: userData } = response.data;
        applySession({
            accessToken,
            user: userData,
        });
    };

    const register = async (
        name: string,
        email: string,
        password: string,
        phone?: string,
        role?: 'USER' | 'BUSINESS_OWNER',
    ) => {
        const response = await authApi.register({ name, email, password, phone, role });
        const { accessToken, user: userData } = response.data;
        applySession({
            accessToken,
            user: userData,
        });
    };

    const logout = async () => {
        try {
            await authApi.logout();
        } catch {
            // Ignore network/logout errors and clear client state anyway.
        }
        clearSession();
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                refreshToken: null,
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
