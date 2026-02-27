import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { UserRole, resolveRoleHomePath } from '../auth/roles';

interface ProtectedRouteProps {
    children: React.ReactNode;
    roles?: UserRole[];
    unauthorizedRedirectTo?: string;
}

export function ProtectedRoute({
    children,
    roles,
    unauthorizedRedirectTo,
}: ProtectedRouteProps) {
    const { isAuthenticated, user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    if (roles && user && !roles.includes(user.role)) {
        const fallbackPath = unauthorizedRedirectTo ?? resolveRoleHomePath(user.role);
        return <Navigate to={fallbackPath} replace />;
    }

    return <>{children}</>;
}
