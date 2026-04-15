import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

interface AdminNavItem {
    label: string;
    to: string;
    description: string;
    active: boolean;
    icon: React.ReactNode;
}

function adminIcon(kind: 'businesses' | 'categories' | 'catalog' | 'verification' | 'observability' | 'security') {
    if (kind === 'categories') {
        return (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
                <path d="M4 7l8 4 8-4" />
            </svg>
        );
    }
    if (kind === 'catalog') {
        return (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h8" />
            </svg>
        );
    }
    if (kind === 'verification') {
        return (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="m9 12 2 2 4-4" />
            </svg>
        );
    }
    if (kind === 'observability') {
        return (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M3 12h3l3-7 4 14 3-7h5" />
            </svg>
        );
    }
    if (kind === 'security') {
        return (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
        );
    }

    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}

export function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const activeTab = new URLSearchParams(location.search).get('tab') || 'businesses';

    const navItems = useMemo<AdminNavItem[]>(() => [
        {
            label: 'Negocios',
            to: '/admin?tab=businesses',
            description: 'Vista general de fichas y estados.',
            active: location.pathname === '/admin' && activeTab === 'businesses',
            icon: adminIcon('businesses'),
        },
        {
            label: 'Categorías',
            to: '/admin?tab=categories',
            description: 'Taxonomía y estructura del catálogo.',
            active: location.pathname === '/admin' && activeTab === 'categories',
            icon: adminIcon('categories'),
        },
        {
            label: 'Catálogo',
            to: '/admin?tab=catalog',
            description: 'Claims, duplicados y ownership.',
            active: location.pathname === '/admin' && activeTab === 'catalog',
            icon: adminIcon('catalog'),
        },
        {
            label: 'Verificación',
            to: '/admin?tab=verification',
            description: 'KYC, moderación y data layer.',
            active: location.pathname === '/admin' && activeTab === 'verification',
            icon: adminIcon('verification'),
        },
        {
            label: 'Observabilidad',
            to: '/admin?tab=observability',
            description: 'Health, frontend y operación.',
            active: location.pathname === '/admin' && activeTab === 'observability',
            icon: adminIcon('observability'),
        },
        {
            label: 'Seguridad',
            to: '/security',
            description: '2FA y controles sensibles.',
            active: location.pathname === '/security',
            icon: adminIcon('security'),
        },
    ], [activeTab, location.pathname]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="app-shell density-compact" style={{ background: '#020617' }}>
            <header className="app-topbar border-slate-800/80 bg-slate-950/92 text-slate-100">
                <button
                    type="button"
                    onClick={() => setSidebarOpen((current) => !current)}
                    className="btn-ghost h-9 w-9 p-0 text-slate-200 lg:hidden"
                    aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={sidebarOpen}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                <Link to="/admin" className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-sm shadow-primary-700/30">
                        <span className="font-display text-lg font-bold">A</span>
                    </div>
                    <div className="leading-tight">
                        <p className="font-display text-base font-bold text-white">Consola admin</p>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                            {user?.email || 'Operación de plataforma'}
                        </p>
                    </div>
                </Link>

                <div className="flex-1" />

                <span className="hidden rounded-full border border-emerald-900 bg-emerald-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-400 md:inline-flex">
                    Sistema operativo
                </span>
                <Link to="/" className="btn-ghost hidden text-slate-200 md:inline-flex">
                    Sitio público
                </Link>
                <button type="button" onClick={handleLogout} className="btn-ghost text-slate-200">
                    Salir
                </button>
            </header>

            <div className="app-shell-body">
                {sidebarOpen ? (
                    <button
                        type="button"
                        className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
                        aria-label="Cerrar panel lateral"
                        onClick={() => setSidebarOpen(false)}
                    />
                ) : null}

                <aside
                    className={`console-shell-sidebar fixed inset-y-14 left-0 z-40 w-[320px] max-w-[calc(100vw-2rem)] -translate-x-full px-4 py-4 transition-transform lg:static lg:z-auto lg:w-[288px] lg:translate-x-0 ${
                        sidebarOpen ? 'translate-x-0' : ''
                    }`}
                >
                    <div className="shell-sidebar-card shell-sidebar-card--admin">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            Modo consola
                        </p>
                        <p className="mt-2 text-sm font-semibold text-white">
                            Moderación, catálogo y observabilidad
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-300">
                            La prioridad aquí es operar la plataforma con densidad compacta y navegación estable, no parecer una landing.
                        </p>
                    </div>

                    <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Menú de administración">
                        {navItems.map((item) => (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={item.active ? 'console-nav-link console-nav-link-active' : 'console-nav-link'}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <span className="mt-0.5">{item.icon}</span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold">{item.label}</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-slate-400">
                                        {item.description}
                                    </span>
                                </span>
                            </Link>
                        ))}
                    </nav>
                </aside>

                <main className="app-content min-w-0" style={{ background: '#020617' }}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
