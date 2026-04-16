import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { businessApi } from '../api/endpoints';
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

function isPathActive(pathname: string, target: string): boolean {
    if (target === '/') {
        return pathname === '/';
    }

    return pathname === target || pathname.startsWith(`${target}/`);
}

export function Navbar() {
    const { isAuthenticated, loading, user, logout } = useAuth();
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
    const firstName = user?.name?.split(' ')[0] ?? 'Cuenta';

    const businessesActive = location.pathname === '/businesses'
        || location.pathname.startsWith('/businesses/')
        || location.pathname.startsWith('/negocios/');
    const aboutActive = isPathActive(location.pathname, '/about');
    const roleHomeActive = isPathActive(location.pathname, roleHomePath);
    const securityActive = isPathActive(location.pathname, '/security');
    const profileActive = isPathActive(location.pathname, '/profile');

    const primaryLinks = useMemo(
        () => [
            {
                label: 'Negocios',
                to: '/businesses',
                active: businessesActive,
                prefetch: () => {
                    preloadRouteChunk('/businesses');
                    businessApi.prefetchDiscoveryLanding();
                },
            },
            ...(!isAuthenticated
                ? [{
                    label: 'Nosotros',
                    to: '/about',
                    active: aboutActive,
                    prefetch: () => preloadRouteChunk('/about'),
                }]
                : []),
        ],
        [aboutActive, businessesActive, isAuthenticated],
    );

    const authenticatedLinks = useMemo(
        () => (isAuthenticated
            ? [
                {
                    label: roleHomeLabel,
                    to: roleHomePath,
                    active: roleHomeActive,
                    prefetch: () => preloadRouteChunk(roleHomePath),
                },
                {
                    label: 'Perfil',
                    to: '/profile',
                    active: profileActive,
                    prefetch: () => preloadRouteChunk('/profile'),
                },
                ...(user?.role === 'ADMIN'
                    ? [{
                        label: 'Seguridad',
                        to: '/security',
                        active: securityActive,
                        prefetch: () => preloadRouteChunk('/security'),
                    }]
                    : []),
            ]
            : []),
        [isAuthenticated, profileActive, roleHomeActive, roleHomeLabel, roleHomePath, securityActive, user?.role],
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

        const connection = window.navigator as Navigator & {
            connection?: {
                effectiveType?: string;
                saveData?: boolean;
            };
        };
        const effectiveType = connection.connection?.effectiveType || '';
        const saveData = connection.connection?.saveData === true;
        if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
            return;
        }

        const prefetchMode = effectiveType === '3g' ? 'minimal' : 'normal';
        const schedulePrefetch = () => {
            preloadLikelyRoutesForSession({
                isAuthenticated,
                role: user?.role,
                mode: prefetchMode,
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
            }, { timeout: prefetchMode === 'minimal' ? 2200 : 1500 });

            return () => {
                if (typeof withIdleCallback.cancelIdleCallback === 'function') {
                    withIdleCallback.cancelIdleCallback(idleId);
                }
            };
        }

        const timeoutId = window.setTimeout(schedulePrefetch, prefetchMode === 'minimal' ? 1400 : 600);
        return () => window.clearTimeout(timeoutId);
    }, [isAuthenticated, user?.role]);

    useEffect(() => {
        setMenuOpen(false);
    }, [location.pathname, location.search]);

    return (
        <header className="sticky top-0 z-50">
            <nav className="nav-shell">
                <div className="container-full-shell">
                    <div className="flex min-h-16 items-center justify-between gap-4 py-3">
                        <Link to="/" className="group inline-flex shrink-0 items-center gap-3 transition-transform hover:scale-[1.02]">
                            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-primary-600 to-primary-800 shadow-lg shadow-primary-700/20 transition-all group-hover:shadow-primary-700/30 group-hover:rotate-3">
                                <span className="font-display text-xl font-black text-white">A</span>
                                <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity group-hover:opacity-100"></div>
                            </div>
                            <div className="leading-tight">
                                <p className="font-display text-2xl font-black tracking-tight text-slate-900">
                                    Aqui<span className="text-accent-600">Ta</span><span className="text-primary-700">.do</span>
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 group-hover:text-primary-600 transition-colors">
                                    Discovery local en RD
                                </p>
                            </div>
                        </Link>

                        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 lg:flex">
                            {!loading ? (
                                <>
                                    <div className="nav-cluster flex min-w-0 items-center gap-1.5 p-1.5 bg-slate-50/50 border-slate-200/60">
                                        {primaryLinks.map((link) => (
                                            <Link
                                                key={link.to}
                                                to={link.to}
                                                className={link.active 
                                                    ? 'px-4 py-2 rounded-full text-sm font-bold bg-white text-primary-700 shadow-sm border border-slate-200/50 transition-all' 
                                                    : 'px-4 py-2 rounded-full text-sm font-semibold text-slate-500 hover:text-slate-900 hover:bg-white/50 transition-all'}
                                                aria-current={link.active ? 'page' : undefined}
                                                onMouseEnter={link.prefetch}
                                                onFocus={link.prefetch}
                                            >
                                                {link.label}
                                            </Link>
                                        ))}
                                        {authenticatedLinks.map((link) => (
                                            <Link
                                                key={link.to}
                                                to={link.to}
                                                className={link.active ? 'nav-link nav-link-active' : 'nav-link'}
                                                aria-current={link.active ? 'page' : undefined}
                                                onMouseEnter={link.prefetch}
                                                onFocus={link.prefetch}
                                            >
                                                {link.label}
                                            </Link>
                                        ))}
                                    </div>

                                    {installPromptEvent ? (
                                        <button
                                            type="button"
                                            className="btn-secondary text-sm"
                                            onClick={() => void handleInstallApp()}
                                        >
                                            Instalar app
                                        </button>
                                    ) : null}

                                    {isAuthenticated ? (
                                        <>
                                            {canRegisterBusiness ? (
                                                <Link
                                                    to="/register-business"
                                                    className="btn-primary whitespace-nowrap"
                                                    onMouseEnter={() => preloadRouteChunk('/register-business')}
                                                    onFocus={() => preloadRouteChunk('/register-business')}
                                                >
                                                    Registrar negocio
                                                </Link>
                                            ) : null}

                                            <div className="nav-cluster flex min-w-0 items-center gap-3 px-3">
                                                <div className="hidden text-right xl:block">
                                                    <p className="text-sm font-semibold text-slate-800">
                                                        {firstName}
                                                    </p>
                                                    <p className="max-w-[180px] truncate text-[11px] text-slate-500">
                                                        {organizationName || roleHomeLabel}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleLogout}
                                                    className="btn-ghost whitespace-nowrap"
                                                >
                                                    Salir
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Link
                                                to="/login"
                                                className="btn-secondary text-sm"
                                                onMouseEnter={() => preloadRouteChunk('/login')}
                                                onFocus={() => preloadRouteChunk('/login')}
                                            >
                                                Iniciar sesión
                                            </Link>
                                            <Link
                                                to="/register"
                                                className="btn-primary text-sm"
                                                onMouseEnter={() => preloadRouteChunk('/register')}
                                                onFocus={() => preloadRouteChunk('/register')}
                                            >
                                                Crear cuenta
                                            </Link>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-44 animate-pulse rounded-full bg-slate-100" />
                                    <div className="h-10 w-32 animate-pulse rounded-full bg-slate-100" />
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 lg:hidden"
                            onClick={() => setMenuOpen((previous) => !previous)}
                            aria-label={menuOpen ? 'Cerrar menú principal' : 'Abrir menú principal'}
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

                    {menuOpen ? (
                        <div id="mobile-main-menu" className="pb-4 lg:hidden">
                            <div className="surface-panel p-2">
                                {[...primaryLinks, ...authenticatedLinks].map((link) => (
                                    <Link
                                        key={link.to}
                                        to={link.to}
                                        className={`touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                                            link.active
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-slate-700 hover:bg-slate-50'
                                        }`}
                                        aria-current={link.active ? 'page' : undefined}
                                        onMouseEnter={link.prefetch}
                                        onFocus={link.prefetch}
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        {link.label}
                                    </Link>
                                ))}

                                {installPromptEvent ? (
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
                                ) : null}

                                {isAuthenticated ? (
                                    <>
                                        {canRegisterBusiness ? (
                                            <Link
                                                to="/register-business"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50"
                                                onMouseEnter={() => preloadRouteChunk('/register-business')}
                                                onFocus={() => preloadRouteChunk('/register-business')}
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                Registrar negocio
                                            </Link>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleLogout();
                                                setMenuOpen(false);
                                            }}
                                            className="touch-target mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            Salir
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Link
                                            to="/login"
                                            className={`touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                                                isPathActive(location.pathname, '/login')
                                                    ? 'bg-primary-50 text-primary-700'
                                                    : 'text-slate-700 hover:bg-slate-50'
                                            }`}
                                            onMouseEnter={() => preloadRouteChunk('/login')}
                                            onFocus={() => preloadRouteChunk('/login')}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Iniciar sesión
                                        </Link>
                                        <Link
                                            to="/register"
                                            className={`touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                                                isPathActive(location.pathname, '/register')
                                                    ? 'bg-primary-50 text-primary-700'
                                                    : 'text-slate-700 hover:bg-slate-50'
                                            }`}
                                            onMouseEnter={() => preloadRouteChunk('/register')}
                                            onFocus={() => preloadRouteChunk('/register')}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Crear cuenta
                                        </Link>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </nav>
        </header>
    );
}
