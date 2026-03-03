import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';
import { resolveRoleHomeLabel, resolveRoleHomePath } from '../auth/roles';
import { getRoleCapabilities } from '../auth/capabilities';

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
        <nav className="glass sticky top-0 z-50 shadow-sm border-b border-primary-100/70">
            <div className="flag-ribbon" aria-hidden="true"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <Link to="/" className="flex items-center gap-2 group">
                        <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary-500/30 group-hover:shadow-xl transition-all">
                            A
                        </div>
                        <span className="font-display font-bold text-xl">
                            Aqui<span className="text-accent-500">Ta</span>.do
                        </span>
                    </Link>

                    <div className="hidden md:flex items-center gap-6">
                        <Link to="/businesses" className="nav-link">
                            Negocios
                        </Link>
                        {isAuthenticated ? (
                            <>
                                <Link to={roleHomePath} className="nav-link">
                                    {roleHomeLabel}
                                </Link>
                                {canAccessOrganization && (
                                    <Link to="/organization" className="nav-link">
                                        Organizacion
                                    </Link>
                                )}
                                <Link to="/profile" className="nav-link">
                                    Perfil
                                </Link>
                                {canRegisterBusiness && (
                                    <Link to="/register-business" className="btn-accent text-sm">
                                        + Registrar Negocio
                                    </Link>
                                )}
                                <div className="flex items-center gap-3">
                                    {roleCapabilities.isPlatformOperator && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-accent-50 text-accent-700 font-medium">
                                            Modo Plataforma
                                        </span>
                                    )}
                                    {activeOrganization && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-primary-50 text-primary-700 font-medium">
                                            {activeOrganization.name}
                                        </span>
                                    )}
                                    <span className="text-sm text-gray-500">Hola, {user?.name?.split(' ')[0]}</span>
                                    <button
                                        onClick={handleLogout}
                                        className="text-sm text-gray-500 hover:text-red-500 transition-colors"
                                    >
                                        Salir
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-3">
                                <Link to="/login" className="btn-secondary text-sm">
                                    Iniciar Sesion
                                </Link>
                                <Link to="/register" className="btn-primary text-sm">
                                    Registrarse
                                </Link>
                            </div>
                        )}
                    </div>

                    <button
                        className="md:hidden p-2 rounded-lg hover:bg-gray-100 touch-target"
                        onClick={() => setMenuOpen(!menuOpen)}
                        aria-label={menuOpen ? 'Cerrar menu principal' : 'Abrir menu principal'}
                        aria-expanded={menuOpen}
                        aria-controls="mobile-main-menu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {menuOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>
                </div>

                {menuOpen && (
                    <div id="mobile-main-menu" className="md:hidden py-4 border-t border-primary-100/70 animate-slide-down">
                        <div className="flex flex-col gap-3 rounded-xl bg-white/75 backdrop-blur-sm p-2">
                            <Link to="/businesses" className="py-2 px-2 rounded-lg touch-target text-gray-600 hover:text-primary-600 hover:bg-primary-50 font-medium" onClick={() => setMenuOpen(false)}>
                                Negocios
                            </Link>
                            {isAuthenticated ? (
                                <>
                                    {roleCapabilities.isPlatformOperator && (
                                        <p className="pt-1 text-xs uppercase tracking-wide text-gray-400 font-semibold">
                                            Plataforma
                                        </p>
                                    )}
                                    {canRegisterBusiness && (
                                        <Link to="/register-business" className="py-2 px-2 rounded-lg touch-target text-accent-600 hover:bg-accent-50 font-medium" onClick={() => setMenuOpen(false)}>
                                            + Registrar Negocio
                                        </Link>
                                    )}
                                    <Link to={roleHomePath} className="py-2 px-2 rounded-lg touch-target text-gray-600 hover:bg-primary-50 font-medium" onClick={() => setMenuOpen(false)}>
                                        {roleHomeLabel}
                                    </Link>
                                    {canAccessOrganization && (
                                        <Link to="/organization" className="py-2 px-2 rounded-lg touch-target text-gray-600 hover:bg-primary-50 font-medium" onClick={() => setMenuOpen(false)}>
                                            Organizacion
                                        </Link>
                                    )}
                                    <p className="pt-1 text-xs uppercase tracking-wide text-gray-400 font-semibold">
                                        Cuenta
                                    </p>
                                    <Link to="/profile" className="py-2 px-2 rounded-lg touch-target text-gray-600 hover:bg-primary-50 font-medium" onClick={() => setMenuOpen(false)}>
                                        Perfil
                                    </Link>
                                    <button onClick={() => { handleLogout(); setMenuOpen(false); }} className="py-2 px-2 rounded-lg touch-target text-left text-red-500 hover:bg-red-50 font-medium">
                                        Salir
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link to="/login" className="py-2 px-2 rounded-lg touch-target text-gray-600 hover:bg-primary-50 font-medium" onClick={() => setMenuOpen(false)}>
                                        Iniciar Sesion
                                    </Link>
                                    <Link to="/register" className="py-2 px-2 rounded-lg touch-target text-primary-600 hover:bg-primary-50 font-medium" onClick={() => setMenuOpen(false)}>
                                        Registrarse
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
