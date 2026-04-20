import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getRoleCapabilities } from '../auth/capabilities';
import { resolveRoleHomeLabel, resolveRoleHomePath } from '../auth/roles';
import { AppShell, SidebarNav, StatusBadge } from '../components/ui';
import { useAuth } from '../context/useAuth';
import { useOrganization } from '../context/useOrganization';

interface NavItem {
    label: string;
    to: string;
    description: string;
    icon: React.ReactNode;
    active: boolean;
}

function navIcon(
    path:
        | 'home'
        | 'verification'
        | 'operations'
        | 'growth'
        | 'billing'
        | 'organization'
        | 'directory'
        | 'profile'
        | 'security'
        | 'suggest',
) {
    if (path === 'verification') {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 3 5 6v6c0 5 3 7.5 7 9 4-1.5 7-4 7-9V6l-7-3Z" />
                <path d="m9.5 12 1.8 1.8L15 10.2" />
            </svg>
        );
    }
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
                    description: 'Panorama general y prioridades del negocio.',
                    icon: navIcon('home'),
                    active: location.pathname === '/dashboard' && workspace === 'overview',
                },
                {
                    label: 'Verificacion',
                    to: '/dashboard?workspace=verification',
                    description: 'Documentos, revision y sello del negocio.',
                    icon: navIcon('verification'),
                    active: location.pathname === '/dashboard' && workspace === 'verification',
                },
                {
                    label: 'Operacion',
                    to: '/dashboard?workspace=operations',
                    description: 'Reservas, inbox y WhatsApp.',
                    icon: navIcon('operations'),
                    active: location.pathname === '/dashboard' && workspace === 'operations',
                },
                {
                    label: 'Crecimiento',
                    to: '/dashboard?workspace=growth',
                    description: 'Promociones, campanas y analytics.',
                    icon: navIcon('growth'),
                    active: location.pathname === '/dashboard' && workspace === 'growth',
                },
                {
                    label: 'Facturacion',
                    to: '/dashboard?workspace=billing',
                    description: 'Planes, uso y control financiero.',
                    icon: navIcon('billing'),
                    active: location.pathname === '/dashboard' && workspace === 'billing',
                },
                {
                    label: 'Organizacion',
                    to: '/dashboard?workspace=organization',
                    description: 'Equipo, miembros y ajustes.',
                    icon: navIcon('organization'),
                    active: location.pathname === '/dashboard' && workspace === 'organization',
                },
                {
                    label: 'Directorio',
                    to: '/businesses',
                    description: 'Ver experiencia publica.',
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
                    description: 'Moderacion, catalogo y estado del sistema.',
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
                    description: 'Ver experiencia publica.',
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
                description: 'Explorar negocios del catalogo.',
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

    const shellModeLabel = capabilities.isBusinessOwner
        ? 'Workspace negocio'
        : capabilities.isAdmin
            ? 'Modo operativo'
            : 'Cuenta personal';

    const sidebarCta = capabilities.isBusinessOwner
        ? { to: '/businesses', label: 'Ver directorio publico' }
        : capabilities.isAdmin
            ? { to: '/admin', label: 'Ir al panel admin' }
            : { to: '/suggest-business', label: 'Sugerir un negocio' };

    return (
        <AppShell density="compact">
            <a href="#main-content" className="skip-link">
                Saltar al contenido principal
            </a>
            <header className="app-topbar">
                <button
                    type="button"
                    onClick={() => setSidebarOpen((current) => !current)}
                    className="btn-icon lg:hidden"
                    aria-label={sidebarOpen ? 'Cerrar menu' : 'Abrir menu'}
                    aria-expanded={sidebarOpen}
                    aria-controls="dashboard-shell-sidebar"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                <Link to={roleHomePath} className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-sm shadow-primary-700/25">
                        <span className="font-display text-lg font-bold">A</span>
                    </div>
                    <div className="min-w-0 leading-tight">
                        <p className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">{shellLabel}</p>
                        <p className="hidden truncate whitespace-nowrap text-[11px] uppercase tracking-[0.16em] text-slate-500 sm:block">
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
                    id="dashboard-shell-sidebar"
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
                                ? 'Revisa tu negocio, atiende clientes y manten la informacion al dia desde un solo lugar.'
                                : capabilities.isAdmin
                                    ? 'Accede rapido a plataforma, seguridad y tu perfil desde un mismo espacio.'
                                    : 'Explora, organiza favoritos y vuelve a tu actividad reciente sin perder contexto.'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <StatusBadge tone={capabilities.isBusinessOwner ? 'claimed' : capabilities.isAdmin ? 'verified' : 'info'} size="sm">
                                {shellModeLabel}
                            </StatusBadge>
                            {activeOrganization ? (
                                <StatusBadge tone="neutral" size="sm">
                                    Organizacion activa
                                </StatusBadge>
                            ) : null}
                        </div>
                    </div>

                    <SidebarNav
                        items={navItems}
                        ariaLabel="Menu autenticado"
                        onItemClick={() => setSidebarOpen(false)}
                    />

                    <div className="mt-4 rounded-[22px] border border-slate-200/90 bg-white px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Accion rapida
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            Mantente en contexto sin abrir menus extras.
                        </p>
                        <Link
                            to={sidebarCta.to}
                            className="btn-secondary mt-3 w-full justify-center"
                            onClick={() => setSidebarOpen(false)}
                        >
                            {sidebarCta.label}
                        </Link>
                    </div>
                </aside>

                <main id="main-content" tabIndex={-1} className="app-content min-w-0">
                    <Outlet />
                </main>
            </div>
        </AppShell>
    );
}
