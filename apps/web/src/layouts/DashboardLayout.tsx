import { useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

interface NavItem {
    label: string;
    to: string;
    icon: React.ReactNode;
    end?: boolean;
}

const dashboardNav: NavItem[] = [
    {
        label: 'Inicio',
        to: '/dashboard',
        end: true,
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
                <polyline points="9 22 9 12 15 12 15 22" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Reservas',
        to: '/dashboard/bookings',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="16" y1="2" x2="16" y2="6" strokeLinecap="round" />
                <line x1="8" y1="2" x2="8" y2="6" strokeLinecap="round" />
                <line x1="3" y1="10" x2="21" y2="10" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        label: 'Mensajes',
        to: '/dashboard/inbox',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Promociones',
        to: '/dashboard/promotions',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Analytics',
        to: '/dashboard/analytics',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <line x1="18" y1="20" x2="18" y2="10" strokeLinecap="round" />
                <line x1="12" y1="20" x2="12" y2="4" strokeLinecap="round" />
                <line x1="6" y1="20" x2="6" y2="14" strokeLinecap="round" />
            </svg>
        ),
    },
    {
        label: 'Verificación',
        to: '/dashboard/verification',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Billing',
        to: '/dashboard/billing',
        icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="1" y1="10" x2="23" y2="10" strokeLinecap="round" />
            </svg>
        ),
    },
];

/**
 * DashboardLayout — shell autenticado para negocios (§ 6, § 9.4)
 *
 * Principios del blueprint:
 *   - top bar global + sidebar contextual + content area
 *   - sidebar orienta, no protagoniza (§ 6.2)
 *   - el usuario siempre sabe dónde está y qué puede hacer
 *   - densidad compacta en toda la superficie SaaS (§ 12.3)
 *
 * Rutas: /dashboard, /dashboard/*, /register-business, /profile, /app
 */
export function DashboardLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    function handleLogout() {
        logout();
        navigate('/login');
    }

    return (
        <div className="app-shell density-compact">

            {/* ── Top Bar Global ────────────────────────────────── */}
            <header className="app-topbar">
                {/* Sidebar toggle */}
                <button
                    onClick={() => setSidebarOpen(v => !v)}
                    className="btn-ghost h-9 w-9 p-0 shrink-0"
                    aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={sidebarOpen}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                {/* Logo */}
                <Link to="/dashboard" className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                        <rect width="28" height="28" rx="8" fill="#0636a8" />
                        <text x="5" y="20" fontFamily="Sora, sans-serif" fontWeight="700" fontSize="14" fill="white">A.</text>
                    </svg>
                    <span className="hidden sm:inline">AquiTa.do</span>
                </Link>

                <div className="flex-1" />

                {/* Discovery shortcut */}
                <Link
                    to="/businesses"
                    className="hidden text-xs font-semibold text-slate-500 hover:text-primary-700 transition-colors sm:block"
                >
                    Ver directorio
                </Link>

                {/* User avatar / menu */}
                <Link
                    to="/profile"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 hover:bg-primary-200 transition-colors"
                    aria-label="Mi perfil"
                >
                    {user?.name?.charAt(0).toUpperCase() ?? 'U'}
                </Link>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="btn-ghost h-9 px-3 text-xs"
                    aria-label="Cerrar sesión"
                >
                    Salir
                </button>
            </header>

            {/* ── Body: Sidebar + Content ───────────────────────── */}
            <div className="app-shell-body">

                {/* Sidebar contextual */}
                {sidebarOpen && (
                    <aside className="app-sidebar hidden lg:flex shrink-0">
                        {/* Identidad compacta del contexto */}
                        <div className="app-sidebar__identity">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-xs font-bold text-white">
                                {user?.name?.charAt(0) ?? 'N'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-800">
                                    {user?.name ?? 'Mi negocio'}
                                </p>
                                <p className="truncate text-[10px] text-slate-500">Panel de negocio</p>
                            </div>
                        </div>

                        {/* Navegación principal */}
                        <nav className="app-sidebar__nav" aria-label="Menú del dashboard">
                            {dashboardNav.map(item => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    end={item.end}
                                    className={({ isActive }) =>
                                        `app-sidebar__nav-item ${isActive ? 'app-sidebar__nav-item--active' : ''}`
                                    }
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </NavLink>
                            ))}
                        </nav>

                        {/* Footer sidebar — CTA secundario al final (§ 6.2) */}
                        <div className="app-sidebar__footer">
                            <Link
                                to="/businesses"
                                className="text-[11px] font-medium text-slate-400 hover:text-primary-600 transition-colors"
                            >
                                Ver mi ficha pública →
                            </Link>
                        </div>
                    </aside>
                )}

                {/* Content Area */}
                <main className="app-content" id="main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
