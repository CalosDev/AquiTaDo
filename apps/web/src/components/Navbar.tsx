import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRoleCapabilities } from '../auth/capabilities';
import { resolveRoleHomeLabel, resolveRoleHomePath } from '../auth/roles';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';

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

    const roleHomePath = resolveRoleHomePath(user?.role);
    const roleHomeLabel = resolveRoleHomeLabel(user?.role);
    const roleCapabilities = getRoleCapabilities(user?.role);
    const canRegisterBusiness = roleCapabilities.canRegisterBusiness;
    const canAccessOrganization = roleCapabilities.canManageOrganizations;

    const handleLogout = () => {
        void logout().finally(() => {
            navigate('/');
        });
    };

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

                        <div className="hidden md:flex items-center gap-4 xl:gap-6 min-w-0">
                            <Link to="/businesses" className="nav-link">Negocios</Link>
                            <Link to="/about" className="nav-link">Nosotros</Link>
                            {isAuthenticated ? (
                                <>
                                    <Link to={roleHomePath} className="nav-link">{roleHomeLabel}</Link>
                                    {canAccessOrganization && (
                                        <Link to="/organization" className="nav-link">Organizacion</Link>
                                    )}
                                    {user?.role === 'ADMIN' && (
                                        <Link to="/security" className="nav-link">Seguridad</Link>
                                    )}
                                    <Link to="/profile" className="nav-link">Perfil</Link>
                                    {canRegisterBusiness && (
                                        <Link to="/register-business" className="btn-accent text-sm whitespace-nowrap shrink-0">+ Registrar Negocio</Link>
                                    )}
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="chip !py-1 whitespace-nowrap">{roleBadgeLabel(user?.role)}</span>
                                        {activeOrganization && (
                                            <span className="chip-danger !py-1 max-w-[120px] xl:max-w-[170px] truncate hidden lg:inline-flex">{activeOrganization.name}</span>
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
                                    <Link to="/login" className="btn-secondary text-sm">Iniciar Sesion</Link>
                                    <Link to="/register" className="btn-primary text-sm">Crear Cuenta</Link>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary-200 bg-white text-primary-700"
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
                        <div id="mobile-main-menu" className="md:hidden pb-4 pt-2 animate-slide-down">
                            <div className="surface-panel p-2">
                                <Link
                                    to="/businesses"
                                    className="touch-target block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    Negocios
                                </Link>
                                <Link
                                    to="/about"
                                    className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    Nosotros
                                </Link>

                                {isAuthenticated ? (
                                    <>
                                        {canRegisterBusiness && (
                                            <Link
                                                to="/register-business"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50"
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                + Registrar Negocio
                                            </Link>
                                        )}
                                        <Link
                                            to={roleHomePath}
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            {roleHomeLabel}
                                        </Link>
                                        {canAccessOrganization && (
                                            <Link
                                                to="/organization"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                Organizacion
                                            </Link>
                                        )}
                                        {user?.role === 'ADMIN' && (
                                            <Link
                                                to="/security"
                                                className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
                                                onClick={() => setMenuOpen(false)}
                                            >
                                                Seguridad
                                            </Link>
                                        )}
                                        <Link
                                            to="/profile"
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary-50"
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
                                            onClick={() => setMenuOpen(false)}
                                        >
                                            Iniciar Sesion
                                        </Link>
                                        <Link
                                            to="/register"
                                            className="touch-target mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
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
