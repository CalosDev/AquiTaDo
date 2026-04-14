import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

interface AdminNavItem {
    label: string;
    to: string;
    icon: React.ReactNode;
    end?: boolean;
}

const adminNav: AdminNavItem[] = [
    {
        label: 'Panel',
        to: '/admin',
        end: true,
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        label: 'Moderación',
        to: '/admin/moderation',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Verificación',
        to: '/admin/verification',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <polyline points="9 11 12 14 22 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Negocios',
        to: '/admin/businesses',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Usuarios',
        to: '/admin/users',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Seguridad',
        to: '/security',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
    {
        label: 'Observabilidad',
        to: '/admin/health',
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
    },
];

/**
 * AdminLayout — shell tipo consola para administración (§ 9.9, § 4.4)
 *
 * Principios del blueprint:
 *   - diseño más consola, menos marketing
 *   - navegación persistente
 *   - tablas y colas como primera clase
 *   - alertas y health compactos
 *   - sobrio, muy funcional, denso pero ordenado
 *   - densidad compacta (§ 12.3)
 *
 * Rutas: /admin, /admin/*, /security
 */
export function AdminLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    function handleLogout() {
        logout();
        navigate('/login');
    }

    return (
        <div className="app-shell density-compact" style={{ background: '#0f172a' }}>

            {/* ── Top Bar — estilo consola ──────────────────────── */}
            <header
                className="sticky top-0 z-40 flex h-12 w-full shrink-0 items-center gap-3 border-b border-slate-700/80 px-4"
                style={{ background: '#0f172a' }}
            >
                <Link
                    to="/admin"
                    className="flex items-center gap-2 text-slate-100 hover:text-white transition-colors"
                    aria-label="Panel administrativo AquiTa.do"
                >
                    <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                        <rect width="28" height="28" rx="8" fill="#0636a8" />
                        <text x="5" y="20" fontFamily="Sora, sans-serif" fontWeight="700" fontSize="14" fill="white">A.</text>
                    </svg>
                    <span className="font-display text-sm font-bold tracking-tight">
                        Admin
                    </span>
                </Link>

                {/* Health indicator */}
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400 sm:inline-flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    Sistema operativo
                </span>

                <div className="flex-1" />

                {/* Operator identity */}
                <span className="hidden text-[11px] text-slate-500 sm:block">
                    {user?.email ?? 'Administrador'}
                </span>

                {/* Exit to main site */}
                <Link
                    to="/"
                    className="text-xs font-semibold text-slate-500 hover:text-slate-300 transition-colors"
                >
                    ← Salir
                </Link>

                <button
                    onClick={handleLogout}
                    className="text-xs font-semibold text-slate-600 hover:text-red-400 transition-colors"
                    aria-label="Cerrar sesión"
                >
                    Logout
                </button>
            </header>

            {/* ── Body: Nav lateral + Content ──────────────────── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Sidebar admin — más estrecha, más funcional */}
                <aside
                    className="hidden w-52 shrink-0 flex-col border-r border-slate-700/60 lg:flex"
                    style={{ background: '#0f172a' }}
                >
                    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3" aria-label="Menú de administración">
                        {adminNav.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    `flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                                        isActive
                                            ? 'bg-slate-700 text-white'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                    }`
                                }
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                {/* Content area — fondo ligeramente más claro que el shell */}
                <main
                    className="flex flex-1 flex-col overflow-y-auto"
                    id="admin-main-content"
                    style={{ background: '#0f1929' }}
                >
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
