import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';

const Home = lazy(async () => ({ default: (await import('../pages/Home')).Home }));
const AppHome = lazy(async () => ({ default: (await import('../pages/AppHome')).AppHome }));
const CustomerDashboard = lazy(async () => ({ default: (await import('../pages/CustomerDashboard')).CustomerDashboard }));
const BusinessesList = lazy(async () => ({ default: (await import('../pages/BusinessesList')).BusinessesList }));
const BusinessDetails = lazy(async () => ({ default: (await import('../pages/BusinessDetails')).BusinessDetails }));
const Login = lazy(async () => ({ default: (await import('../pages/Login')).Login }));
const Register = lazy(async () => ({ default: (await import('../pages/Register')).Register }));
const RegisterBusiness = lazy(async () => ({ default: (await import('../pages/RegisterBusiness')).RegisterBusiness }));
const DashboardBusiness = lazy(async () => ({ default: (await import('../pages/DashboardBusiness')).DashboardBusiness }));
const AdminDashboard = lazy(async () => ({ default: (await import('../pages/AdminDashboard')).AdminDashboard }));
const Terms = lazy(async () => ({ default: (await import('../pages/Terms')).Terms }));
const Privacy = lazy(async () => ({ default: (await import('../pages/Privacy')).Privacy }));
const NotFound = lazy(async () => ({ default: (await import('../pages/NotFound')).NotFound }));
const OrganizationSettings = lazy(async () => ({ default: (await import('../pages/OrganizationSettings')).OrganizationSettings }));
const AcceptInvite = lazy(async () => ({ default: (await import('../pages/AcceptInvite')).AcceptInvite }));
const Profile = lazy(async () => ({ default: (await import('../pages/Profile')).Profile }));

function RouteFallback() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="h-10 w-64 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
            <div className="h-5 w-96 max-w-full rounded-lg bg-gray-100 animate-pulse mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-gray-100 bg-white p-4">
                        <div className="h-40 rounded-xl bg-gray-100 animate-pulse mb-4"></div>
                        <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse mb-2"></div>
                        <div className="h-3 w-full rounded bg-gray-100 animate-pulse"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AppRouter() {
    return (
        <Suspense fallback={<RouteFallback />}>
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
                        path="/app"
                        element={
                            <ProtectedRoute>
                                <AppHome />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/app/customer"
                        element={
                            <ProtectedRoute roles={['USER']}>
                                <CustomerDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/organization"
                        element={
                            <ProtectedRoute>
                                <OrganizationSettings />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/profile"
                        element={
                            <ProtectedRoute>
                                <Profile />
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
        </Suspense>
    );
}
