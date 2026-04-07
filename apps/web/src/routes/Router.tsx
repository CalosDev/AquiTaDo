import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
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

function BusinessesRouteFallback() {
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
            <div className="discovery-callout">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="space-y-2">
                        <div className="h-3 w-28 rounded-full bg-primary-100 animate-pulse"></div>
                        <div className="h-8 w-72 max-w-full rounded-full bg-slate-100 animate-pulse"></div>
                        <div className="h-4 w-[32rem] max-w-full rounded-full bg-slate-100 animate-pulse"></div>
                    </div>
                    <div className="h-8 w-44 rounded-full bg-slate-100 animate-pulse"></div>
                </div>

                <div className="panel-premium overflow-hidden border border-primary-100/70 p-5 sm:p-6">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="h-12 flex-1 rounded-2xl bg-slate-100 animate-pulse"></div>
                            <div className="h-12 sm:w-64 rounded-2xl bg-slate-100 animate-pulse"></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <div className="h-10 w-36 rounded-2xl bg-slate-100 animate-pulse"></div>
                            <div className="h-10 w-28 rounded-2xl bg-slate-100 animate-pulse"></div>
                            <div className="h-10 w-40 rounded-2xl bg-slate-100 animate-pulse"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="hidden lg:block">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse"></div>
                            <div className="h-4 w-14 rounded-full bg-slate-100 animate-pulse"></div>
                        </div>

                        <div className="mt-5 space-y-6">
                            <div>
                                <div className="h-3 w-24 rounded-full bg-slate-100 animate-pulse"></div>
                                <div className="mt-3 h-56 space-y-2 overflow-hidden">
                                    {Array.from({ length: 10 }).map((_, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <div className="h-4 w-4 rounded border border-slate-200 bg-slate-100"></div>
                                            <div className="h-3.5 flex-1 rounded-full bg-slate-100 animate-pulse"></div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={`sidebar-section-${index}`} className="space-y-3">
                                    <div className="h-3 w-24 rounded-full bg-slate-100 animate-pulse"></div>
                                    <div className="h-11 rounded-xl bg-slate-100 animate-pulse"></div>
                                    {index === 1 ? <div className="h-11 rounded-xl bg-slate-100 animate-pulse"></div> : null}
                                    {index === 1 ? <div className="h-11 rounded-xl bg-slate-100 animate-pulse"></div> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                </aside>

                <div className="min-w-0 space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div
                                key={index}
                                className="flex min-h-[24rem] flex-col rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]"
                            >
                                <div className="relative overflow-hidden rounded-[1.35rem] bg-slate-100">
                                    <div className="absolute left-3 top-3 h-7 w-24 rounded-full bg-white/80 animate-pulse"></div>
                                    <div className="absolute left-28 top-3 h-7 w-20 rounded-full bg-white/70 animate-pulse"></div>
                                    <div className="aspect-[4/3] animate-pulse bg-slate-100"></div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="h-6 w-3/5 rounded-full bg-slate-100 animate-pulse"></div>
                                        <div className="h-6 w-14 rounded-full bg-slate-100 animate-pulse"></div>
                                    </div>
                                    <div className="h-4 w-2/5 rounded-full bg-slate-100 animate-pulse"></div>
                                    <div className="h-4 w-1/3 rounded-full bg-slate-100 animate-pulse"></div>
                                    <div className="h-4 w-4/5 rounded-full bg-slate-100 animate-pulse"></div>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <div className="h-7 w-24 rounded-full bg-slate-100 animate-pulse"></div>
                                        <div className="h-7 w-36 rounded-full bg-slate-100 animate-pulse"></div>
                                        <div className="h-7 w-24 rounded-full bg-slate-100 animate-pulse"></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="h-4 w-40 rounded-full bg-slate-100 animate-pulse"></div>
                        <div className="h-9 w-24 rounded-xl bg-slate-100 animate-pulse"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RoleRouteFallback({ tone }: { tone: 'admin' | 'owner' | 'user' }) {
    const toneClass = tone === 'admin'
        ? 'role-hero role-hero-admin'
        : tone === 'owner'
            ? 'role-hero role-hero-owner'
            : 'role-hero role-hero-user';

    return (
        <div className="page-shell py-10">
            <section className={toneClass}>
                <div className="relative z-10 space-y-4">
                    <div className="h-4 w-28 rounded-full bg-white/30 animate-pulse"></div>
                    <div className="h-10 w-72 max-w-full rounded-full bg-white/25 animate-pulse"></div>
                    <div className="h-4 w-[30rem] max-w-full rounded-full bg-white/20 animate-pulse"></div>
                </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="section-shell p-5">
                        <div className="h-5 w-28 rounded-full bg-slate-100 animate-pulse"></div>
                        <div className="mt-4 h-24 rounded-2xl bg-slate-100 animate-pulse"></div>
                        <div className="mt-3 h-4 w-4/5 rounded-full bg-slate-100 animate-pulse"></div>
                        <div className="mt-2 h-4 w-2/3 rounded-full bg-slate-100 animate-pulse"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function DefaultRouteFallback() {
    return (
        <div className="page-shell py-20">
            <div className="mb-4 h-10 w-64 animate-pulse rounded-xl bg-primary-100"></div>
            <div className="mb-8 h-5 w-96 max-w-full animate-pulse rounded-lg bg-slate-100"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="section-shell p-4">
                        <div className="mb-4 h-40 animate-pulse rounded-xl bg-slate-100"></div>
                        <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-primary-100"></div>
                        <div className="h-3 w-full animate-pulse rounded bg-slate-100"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RouteFallback() {
    const location = useLocation();
    const pathname = location.pathname;

    if (
        pathname === '/businesses'
        || pathname.startsWith('/businesses/')
        || pathname.startsWith('/negocios/')
    ) {
        return <BusinessesRouteFallback />;
    }

    if (pathname === '/admin' || pathname === '/security') {
        return <RoleRouteFallback tone="admin" />;
    }

    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname === '/register-business') {
        return <RoleRouteFallback tone="owner" />;
    }

    if (pathname === '/profile' || pathname === '/app/customer') {
        return <RoleRouteFallback tone="user" />;
    }

    return <DefaultRouteFallback />;
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
