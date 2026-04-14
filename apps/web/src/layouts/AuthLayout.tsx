import { Outlet, Link } from 'react-router-dom';

/**
 * AuthLayout — shell para rutas de autenticación (§ 9.3, § 6)
 *
 * Principio del blueprint:
 *   - el formulario domina sobre lo decorativo
 *   - foco en entrar rápido, sin landing
 *   - pantallas simples, centradas, sin ruido
 *
 * Rutas: /login, /register, /forgot-password, /reset-password
 *
 * Nota: no reemplaza el hero panel de login/register —
 * esas páginas ya tienen su propio layout de dos columnas.
 * Este shell solo provee el wrapper exterior sin Navbar/Footer.
 */
export function AuthLayout() {
    return (
        <div className="flex min-h-screen flex-col bg-[color:var(--surface-bg)]">
            {/* Topbar mínimo: solo logo y enlace de ayuda */}
            <header className="flex h-14 shrink-0 items-center justify-between px-5 sm:px-8">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    aria-label="Volver al inicio de AquiTa.do"
                >
                    {/* Logo wordmark compacto */}
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                        <rect width="28" height="28" rx="8" fill="#0636a8" />
                        <text x="5" y="20" fontFamily="Sora, sans-serif" fontWeight="700" fontSize="14" fill="white">A.</text>
                    </svg>
                    <span className="font-display text-base font-bold text-slate-900 tracking-tight">
                        AquiTa.do
                    </span>
                </Link>

                <Link
                    to="/businesses"
                    className="text-xs font-semibold text-slate-500 hover:text-primary-700 transition-colors"
                >
                    Explorar negocios
                </Link>
            </header>

            {/* Contenido de la página auth (el Outlet renderiza Login, Register, etc.) */}
            <main className="flex flex-1 flex-col">
                <Outlet />
            </main>
        </div>
    );
}
