import { Outlet, Link } from 'react-router-dom';

export function AuthLayout() {
    return (
        <div className="flex min-h-screen flex-col bg-[color:var(--surface-bg)]">
            <a href="#main-content" className="skip-link">
                Saltar al contenido principal
            </a>
            <header className="app-topbar">
                <Link
                    to="/"
                    className="inline-flex items-center gap-3 text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    aria-label="Volver al inicio de AquiTa.do"
                >
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                        <rect width="28" height="28" rx="8" fill="#0636a8" />
                        <text x="5" y="20" fontFamily="Sora, sans-serif" fontWeight="700" fontSize="14" fill="white">A.</text>
                    </svg>
                    <span className="font-display text-base font-bold text-slate-900 tracking-tight">
                        AquiTa.do
                    </span>
                </Link>

                <div className="flex-1" />

                <Link
                    to="/businesses"
                    className="text-xs font-semibold text-slate-500 transition-colors hover:text-primary-700"
                >
                    Explorar negocios
                </Link>
            </header>

            <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
                <Outlet />
            </main>
        </div>
    );
}
