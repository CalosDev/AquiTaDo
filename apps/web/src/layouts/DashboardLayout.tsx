import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getRoleCapabilities } from '../auth/capabilities';
import { resolveRoleHomeLabel, resolveRoleHomePath } from '../auth/roles';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';

interface NavItem {
    label: string;
    to: string;
    description: string;
    icon: React.ReactNode;
    active: boolean;
}

function navIcon(path: 'home' | 'operations' | 'growth' | 'billing' | 'organization' | 'directory' | 'profile' | 'security' | 'suggest') {
    if (path === 'operations') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h6" />
            </svg>
        );
    }
    if (path === 'growth') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M4 19h16" />
                <path d="m6 15 4-4 4 3 4-6" />
            </svg>
        );
    }
    if (path === 'billing') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
            </svg>
        );
    }
    if (path === 'organization') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
        );
    }
    if (path === 'directory') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1.1-1.79l-6-3a2 2 0 0 0-1.8 0l-6 3A2 2 0 0 0 5 8v8a2 2 0 0 0 1.1 1.79l6 3a2 2 0 0 0 1.8 0l6-3A2 2 0 0 0 21 16Z" />
                <path d="M3.3 7 12 11.5 20.7 7" />
            </svg>
        );
    }
    if (path === 'profile') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M20 21a8 8 0 0 0-16 0" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        );
    }
    if (path === 'security') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
        );
    }
    if (path === 'suggest') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="M5 12h14" />
            </svg>
        );
    }

    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
            <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5Z" />
        </svg>
    );
}

