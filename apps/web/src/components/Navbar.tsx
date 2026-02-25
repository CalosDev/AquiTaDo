import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';

export function Navbar() {
    const { isAuthenticated, user, logout, isAdmin, isBusinessOwner } = useAuth();
    const { activeOrganization } = useOrganization();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);

    const handleLogout = () => {
        void logout().finally(() => {
            navigate('/');
        });
    };

    return (
        <nav className="glass sticky top-0 z-50 shadow-sm">
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
                        <Link to="/businesses" className="text-gray-600 hover:text-primary-600 font-medium transition-colors">
                            Negocios
                        </Link>
                        {isAuthenticated ? (
                            <>
                                {(isBusinessOwner || isAdmin) && (
                                    <Link to="/dashboard" className="text-gray-600 hover:text-primary-600 font-medium transition-colors">
                                        Dashboard
                                    </Link>
                                )}
                                <Link to="/organization" className="text-gray-600 hover:text-primary-600 font-medium transition-colors">
                                    Organizacion
                                </Link>
                                <Link to="/profile" className="text-gray-600 hover:text-primary-600 font-medium transition-colors">
                                    Perfil
                                </Link>
                                {isAdmin && (
                                    <Link to="/admin" className="text-gray-600 hover:text-primary-600 font-medium transition-colors">
                                        Admin
                                    </Link>
                                )}
                                <Link to="/register-business" className="btn-accent text-sm">
                                    + Registrar Negocio
                                </Link>
                                <div className="flex items-center gap-3">
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
                        className="md:hidden p-2 rounded-lg hover:bg-gray-100"
                        onClick={() => setMenuOpen(!menuOpen)}
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
                    <div className="md:hidden py-4 border-t border-gray-100 animate-slide-down">
                        <div className="flex flex-col gap-3">
                            <Link to="/businesses" className="py-2 text-gray-600 hover:text-primary-600 font-medium" onClick={() => setMenuOpen(false)}>
                                Negocios
                            </Link>
                            {isAuthenticated ? (
                                <>
                                    <Link to="/register-business" className="py-2 text-accent-600 font-medium" onClick={() => setMenuOpen(false)}>
                                        + Registrar Negocio
                                    </Link>
                                    {(isBusinessOwner || isAdmin) && (
                                        <Link to="/dashboard" className="py-2 text-gray-600 font-medium" onClick={() => setMenuOpen(false)}>
                                            Dashboard
                                        </Link>
                                    )}
                                    <Link to="/organization" className="py-2 text-gray-600 font-medium" onClick={() => setMenuOpen(false)}>
                                        Organizacion
                                    </Link>
                                    <Link to="/profile" className="py-2 text-gray-600 font-medium" onClick={() => setMenuOpen(false)}>
                                        Perfil
                                    </Link>
                                    {isAdmin && (
                                        <Link to="/admin" className="py-2 text-gray-600 font-medium" onClick={() => setMenuOpen(false)}>
                                            Admin
                                        </Link>
                                    )}
                                    <button onClick={() => { handleLogout(); setMenuOpen(false); }} className="py-2 text-left text-red-500 font-medium">
                                        Salir
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link to="/login" className="py-2 text-gray-600 font-medium" onClick={() => setMenuOpen(false)}>
                                        Iniciar Sesion
                                    </Link>
                                    <Link to="/register" className="py-2 text-primary-600 font-medium" onClick={() => setMenuOpen(false)}>
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
