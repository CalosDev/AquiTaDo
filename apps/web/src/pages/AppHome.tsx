import { Navigate } from 'react-router-dom';
import { resolveRoleHomePath } from '../auth/roles';
import { useAuth } from '../context/useAuth';

export function AppHome() {
    const { user } = useAuth();
    return <Navigate to={resolveRoleHomePath(user?.role)} replace />;
}
