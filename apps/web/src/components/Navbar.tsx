import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export function Navbar() {
    const { isAuthenticated, user, logout } = useAuth();
    const { activeOrganization } = useOrganization();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

    const roleHomePath = resolveRoleHomePath(user?.role);
    const roleHomeLabel = resolveRoleHomeLabel(user?.role);
    const roleCapabilities = getRoleCapabilities(user?.role);
    const canRegisterBusiness = roleCapabilities.canRegisterBusiness;
    const canAccessOrganization = roleCapabilities.canManageOrganizations;
    const organizationName = activeOrganization?.name?.trim() ?? '';
    const showOrganizationChip = organizationName.length > 0 && organizationName.length <= 18;

    const handleLogout = () => {
        void logout();
        navigate('/');
    };

    const handleInstallApp = async () => {
        if (!installPromptEvent) {
            return;
        }

        await installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice.outcome === 'accepted') {
            setInstallPromptEvent(null);
        }
    };

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handler = (event: Event) => {
            event.preventDefault();
            setInstallPromptEvent(event as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
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

    return (
        <header className="sticky top-0 z-50">
            <div className="hidden md:block border-b border-primary-100/70 bg-white/80 backdrop-blur-md">
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

                        <div className="hidden lg:flex items-center gap-3 xl:gap-5 min-w-0">
                            <Link
                                to="/businesses"
                                className="nav-link"
                                onMouseEnter={() => preloadRouteChunk('/businesses')}
                                onFocus={() => preloadRouteChunk('/businesses')}
                            >
                                Negocios
                            </Link>
                            {!isAuthenticated && (
                                <Link
                                    to="/about"
                                    className="nav-link"
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
                                        className="nav-link"
                                        onMouseEnter={() => preloadRouteChunk(roleHomePath)}
                                        onFocus={() => preloadRouteChunk(roleHomePath)}
                                    >
                                        {roleHomeLabel}
                                    </Link>
                                    {canAccessOrganization && (
                                        <Link
                                            to="/organization"
                                            className="nav-link"
                                            onMouseEnter={() => preloadRouteChunk('/organization')}
                                            onFocus={() => preloadRouteChunk('/organization')}
                                        >
                                            Organizacion
                                        </Link>
                                    )}
                                    {user?.role === 'ADMIN' && (
                                        <Link
                                            to="/security"
                                            className="nav-link"
                                            onMouseEnter={() => preloadRouteChunk('/security')}
                                            onFocus={() => preloadRouteChunk('/security')}
                                        >
                                            Seguridad
                                        </Link>
                                    )}
                                    <Link
                                        to="/profile"
                                        className="nav-link"
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
                                                className="chip-danger !py-1 max-w-[140px] 2xl:max-w-[180px] truncate overflow-hidden"
                                                title={organizationName}
                                            >
                                                {organizationName}
                                            </span>
                                        )}
                                        <span className="text-sm text-slate-500 whitespace-nowrap">Hola, {user?.name?.split(' ')[0]}</span>
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

                        <button
                            type="button"
                            className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-700"
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
                        <div id="mobile-main-menu" className="lg:hidden pb-4 pt-2 animate-slide-down">
                            <div className="surface-panel p-2">
                                    <Link
                                        to="/businesses"
                                        className="touch-target block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                        onMouseEnter={() => preloadRouteChunk('/businesses')}
                                        onFocus={() => preloadRouteChunk('/businesses')}
                                        onClick={() => setMenuOpen(false)}
                                    >
                                        Negocios
                                </Link>
                                {!isAuthenticated && (
                                    <Link
                                        to="/about"
                                        className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
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
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                            onMouseEnter={() => preloadRouteChunk(roleHomePath)}
                                            onFocus={() => preloadRouteChunk(roleHomePath)}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            {roleHomeLabel}
                                        </Link>
                                        {canAccessOrganization && (
                                            <Link
                                                to="/organization"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                                onMouseEnter={() => preloadRouteChunk('/organization')}
                                                onFocus={() => preloadRouteChunk('/organization')}
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                Organizacion
                                            </Link>
                                        )}
                                        {user?.role === 'ADMIN' && (
                                            <Link
                                                to="/security"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                                onMouseEnter={() => preloadRouteChunk('/security')}
                                                onFocus={() => preloadRouteChunk('/security')}
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                Seguridad
                                            </Link>
                                        )}
                                        <Link
                                            to="/profile"
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
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
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                            onMouseEnter={() => preloadRouteChunk('/login')}
                                            onFocus={() => preloadRouteChunk('/login')}
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Iniciar Sesion
                                        </Link>
                                        <Link
                                            to="/register"
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
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
