import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { AdminLayout } from '../layouts/AdminLayout';
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
const SuggestBusiness = lazy(async () => ({ default: (await pageLoaders.suggestBusiness()).SuggestBusiness }));
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
const AcceptOrganizationInvite = lazy(async () => ({ default: (await pageLoaders.acceptOrganizationInvite()).AcceptOrganizationInvite }));

// ── Skeleton de carga por tipo de ruta ───────────────────
function PublicSkeleton() {
    return (
        <div className="container-lg py-10">
            <div className="h-10 w-64 max-w-full animate-pulse rounded-2xl bg-slate-100" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="card-section animate-pulse">
                        <div className="aspect-[4/3] rounded-xl bg-slate-100" />
                        <div className="mt-3 h-5 w-2/3 rounded-full bg-slate-100" />
                        <div className="mt-2 h-4 w-1/2 rounded-full bg-slate-100" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="app-page-inner density-compact">
            <div className="app-page-header">
                <div className="h-6 w-40 animate-pulse rounded-xl bg-slate-100" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mt-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="card-summary animate-pulse">
                        <div className="h-3 w-20 rounded-full bg-slate-100" />
                        <div className="mt-3 h-9 w-24 rounded-xl bg-slate-100" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function AdminSkeleton() {
    return (
        <div className="p-5 density-compact">
            <div className="h-5 w-32 animate-pulse rounded-lg bg-slate-700" />
            <div className="mt-5 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-md bg-slate-800" />
                ))}
            </div>
        </div>
    );
}

function AuthSkeleton() {
    return (
        <div className="auth-stage">
            <div className="container-sm">
                <div className="card-form animate-pulse space-y-4">
                    <div className="h-6 w-40 rounded-xl bg-slate-100" />
                    <div className="h-11 rounded-xl bg-slate-100" />
                    <div className="h-11 rounded-xl bg-slate-100" />
                    <div className="h-11 rounded-2xl bg-slate-200" />
                </div>
            </div>
        </div>
    );
}

// ── Fallback contextual por tipo de ruta ─────────────────
function RouteFallback() {
    const { pathname } = useLocation();
    const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/security';
    const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname === '/profile' || pathname.startsWith('/app');
    const isAuth = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password';

    if (isAdmin)     return <AdminSkeleton />;
    if (isDashboard) return <DashboardSkeleton />;
    if (isAuth)      return <AuthSkeleton />;
    return <PublicSkeleton />;
}

// ── Router principal ─────────────────────────────────────
export function AppRouter() {
    return (
        <Suspense fallback={<RouteFallback />}>
            <Routes>

                {/* ── Marketing / Discovery / Público (§ 4.1, § 4.2) ── */}
                <Route element={<MainLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/businesses" element={<BusinessesList />} />
                    <Route path="/negocios/categoria/:categorySlug" element={<BusinessesList />} />
                    <Route path="/negocios/provincia/:provinceSlug" element={<BusinessesList />} />
                    <Route path="/negocios/intencion/:intentSlug" element={<BusinessesList />} />
                    <Route path="/negocios/:provinceSlug/:categorySlug" element={<BusinessesList />} />
                    <Route path="/businesses/:slug" element={<BusinessDetails />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/about" element={<About />} />
                    <Route path="*" element={<NotFound />} />
                </Route>

                {/* ── Auth — shell mínimo sin Navbar/Footer (§ 9.3) ── */}
                <Route element={<AuthLayout />}>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                </Route>

                {/* ── SaaS / Negocio — dashboard shell (§ 4.3, § 6) ── */}
                <Route
                    element={
                        <ProtectedRoute roles={['BUSINESS_OWNER']}>
                            <DashboardLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route path="/dashboard" element={<DashboardBusiness />} />
                    <Route
                        path="/dashboard/businesses/:businessId/edit"
                        element={<EditBusiness />}
                    />
                    <Route
                        path="/register-business"
                        element={<RegisterBusiness />}
                    />
                </Route>

                {/* Rutas protegidas en DashboardLayout, acceso USER general */}
                <Route
                    element={
                        <ProtectedRoute>
                            <DashboardLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/app" element={<AppHome />} />
                    <Route path="/app/invite" element={<AcceptOrganizationInvite />} />
                    <Route
                        path="/app/customer"
                        element={
                            <ProtectedRoute roles={['USER']}>
                                <CustomerDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/suggest-business"
                        element={
                            <ProtectedRoute roles={['USER']}>
                                <SuggestBusiness />
                            </ProtectedRoute>
                        }
                    />
                </Route>

                {/* ── Admin / Plataforma — consola shell (§ 4.4, § 9.9) ── */}
                <Route
                    element={
                        <ProtectedRoute roles={['ADMIN']}>
                            <AdminLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/security" element={<AdminSecurity />} />
                </Route>

            </Routes>
        </Suspense>
    );
}
