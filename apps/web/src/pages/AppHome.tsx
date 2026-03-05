import { Navigate } from 'react-router-dom';
import { resolveRoleHomePath } from '../auth/roles';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';

export function AppHome() {
    const { user } = useAuth();
    const { activeOrganizationId, loading: organizationLoading, organizations } = useOrganization();

    if (user?.role === 'BUSINESS_OWNER') {
        if (organizationLoading) {
            return (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
            );
        }

        if (!activeOrganizationId && organizations.length === 0) {
            return <Navigate to="/register-business" replace />;
        }
    }

    return <Navigate to={resolveRoleHomePath(user?.role)} replace />;
}
