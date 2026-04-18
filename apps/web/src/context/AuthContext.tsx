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
    twoFactorEnabled?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    loading: boolean;
    login: (email: string, password: string, twoFactorCode?: string) => Promise<void>;
    loginWithGoogle: (idToken: string, role?: 'USER' | 'BUSINESS_OWNER', twoFactorCode?: string) => Promise<void>;
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
const AUTH_SYNC_STORAGE_KEY = 'aquita_auth_sync';
const canUseWindow = typeof window !== 'undefined';

function broadcastAuthSync(type: 'login' | 'logout'): void {
    if (!canUseWindow) {
        return;
    }

    localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify({
        type,
        at: Date.now(),
    }));
}

function normalizeStoredUser(value: unknown): User | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const candidate = value as Partial<User>;
    if (
        typeof candidate.id !== 'string'
        || typeof candidate.name !== 'string'
        || typeof candidate.email !== 'string'
    ) {
        return null;
    }

    return {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        phone: typeof candidate.phone === 'string' ? candidate.phone : undefined,
        avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : null,
        role: isUserRole(candidate.role) ? candidate.role : 'USER',
        twoFactorEnabled: typeof candidate.twoFactorEnabled === 'boolean'
            ? candidate.twoFactorEnabled
            : undefined,
    };
}

function readStoredUser(): User | null {
    if (!canUseWindow) {
        return null;
    }

    const rawUser = localStorage.getItem('user');
    if (!rawUser) {
        return null;
    }

    try {
        return normalizeStoredUser(JSON.parse(rawUser));
    } catch {
        localStorage.removeItem('user');
        return null;
    }
}

function shouldBootstrapSession(): boolean {
    if (!canUseWindow) {
        return true;
    }

    const savedToken = getAccessToken();
    const hasSessionHint = localStorage.getItem(SESSION_HINT_STORAGE_KEY) === '1';
    return Boolean(savedToken || hasSessionHint);
}

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
    const [user, setUser] = useState<User | null>(() => readStoredUser());
    const [token, setToken] = useState<string | null>(() => (canUseWindow ? getAccessToken() : null));
    const [loading, setLoading] = useState(() => shouldBootstrapSession());

    const clearSession = useCallback((options?: { broadcast?: boolean }) => {
        const shouldBroadcast = options?.broadcast ?? true;
        setToken(null);
        setUser(null);
        clearAccessToken();
        localStorage.removeItem('user');
        localStorage.removeItem('activeOrganizationId');
        localStorage.removeItem(SESSION_HINT_STORAGE_KEY);
        if (shouldBroadcast) {
            broadcastAuthSync('logout');
        }
    }, []);

    const applySession = useCallback((payload: {
        accessToken: string;
        user: User;
    }, options?: { broadcast?: boolean }) => {
        const shouldBroadcast = options?.broadcast ?? true;
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
        if (shouldBroadcast) {
            broadcastAuthSync('login');
        }
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
                    clearSession({ broadcast: false });
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
                    clearSession({ broadcast: false });
                    setLoading(false);
                    return;
                }

                applySession({
                    accessToken,
                    user: refreshedUser,
                }, { broadcast: false });
            } catch {
                clearSession({ broadcast: false });
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

    useEffect(() => {
        if (!canUseWindow) {
            return undefined;
        }

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) {
                return;
            }

            try {
                const parsed = JSON.parse(event.newValue) as { type?: 'login' | 'logout' };
                if (parsed.type === 'logout') {
                    clearSession({ broadcast: false });
                    setLoading(false);
                    return;
                }

                if (parsed.type === 'login' && !getAccessToken()) {
                    void authApi.refresh()
                        .then((refreshResponse) => {
                            const { accessToken, user: refreshedUser } = refreshResponse.data;
                            if (!accessToken || !refreshedUser) {
                                return;
                            }

                            applySession({
                                accessToken,
                                user: refreshedUser,
                            }, { broadcast: false });
                        })
                        .catch(() => undefined)
                        .finally(() => setLoading(false));
                }
            } catch {
                // Ignore malformed cross-tab sync events.
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [applySession, clearSession]);

    const login = async (email: string, password: string, twoFactorCode?: string) => {
        const response = await authApi.login({ email, password, twoFactorCode });
        const { accessToken, user: userData } = response.data;
        applySession({
            accessToken,
            user: userData,
        });
    };

    const loginWithGoogle = async (
        idToken: string,
        role?: 'USER' | 'BUSINESS_OWNER',
        twoFactorCode?: string,
    ) => {
        const response = await authApi.loginWithGoogle({ idToken, role, twoFactorCode });
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
        clearSession();
        try {
            await authApi.logout();
        } catch {
            // Ignore network/logout errors and clear client state anyway.
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                refreshToken: null,
                loading,
                login,
                loginWithGoogle,
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
