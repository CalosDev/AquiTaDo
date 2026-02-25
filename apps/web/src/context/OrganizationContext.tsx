/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { getApiErrorMessage } from '../api/error';
import { organizationApi } from '../api/endpoints';
import { useAuth } from './useAuth';

const ACTIVE_ORGANIZATION_STORAGE_KEY = 'activeOrganizationId';

export interface OrganizationSummary {
    id: string;
    name: string;
    slug: string;
    membership?: {
        role: 'OWNER' | 'MANAGER' | 'STAFF';
        joinedAt: string;
    };
    _count?: {
        businesses: number;
        members: number;
        invites: number;
    };
}

interface OrganizationContextType {
    organizations: OrganizationSummary[];
    activeOrganizationId: string | null;
    activeOrganization: OrganizationSummary | null;
    loading: boolean;
    error: string;
    refreshOrganizations: (preferredOrganizationId?: string | null) => Promise<void>;
    setActiveOrganizationId: (organizationId: string | null) => void;
}

export const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
    const { isAuthenticated, loading: authLoading } = useAuth();
    const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
    const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(
        localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY),
    );
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const clearOrganizationState = useCallback(() => {
        setOrganizations([]);
        setActiveOrganizationIdState(null);
        setError('');
        localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
    }, []);

    const setActiveOrganizationId = useCallback((organizationId: string | null) => {
        setActiveOrganizationIdState(organizationId);
        if (organizationId) {
            localStorage.setItem(ACTIVE_ORGANIZATION_STORAGE_KEY, organizationId);
        } else {
            localStorage.removeItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
        }
    }, []);

    const refreshOrganizations = useCallback(async (preferredOrganizationId?: string | null) => {
        if (!isAuthenticated) {
            clearOrganizationState();
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await organizationApi.getMine();
            const loadedOrganizations = (response.data || []) as OrganizationSummary[];
            setOrganizations(loadedOrganizations);

            const storedOrganizationId = localStorage.getItem(ACTIVE_ORGANIZATION_STORAGE_KEY);
            const candidateOrganizationId = preferredOrganizationId ?? storedOrganizationId;

            const selectedOrganizationId = candidateOrganizationId &&
                loadedOrganizations.some((organization) => organization.id === candidateOrganizationId)
                ? candidateOrganizationId
                : loadedOrganizations[0]?.id ?? null;

            setActiveOrganizationId(selectedOrganizationId);
        } catch (requestError) {
            clearOrganizationState();
            setError(getApiErrorMessage(requestError, 'No se pudieron cargar las organizaciones'));
        } finally {
            setLoading(false);
        }
    }, [clearOrganizationState, isAuthenticated, setActiveOrganizationId]);

    useEffect(() => {
        if (authLoading) {
            return;
        }

        if (!isAuthenticated) {
            clearOrganizationState();
            setLoading(false);
            return;
        }

        void refreshOrganizations();
    }, [authLoading, clearOrganizationState, isAuthenticated, refreshOrganizations]);

    const activeOrganization = useMemo(
        () =>
            organizations.find((organization) => organization.id === activeOrganizationId) ??
            null,
        [activeOrganizationId, organizations],
    );

    return (
        <OrganizationContext.Provider
            value={{
                organizations,
                activeOrganizationId,
                activeOrganization,
                loading,
                error,
                refreshOrganizations,
                setActiveOrganizationId,
            }}
        >
            {children}
        </OrganizationContext.Provider>
    );
}
