import type { UserRole } from '../auth/roles';

export const pageLoaders = {
    home: () => import('../pages/Home'),
    appHome: () => import('../pages/AppHome'),
    customerDashboard: () => import('../pages/CustomerDashboard'),
    businessesList: () => import('../pages/BusinessesList'),
    businessDetails: () => import('../pages/BusinessDetails'),
    login: () => import('../pages/Login'),
    forgotPassword: () => import('../pages/ForgotPassword'),
    resetPassword: () => import('../pages/ResetPassword'),
    register: () => import('../pages/Register'),
    registerBusiness: () => import('../pages/RegisterBusiness'),
    editBusiness: () => import('../pages/EditBusiness'),
    dashboardBusiness: () => import('../pages/DashboardBusiness'),
    adminDashboard: () => import('../pages/AdminDashboard'),
    terms: () => import('../pages/Terms'),
    privacy: () => import('../pages/Privacy'),
    about: () => import('../pages/About'),
    notFound: () => import('../pages/NotFound'),
    profile: () => import('../pages/Profile'),
    adminSecurity: () => import('../pages/AdminSecurity'),
} as const;

type LoaderKey = keyof typeof pageLoaders;

const preloadedKeys = new Set<LoaderKey>();

function preloadByKey(key: LoaderKey): void {
    if (preloadedKeys.has(key)) {
        return;
    }

    preloadedKeys.add(key);
    void pageLoaders[key]().catch(() => {
        preloadedKeys.delete(key);
    });
}

function preloadMany(keys: LoaderKey[]): void {
    keys.forEach((key) => preloadByKey(key));
}

function normalizePath(pathname: string): string {
    const cleaned = pathname.trim().toLowerCase();
    if (!cleaned) {
        return '/';
    }
    return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

export function preloadRouteChunk(pathname: string): void {
    const normalizedPath = normalizePath(pathname);

    if (normalizedPath === '/') {
        preloadMany(['home', 'businessesList']);
        return;
    }

    if (normalizedPath.startsWith('/businesses/')) {
        preloadMany(['businessDetails', 'businessesList']);
        return;
    }

    if (
        normalizedPath === '/businesses'
        || normalizedPath.startsWith('/negocios/')
    ) {
        preloadMany(['businessesList', 'businessDetails']);
        return;
    }

    if (normalizedPath === '/login') {
        preloadMany(['login', 'register', 'forgotPassword']);
        return;
    }

    if (normalizedPath === '/forgot-password') {
        preloadMany(['forgotPassword', 'login', 'resetPassword']);
        return;
    }

    if (normalizedPath === '/reset-password') {
        preloadMany(['resetPassword', 'login', 'forgotPassword']);
        return;
    }

    if (normalizedPath === '/register') {
        preloadMany(['register', 'login', 'forgotPassword']);
        return;
    }

    if (normalizedPath === '/app') {
        preloadMany(['appHome', 'customerDashboard', 'dashboardBusiness', 'adminDashboard']);
        return;
    }

    if (normalizedPath === '/app/customer') {
        preloadByKey('customerDashboard');
        return;
    }

    if (normalizedPath === '/dashboard') {
        preloadMany(['dashboardBusiness', 'editBusiness']);
        return;
    }

    if (normalizedPath.startsWith('/dashboard/businesses/')) {
        preloadMany(['editBusiness', 'dashboardBusiness']);
        return;
    }

    if (normalizedPath === '/register-business') {
        preloadByKey('registerBusiness');
        return;
    }

    if (normalizedPath === '/admin') {
        preloadByKey('adminDashboard');
        return;
    }

    if (normalizedPath === '/security') {
        preloadByKey('adminSecurity');
        return;
    }

    if (normalizedPath === '/profile') {
        preloadByKey('profile');
        return;
    }

    if (normalizedPath === '/about') {
        preloadByKey('about');
        return;
    }

    if (normalizedPath === '/terms') {
        preloadByKey('terms');
        return;
    }

    if (normalizedPath === '/privacy') {
        preloadByKey('privacy');
    }
}

export function preloadLikelyRoutesForSession(options: {
    isAuthenticated: boolean;
    role?: UserRole;
}): void {
    if (!options.isAuthenticated) {
        preloadMany([
            'home',
            'businessesList',
            'businessDetails',
            'login',
            'register',
            'forgotPassword',
            'resetPassword',
            'about',
        ]);
        return;
    }

    preloadMany(['appHome', 'profile']);

    if (options.role === 'USER') {
        preloadByKey('customerDashboard');
        return;
    }

    if (options.role === 'BUSINESS_OWNER') {
        preloadMany([
            'dashboardBusiness',
            'registerBusiness',
            'editBusiness',
        ]);
        return;
    }

    if (options.role === 'ADMIN') {
        preloadMany(['adminDashboard', 'adminSecurity']);
    }
}
