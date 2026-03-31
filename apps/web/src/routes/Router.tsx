import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { pageLoaders } from './preload';

const Home = lazy(async () => ({ default: (await pageLoaders.home()).Home }));
const AppHome = lazy(async () => ({ default: (await pageLoaders.appHome()).AppHome }));
const CustomerDashboard = lazy(async () => ({ default: (await pageLoaders.customerDashboard()).CustomerDashboard }));
const BusinessesList = lazy(async () => ({ default: (await pageLoaders.businessesList()).BusinessesList }));
const BusinessDetails = lazy(async () => ({ default: (await pageLoaders.businessDetails()).BusinessDetails }));
const Login = lazy(async () => ({ default: (await pageLoaders.login()).Login }));
const ForgotPassword = lazy(async () => ({ default: (await pageLoaders.forgotPassword()).ForgotPassword }));
const ResetPassword = lazy(async () => ({ default: (await pageLoaders.resetPassword()).ResetPassword }));
const Register = lazy(async () => ({ default: (await pageLoaders.register()).Register }));
const RegisterBusiness = lazy(async () => ({ default: (await pageLoaders.registerBusiness()).RegisterBusiness }));
const EditBusiness = lazy(async () => ({ default: (await pageLoaders.editBusiness()).EditBusiness }));
const DashboardBusiness = lazy(async () => ({ default: (await pageLoaders.dashboardBusiness()).DashboardBusiness }));
const AdminDashboard = lazy(async () => ({ default: (await pageLoaders.adminDashboard()).AdminDashboard }));
const Terms = lazy(async () => ({ default: (await pageLoaders.terms()).Terms }));
const Privacy = lazy(async () => ({ default: (await pageLoaders.privacy()).Privacy }));
const About = lazy(async () => ({ default: (await pageLoaders.about()).About }));
const NotFound = lazy(async () => ({ default: (await pageLoaders.notFound()).NotFound }));
const Profile = lazy(async () => ({ default: (await pageLoaders.profile()).Profile }));
const AdminSecurity = lazy(async () => ({ default: (await pageLoaders.adminSecurity()).AdminSecurity }));

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
                    <Route path="/negocios/categoria/:categorySlug" element={<BusinessesList />} />
                    <Route path="/negocios/provincia/:provinceSlug" element={<BusinessesList />} />
                    <Route path="/negocios/intencion/:intentSlug" element={<BusinessesList />} />
                    <Route path="/negocios/:provinceSlug/:categorySlug" element={<BusinessesList />} />
                    <Route path="/businesses/:slug" element={<BusinessDetails />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/about" element={<About />} />
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
                        path="/profile"
                        element={
                            <ProtectedRoute>
                                <Profile />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/register-business"
                        element={
                            <ProtectedRoute roles={['BUSINESS_OWNER']}>
                                <RegisterBusiness />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute roles={['BUSINESS_OWNER']}>
                                <DashboardBusiness />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/dashboard/businesses/:businessId/edit"
                        element={
                            <ProtectedRoute roles={['BUSINESS_OWNER']}>
                                <EditBusiness />
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
                    <Route
                        path="/security"
                        element={
                            <ProtectedRoute roles={['ADMIN']}>
                                <AdminSecurity />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="*" element={<NotFound />} />
                </Route>
            </Routes>
        </Suspense>
    );
}
