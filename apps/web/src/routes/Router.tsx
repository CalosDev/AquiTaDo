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

function RouteFallback() {
    const location = useLocation();
    const pathname = location.pathname;
    const isDiscoveryRoute = pathname === '/businesses'
        || pathname.startsWith('/businesses/')
        || pathname.startsWith('/negocios/');
    const isRoleRoute = pathname === '/admin'
        || pathname === '/security'
        || pathname === '/dashboard'
        || pathname.startsWith('/dashboard/')
        || pathname === '/register-business'
        || pathname === '/profile'
        || pathname === '/app/customer';
    const heroClass = isRoleRoute ? 'role-hero role-hero-owner' : 'discovery-callout';

    return (
        <div className="page-shell py-10">
            <section className={heroClass}>
                <div className="space-y-4">
                    <div className="h-4 w-32 rounded-full bg-white/20 animate-pulse"></div>
                    <div className="h-10 w-72 max-w-full rounded-full bg-white/15 animate-pulse"></div>
                    <div className="h-4 w-[30rem] max-w-full rounded-full bg-white/10 animate-pulse"></div>
                </div>
            </section>

            {isDiscoveryRoute ? (
                <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="hidden xl:block">
                        <div className="section-shell space-y-4 p-5">
                            <div className="h-4 w-20 rounded-full bg-slate-100 animate-pulse"></div>
                            {Array.from({ length: 6 }).map((_, index) => (
                                <div key={`filter-${index}`} className="h-11 rounded-xl bg-slate-100 animate-pulse"></div>
                            ))}
                        </div>
                    </aside>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <div key={index} className="section-shell overflow-hidden p-4">
                                <div className="aspect-[4/3] rounded-2xl bg-slate-100 animate-pulse"></div>
                                <div className="mt-4 h-6 w-2/3 rounded-full bg-slate-100 animate-pulse"></div>
                                <div className="mt-2 h-4 w-1/2 rounded-full bg-slate-100 animate-pulse"></div>
                                <div className="mt-3 h-4 w-4/5 rounded-full bg-slate-100 animate-pulse"></div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="section-shell p-5">
                            <div className="h-5 w-28 rounded-full bg-slate-100 animate-pulse"></div>
                            <div className="mt-4 h-24 rounded-2xl bg-slate-100 animate-pulse"></div>
                            <div className="mt-3 h-4 w-4/5 rounded-full bg-slate-100 animate-pulse"></div>
                        </div>
                    ))}
                </div>
            )}
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
                    <Route
                        path="/suggest-business"
                        element={
                            <ProtectedRoute roles={['USER']}>
                                <SuggestBusiness />
                            </ProtectedRoute>
                        }
                    />
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
                        path="/app/invite"
                        element={
                            <ProtectedRoute>
                                <AcceptOrganizationInvite />
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