export function DashboardLayout() {
    const { user, logout } = useAuth();
    const { activeOrganization } = useOrganization();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const capabilities = getRoleCapabilities(user?.role);
    const roleHomePath = resolveRoleHomePath(user?.role);
    const roleHomeLabel = resolveRoleHomeLabel(user?.role);
    const workspace = new URLSearchParams(location.search).get('workspace') || 'overview';

    const navItems = useMemo<NavItem[]>(() => {
        if (capabilities.isBusinessOwner) {
            return [
                {
                    label: 'Resumen',
                    to: '/dashboard',
                    description: 'Estado general, claims y verificación.',
                    icon: navIcon('home'),
                    active: location.pathname === '/dashboard' && workspace === 'overview',
                },
                {
                    label: 'Operación',
                    to: '/dashboard?workspace=operations',
                    description: 'Reservas, inbox y WhatsApp.',
                    icon: navIcon('operations'),
                    active: location.pathname === '/dashboard' && workspace === 'operations',
                },
                {
                    label: 'Crecimiento',
                    to: '/dashboard?workspace=growth',
                    description: 'Promociones, campañas y analytics.',
                    icon: navIcon('growth'),
                    active: location.pathname === '/dashboard' && workspace === 'growth',
                },
                {
                    label: 'Facturación',
                    to: '/dashboard?workspace=billing',
                    description: 'Planes, uso y control financiero.',
                    icon: navIcon('billing'),
                    active: location.pathname === '/dashboard' && workspace === 'billing',
                },
                {
                    label: 'Organización',
                    to: '/dashboard?workspace=organization',
                    description: 'Equipo, miembros y ajustes.',
                    icon: navIcon('organization'),
                    active: location.pathname === '/dashboard' && workspace === 'organization',
                },
                {
                    label: 'Directorio',
                    to: '/businesses',
                    description: 'Ver experiencia pública.',
                    icon: navIcon('directory'),
                    active: location.pathname === '/businesses' || location.pathname.startsWith('/businesses/'),
                },
                {
                    label: 'Perfil',
                    to: '/profile',
                    description: 'Cuenta y preferencias.',
                    icon: navIcon('profile'),
                    active: location.pathname === '/profile',
                },
            ];
        }

        if (capabilities.isAdmin) {
            return [
                {
                    label: 'Panel admin',
                    to: '/admin',
                    description: 'Moderación, catálogo y observabilidad.',
                    icon: navIcon('home'),
                    active: location.pathname === '/admin',
                },
                {
                    label: 'Seguridad',
                    to: '/security',
                    description: 'Controles sensibles de plataforma.',
                    icon: navIcon('security'),
                    active: location.pathname === '/security',
                },
                {
                    label: 'Directorio',
                    to: '/businesses',
                    description: 'Ver experiencia pública.',
                    icon: navIcon('directory'),
                    active: location.pathname === '/businesses' || location.pathname.startsWith('/businesses/'),
                },
                {
                    label: 'Perfil',
                    to: '/profile',
                    description: 'Cuenta y actividad personal.',
                    icon: navIcon('profile'),
                    active: location.pathname === '/profile',
                },
            ];
        }

        return [
            {
                label: roleHomeLabel,
                to: roleHomePath,
                description: 'Tu actividad reciente.',
                icon: navIcon('home'),
                active: location.pathname === roleHomePath,
            },
            {
                label: 'Directorio',
                to: '/businesses',
                description: 'Explorar negocios del catálogo.',
                icon: navIcon('directory'),
                active: location.pathname === '/businesses' || location.pathname.startsWith('/businesses/'),
            },
            {
                label: 'Sugerir negocio',
                to: '/suggest-business',
                description: 'Aporta una ficha nueva.',
                icon: navIcon('suggest'),
                active: location.pathname === '/suggest-business',
            },
            {
                label: 'Perfil',
                to: '/profile',
                description: 'Cuenta y favoritos.',
                icon: navIcon('profile'),
                active: location.pathname === '/profile',
            },
        ];
    }, [capabilities.isAdmin, capabilities.isBusinessOwner, location.pathname, roleHomeLabel, roleHomePath, workspace]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const shellLabel = capabilities.isBusinessOwner
        ? 'Panel negocio'
        : capabilities.isAdmin
            ? 'Acceso autenticado'
            : 'Panel personal';

    return (
        <div className="app-shell density-compact">
            <header className="app-topbar">
                <button
                    type="button"
                    onClick={() => setSidebarOpen((current) => !current)}
                    className="btn-ghost h-9 w-9 p-0 lg:hidden"
                    aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={sidebarOpen}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                <Link to={roleHomePath} className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-sm shadow-primary-700/25">
                        <span className="font-display text-lg font-bold">A</span>
                    </div>
                    <div className="leading-tight">
                        <p className="font-display text-base font-bold text-slate-900">{shellLabel}</p>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                            {activeOrganization?.name || roleHomeLabel}
                        </p>
                    </div>
                </Link>

                <div className="flex-1" />

                <Link to="/businesses" className="hidden text-sm font-semibold text-slate-500 transition-colors hover:text-primary-700 md:block">
                    Ver directorio
                </Link>
                <Link to="/profile" className="btn-secondary hidden md:inline-flex">
                    Perfil
                </Link>
                <button type="button" onClick={handleLogout} className="btn-ghost">
                    Salir
                </button>
            </header>

            <div className="app-shell-body">
                {sidebarOpen ? (
                    <button
                        type="button"
                        className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
                        aria-label="Cerrar panel lateral"
                        onClick={() => setSidebarOpen(false)}
                    />
                ) : null}

                <aside
                    className={`auth-shell-sidebar fixed inset-y-14 left-0 z-40 w-[320px] max-w-[calc(100vw-2rem)] -translate-x-full px-4 py-4 transition-transform lg:static lg:z-auto lg:w-[288px] lg:translate-x-0 ${
                        sidebarOpen ? 'translate-x-0' : ''
                    }`}
                >
                    <div className="shell-sidebar-card shell-sidebar-card--owner">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-700">
                            Contexto activo
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                            {activeOrganization?.name || user?.name || 'Mi cuenta'}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                            {capabilities.isBusinessOwner
                                ? 'Shell compacto para operar, crecer y administrar sin bloques hero innecesarios.'
                                : capabilities.isAdmin
                                    ? 'Accede rápido a plataforma, seguridad y tu perfil desde un mismo shell.'
                                    : 'Explora, organiza favoritos y vuelve a tu actividad reciente sin perder contexto.'}
                        </p>
                    </div>

                    <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Menú autenticado">
                        {navItems.map((item) => (
                            <Link
                                key={item.to}
                                to={item.to}
                                className={item.active ? 'shell-nav-link shell-nav-link-active' : 'shell-nav-link'}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <span className="mt-0.5 text-current">{item.icon}</span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold">{item.label}</span>
                                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                                        {item.description}
                                    </span>
                                </span>
                            </Link>
                        ))}
                    </nav>
                </aside>

                <main className="app-content min-w-0">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
