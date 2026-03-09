import { Link } from 'react-router-dom';
import { getRoleCapabilities } from '../auth/capabilities';
import { useAuth } from '../context/useAuth';

export function Footer() {
    const { isAuthenticated, user } = useAuth();
    const roleCapabilities = getRoleCapabilities(user?.role);
    const canRegisterBusiness = roleCapabilities.canRegisterBusiness;
    const canAccessBusinessPanel = roleCapabilities.canAccessBusinessPanel;
    const canAccessAdminPanel = roleCapabilities.canAccessAdminPanel;

    const registerBusinessPath = !isAuthenticated
        ? '/register'
        : canAccessAdminPanel
            ? '/admin'
            : canRegisterBusiness
                ? '/register-business'
                : '/businesses';

    const registerBusinessLabel = !isAuthenticated
        ? 'Crear cuenta'
        : canAccessAdminPanel
            ? 'Panel admin'
            : canRegisterBusiness
                ? 'Registrar negocio'
                : 'Explorar negocios';

    return (
        <footer className="mt-16 border-t border-primary-100 bg-primary-900 text-slate-200">
            <div className="flag-ribbon" aria-hidden="true"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
                <h2 className="sr-only">Navegacion del pie de pagina</h2>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                        <Link to="/" className="inline-flex items-center gap-3">
                            <div className="relative h-11 w-11 overflow-hidden rounded-2xl border border-primary-300/60 bg-white">
                                <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-700"></div>
                                <div className="absolute inset-y-0 right-0 w-1/2 bg-accent-600"></div>
                                <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-white">A</span>
                            </div>
                            <div>
                                <p className="font-display text-2xl font-bold text-white">
                                    Aqui<span className="text-accent-400">Ta</span>.do
                                </p>
                                <p className="text-xs uppercase tracking-wide text-primary-200">
                                    SuperApp local para República Dominicana
                                </p>
                            </div>
                        </Link>
                        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
                            Descubre negocios confiables, reserva servicios y conecta por WhatsApp
                            en una sola plataforma pensada para el mercado dominicano.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="chip !bg-white/10 !text-blue-100 !border-white/20">Discovery</span>
                            <span className="chip !bg-white/10 !text-blue-100 !border-white/20">SaaS</span>
                            <span className="chip !bg-white/10 !text-blue-100 !border-white/20">Marketplace</span>
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <h3 className="font-display text-base font-semibold text-white">Explorar</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li><Link to="/businesses" className="hover:text-white transition-colors">Negocios</Link></li>
                            <li><Link to="/about" className="hover:text-white transition-colors">Sobre el proyecto</Link></li>
                            <li><Link to="/negocios/intencion/con-delivery" className="hover:text-white transition-colors">Con delivery</Link></li>
                            <li><Link to="/negocios/intencion/pet-friendly" className="hover:text-white transition-colors">Pet friendly</Link></li>
                            <li><Link to="/negocios/intencion/con-reservas" className="hover:text-white transition-colors">Con reservas</Link></li>
                        </ul>
                    </div>

                    <div className="lg:col-span-2">
                        <h3 className="font-display text-base font-semibold text-white">Negocios</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li><Link to={registerBusinessPath} className="hover:text-white transition-colors">{registerBusinessLabel}</Link></li>
                            {isAuthenticated && canAccessBusinessPanel && (
                                <li><Link to="/dashboard" className="hover:text-white transition-colors">Panel negocio</Link></li>
                            )}
                            {isAuthenticated && canAccessAdminPanel && (
                                <>
                                    <li><Link to="/admin" className="hover:text-white transition-colors">Panel admin</Link></li>
                                    <li><Link to="/security" className="hover:text-white transition-colors">Seguridad</Link></li>
                                </>
                            )}
                        </ul>
                    </div>

                    <div className="lg:col-span-3">
                        <h3 className="font-display text-base font-semibold text-white">Contacto</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li>info@aquita.do</li>
                            <li>+1 (809) 555-0000</li>
                            <li>Santo Domingo, RD</li>
                        </ul>
                        <p className="mt-4 text-xs leading-relaxed text-slate-400">
                            Disponible para expansion regional en Latinoamerica.
                        </p>
                    </div>
                </div>

                <div className="mt-10 flex flex-col gap-3 border-t border-primary-800/70 pt-6 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <p>(c) {new Date().getFullYear()} AquiTa.do. Todos los derechos reservados.</p>
                    <div className="flex items-center gap-4">
                        <Link to="/terms" className="hover:text-white transition-colors">Terminos</Link>
                        <Link to="/privacy" className="hover:text-white transition-colors">Privacidad</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
