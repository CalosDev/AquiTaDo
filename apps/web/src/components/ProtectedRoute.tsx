import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { UserRole, resolveRoleHomePath } from '../auth/roles';
import { PageBlockingLoader } from './PageBlockingLoader';

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
            <PageBlockingLoader
                fullScreen
                label="Validando tu acceso"
                hint="Comprobamos tu sesion y tus permisos antes de abrir esta seccion."
            />
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
