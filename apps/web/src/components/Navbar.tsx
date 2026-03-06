import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getRoleCapabilities } from '../auth/capabilities';
import { resolveRoleHomeLabel, resolveRoleHomePath } from '../auth/roles';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';
import { preloadLikelyRoutesForSession, preloadRouteChunk } from '../routes/preload';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
}

function roleBadgeLabel(role: string | undefined): string {
    if (role === 'ADMIN') {
        return 'Admin';
    }
    if (role === 'BUSINESS_OWNER') {
        return 'Negocio';
    }
    return 'Usuario';
}

function isPathActive(pathname: string, target: string): boolean {
    if (target === '/') {
        return pathname === '/';
    }
    return pathname === target || pathname.startsWith(`${target}/`);
}

export function Navbar() {
    const { isAuthenticated, user, logout } = useAuth();
    const { activeOrganization } = useOrganization();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

    const roleHomePath = resolveRoleHomePath(user?.role);
    const roleHomeLabel = resolveRoleHomeLabel(user?.role);
    const roleCapabilities = getRoleCapabilities(user?.role);
    const canRegisterBusiness = roleCapabilities.canRegisterBusiness;
    const organizationName = activeOrganization?.name?.trim() ?? '';
    const showOrganizationChip = organizationName.length > 0;
    const businessesActive = location.pathname === '/businesses'
        || location.pathname.startsWith('/businesses/')
        || location.pathname.startsWith('/negocios/');
    const aboutActive = isPathActive(location.pathname, '/about');
    const roleHomeActive = isPathActive(location.pathname, roleHomePath);
    const securityActive = isPathActive(location.pathname, '/security');
    const profileActive = isPathActive(location.pathname, '/profile');

    const desktopNavClass = (isActive: boolean) => (isActive ? 'nav-link nav-link-active' : 'nav-link');
    const mobileNavClass = (isActive: boolean) => (
        `touch-target block rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${isActive
            ? 'bg-primary-50 text-primary-700'
            : 'text-slate-700 hover:bg-primary-50'}`
    );

    const handleLogout = () => {
        void logout();
        navigate('/');
    };

    const handleInstallApp = async () => {
        if (!installPromptEvent) {
            return;
        }

        try {
            await installPromptEvent.prompt();
            await installPromptEvent.userChoice;
        } finally {
            setInstallPromptEvent(null);
        }
    };

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handler = (event: Event) => {
            // Keep browser default install behavior to avoid console warning
            // when users do not manually open the custom prompt.
            setInstallPromptEvent(event as BeforeInstallPromptEvent);
        };
        const installedHandler = () => setInstallPromptEvent(null);

        window.addEventListener('beforeinstallprompt', handler);
        window.addEventListener('appinstalled', installedHandler);
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
            window.removeEventListener('appinstalled', installedHandler);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const schedulePrefetch = () => {
            preloadLikelyRoutesForSession({
                isAuthenticated,
                role: user?.role,
            });
        };

        const withIdleCallback = window as Window & {
            requestIdleCallback?: (
                callback: IdleRequestCallback,
                options?: IdleRequestOptions,
            ) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        if (typeof withIdleCallback.requestIdleCallback === 'function') {
            const idleId = withIdleCallback.requestIdleCallback(() => {
                schedulePrefetch();
            }, { timeout: 1500 });
            return () => {
                if (typeof withIdleCallback.cancelIdleCallback === 'function') {
                    withIdleCallback.cancelIdleCallback(idleId);
                }
            };
        }

        const timeoutId = window.setTimeout(schedulePrefetch, 600);
        return () => window.clearTimeout(timeoutId);
    }, [isAuthenticated, user?.role]);

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname]);

    return (
        <header className="sticky top-0 z-50 overflow-x-clip">
            <div className="hidden xl:block border-b border-primary-100/70 bg-white/85 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <div className="flex items-center gap-3">
                        <span className="chip !px-2.5 !py-0.5 !text-[10px]">Hecho en RD</span>
                        <span>Directorio local + SaaS para negocios</span>
                    </div>
                    <span className="text-primary-700">Santo Domingo, Republica Dominicana</span>
                </div>
            </div>

            <nav className="glass border-b border-primary-100/80 shadow-sm">
                <div className="flag-ribbon" aria-hidden="true"></div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between gap-4">
                        <Link to="/" className="group inline-flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-md shadow-primary-200/60">
                                <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-700"></div>
                                <div className="absolute inset-y-0 right-0 w-1/2 bg-accent-600"></div>
                                <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-white">A</span>
                            </div>
                            <div className="leading-tight">
                                <p className="font-display text-xl font-bold text-slate-900">
                                    Aqui<span className="text-accent-600">Ta</span>.do
                                </p>
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Mercado local inteligente
                                </p>
                            </div>
                        </Link>

                        <div className="hidden xl:flex items-center gap-3 2xl:gap-5 min-w-0">
                            <Link
                                to="/businesses"
                                className={desktopNavClass(businessesActive)}
                                aria-current={businessesActive ? 'page' : undefined}
                                onMouseEnter={() => preloadRouteChunk('/businesses')}
                                onFocus={() => preloadRouteChunk('/businesses')}
                            >
                                Negocios
                            </Link>
                            {!isAuthenticated && (
                                <Link
                                    to="/about"
                                    className={desktopNavClass(aboutActive)}
                                    aria-current={aboutActive ? 'page' : undefined}
                                    onMouseEnter={() => preloadRouteChunk('/about')}
                                    onFocus={() => preloadRouteChunk('/about')}
                                >
                                    Nosotros
                                </Link>
                            )}
                            {installPromptEvent && (
                                <button type="button" className="btn-secondary text-sm" onClick={() => void handleInstallApp()}>
                                    Instalar app
                                </button>
                            )}
                            {isAuthenticated ? (
                                <>
                                    <Link
                                        to={roleHomePath}
                                        className={desktopNavClass(roleHomeActive)}
                                        aria-current={roleHomeActive ? 'page' : undefined}
                                        onMouseEnter={() => preloadRouteChunk(roleHomePath)}
                                        onFocus={() => preloadRouteChunk(roleHomePath)}
                                    >
                                        {roleHomeLabel}
                                    </Link>
                                    {user?.role === 'ADMIN' && (
                                        <Link
                                            to="/security"
                                            className={desktopNavClass(securityActive)}
                                            aria-current={securityActive ? 'page' : undefined}
                                            onMouseEnter={() => preloadRouteChunk('/security')}
                                            onFocus={() => preloadRouteChunk('/security')}
                                        >
                                            Seguridad
                                        </Link>
                                    )}
                                    <Link
                                        to="/profile"
                                        className={desktopNavClass(profileActive)}
                                        aria-current={profileActive ? 'page' : undefined}
                                        onMouseEnter={() => preloadRouteChunk('/profile')}
                                        onFocus={() => preloadRouteChunk('/profile')}
                                    >
                                        Perfil
                                    </Link>
                                    {canRegisterBusiness && (
                                        <Link
                                            to="/register-business"
                                            className="btn-accent text-sm whitespace-nowrap shrink-0"
                                            onMouseEnter={() => preloadRouteChunk('/register-business')}
                                            onFocus={() => preloadRouteChunk('/register-business')}
                                        >
                                            <span className="xl:hidden">+ Negocio</span>
                                            <span className="hidden xl:inline 2xl:hidden">+ Registrar</span>
                                            <span className="hidden 2xl:inline">+ Registrar Negocio</span>
                                        </Link>
                                    )}
                                    <div className="flex items-center gap-2 min-w-0 shrink-0">
                                        <span className="chip !py-1 whitespace-nowrap shrink-0">{roleBadgeLabel(user?.role)}</span>
                                        {showOrganizationChip && (
                                            <span
                                                className="chip-danger hidden 2xl:inline-flex !py-1 max-w-[180px] truncate overflow-hidden"
                                                title={organizationName}
                                            >
                                                {organizationName}
                                            </span>
                                        )}
                                        <span className="text-sm text-slate-500 whitespace-nowrap max-w-[120px] truncate">
                                            Hola, {user?.name?.split(' ')[0]}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-accent-300 hover:text-accent-700 whitespace-nowrap"
                                        >
                                            Salir
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <Link
                                        to="/login"
                                        className="btn-secondary text-sm"
                                        onMouseEnter={() => preloadRouteChunk('/login')}
                                        onFocus={() => preloadRouteChunk('/login')}
                                    >
                                        Iniciar Sesion
                                    </Link>
                                    <Link
                                        to="/register"
                                        className="btn-primary text-sm"
                                        onMouseEnter={() => preloadRouteChunk('/register')}
                                        onFocus={() => preloadRouteChunk('/register')}
                                    >
                                        Crear Cuenta
                                    </Link>
                                </div>
                            )}
                        </div>

                        <div className="hidden lg:flex xl:hidden items-center gap-2 min-w-0">
                            <Link
                                to="/businesses"
                                className={desktopNavClass(businessesActive)}
                                aria-current={businessesActive ? 'page' : undefined}
                                onMouseEnter={() => preloadRouteChunk('/businesses')}
                                onFocus={() => preloadRouteChunk('/businesses')}
                            >
                                Negocios
                            </Link>
                            {isAuthenticated && (
                                <Link
                                    to={roleHomePath}
                                    className={desktopNavClass(roleHomeActive)}
                                    aria-current={roleHomeActive ? 'page' : undefined}
                                    onMouseEnter={() => preloadRouteChunk(roleHomePath)}
                                    onFocus={() => preloadRouteChunk(roleHomePath)}
                                >
                                    {roleHomeLabel}
                                </Link>
                            )}
                            {canRegisterBusiness && (
                                <Link
                                    to="/register-business"
                                    className="btn-accent !px-4 !py-2 text-sm whitespace-nowrap"
                                    onMouseEnter={() => preloadRouteChunk('/register-business')}
                                    onFocus={() => preloadRouteChunk('/register-business')}
                                >
                                    + Negocio
                                </Link>
                            )}
                        </div>

                        <button
                            type="button"
                            className="xl:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-700"
                            onClick={() => setMenuOpen((previous) => !previous)}
                            aria-label={menuOpen ? 'Cerrar menu principal' : 'Abrir menu principal'}
                            aria-expanded={menuOpen}
                            aria-controls="mobile-main-menu"
                        >
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {menuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>

                    {menuOpen && (
                        <div id="mobile-main-menu" className="xl:hidden pb-4 pt-2 animate-slide-down">
                            <div className="surface-panel p-2">
                                    <Link
                                        to="/businesses"
                                        className={mobileNavClass(businessesActive)}
                                        aria-current={businessesActive ? 'page' : undefined}
                                        onMouseEnter={() => preloadRouteChunk('/businesses')}
                                        onFocus={() => preloadRouteChunk('/businesses')}
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        Negocios
                                </Link>
                                {!isAuthenticated && (
                                    <Link
                                        to="/about"
                                        className={`mt-1 ${mobileNavClass(aboutActive)}`}
                                        aria-current={aboutActive ? 'page' : undefined}
                                        onMouseEnter={() => preloadRouteChunk('/about')}
                                        onFocus={() => preloadRouteChunk('/about')}
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        Nosotros
                                    </Link>
                                )}
                                {installPromptEvent && (
                                    <button
                                        type="button"
                                        className="touch-target mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-primary-700 hover:bg-primary-50"
                                        onClick={() => {
                                            void handleInstallApp();
                                            setMenuOpen(false);
                                        }}
                                    >
                                        Instalar app
                                    </button>
                                )}

                                {isAuthenticated ? (
                                    <>
                                        {canRegisterBusiness && (
                                            <Link
                                                to="/register-business"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50"
                                                onMouseEnter={() => preloadRouteChunk('/register-business')}
                                                onFocus={() => preloadRouteChunk('/register-business')}
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                + Registrar Negocio
                                            </Link>
                                        )}
                                        <Link
                                            to={roleHomePath}
                                            className={`mt-1 ${mobileNavClass(roleHomeActive)}`}
                                            aria-current={roleHomeActive ? 'page' : undefined}
                                            onMouseEnter={() => preloadRouteChunk(roleHomePath)}
                                            onFocus={() => preloadRouteChunk(roleHomePath)}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            {roleHomeLabel}
                                        </Link>
                                        {user?.role === 'ADMIN' && (
                                            <Link
                                                to="/security"
                                                className={`mt-1 ${mobileNavClass(securityActive)}`}
                                                aria-current={securityActive ? 'page' : undefined}
                                                onMouseEnter={() => preloadRouteChunk('/security')}
                                                onFocus={() => preloadRouteChunk('/security')}
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                Seguridad
                                            </Link>
                                        )}
                                        <Link
                                            to="/profile"
                                            className={`mt-1 ${mobileNavClass(profileActive)}`}
                                            aria-current={profileActive ? 'page' : undefined}
                                            onMouseEnter={() => preloadRouteChunk('/profile')}
                                            onFocus={() => preloadRouteChunk('/profile')}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Perfil
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleLogout();
                                                setMenuOpen(false);
                                            }}
                                            className="touch-target mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-accent-700 hover:bg-accent-50"
                                        >
                                            Salir
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Link
                                            to="/login"
                                            className={`mt-1 ${mobileNavClass(isPathActive(location.pathname, '/login'))}`}
                                            aria-current={isPathActive(location.pathname, '/login') ? 'page' : undefined}
                                            onMouseEnter={() => preloadRouteChunk('/login')}
                                            onFocus={() => preloadRouteChunk('/login')}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Iniciar Sesion
                                        </Link>
                                        <Link
                                            to="/register"
                                            className={`mt-1 ${mobileNavClass(isPathActive(location.pathname, '/register'))}`}
                                            aria-current={isPathActive(location.pathname, '/register') ? 'page' : undefined}
                                            onMouseEnter={() => preloadRouteChunk('/register')}
                                            onFocus={() => preloadRouteChunk('/register')}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Crear Cuenta
                                        </Link>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </nav>
        </header>
    );
}
