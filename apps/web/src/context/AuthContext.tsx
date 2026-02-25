/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '../api/endpoints';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
    logout: () => void;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isBusinessOwner: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedToken = localStorage.getItem('accessToken');
        const savedUser = localStorage.getItem('user');

        if (savedToken && savedUser) {
            setToken(savedToken);
            setUser(JSON.parse(savedUser));
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const handleUnauthorized = () => {
            setToken(null);
            setUser(null);
            localStorage.removeItem('accessToken');
            localStorage.removeItem('user');
        };

        window.addEventListener('auth:unauthorized', handleUnauthorized);
        return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
    }, []);

    const login = async (email: string, password: string) => {
        const response = await authApi.login({ email, password });
        const { accessToken, user: userData } = response.data;
        setToken(accessToken);
        setUser(userData);
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const register = async (name: string, email: string, password: string, phone?: string) => {
        const response = await authApi.register({ name, email, password, phone });
        const { accessToken, user: userData } = response.data;
        setToken(accessToken);
        setUser(userData);
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                loading,
                login,
                register,
                logout,
                isAuthenticated: !!token,
                isAdmin: user?.role === 'ADMIN',
                isBusinessOwner: user?.role === 'BUSINESS_OWNER',
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
