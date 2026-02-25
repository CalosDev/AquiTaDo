import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { Home } from '../pages/Home';
import { BusinessesList } from '../pages/BusinessesList';
import { BusinessDetails } from '../pages/BusinessDetails';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { RegisterBusiness } from '../pages/RegisterBusiness';
import { DashboardBusiness } from '../pages/DashboardBusiness';
import { AdminDashboard } from '../pages/AdminDashboard';
import { Terms } from '../pages/Terms';
import { Privacy } from '../pages/Privacy';
import { NotFound } from '../pages/NotFound';
import { OrganizationSettings } from '../pages/OrganizationSettings';
import { AcceptInvite } from '../pages/AcceptInvite';

export function AppRouter() {
    return (
        <Routes>
            <Route element={<MainLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/businesses" element={<BusinessesList />} />
                <Route path="/businesses/:id" element={<BusinessDetails />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route
                    path="/organization"
                    element={
                        <ProtectedRoute>
                            <OrganizationSettings />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/invites/:token"
                    element={
                        <ProtectedRoute>
                            <AcceptInvite />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/register-business"
                    element={
                        <ProtectedRoute>
                            <RegisterBusiness />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute roles={['BUSINESS_OWNER', 'ADMIN']}>
                            <DashboardBusiness />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute roles={['ADMIN']}>
                            <AdminDashboard />
                        </ProtectedRoute>
                    }
                />
                <Route path="*" element={<NotFound />} />
            </Route>
        </Routes>
    );
}
