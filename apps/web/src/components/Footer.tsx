import { Link } from 'react-router-dom';

type FooterProps = {
    compact?: boolean;
};

export function Footer({ compact = false }: FooterProps) {
    if (compact) {
        return (
            <footer className="footer-shell-compact border-t border-primary-100/60 text-slate-200">
                <div className="flag-ribbon" aria-hidden="true"></div>
                <div className="max-w-7xl mx-auto px-4 py-5 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <Link to="/" className="inline-flex items-center gap-3">
                            <div className="relative h-10 w-10 overflow-hidden rounded-2xl border border-primary-300/50 bg-white">
                                <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-700"></div>
                                <div className="absolute inset-y-0 right-0 w-1/2 bg-accent-600"></div>
                                <span className="absolute inset-0 flex items-center justify-center font-display text-base font-bold text-white">A</span>
                            </div>
                            <div>
                                <p className="font-display text-xl font-bold text-white">
                                    Aqui<span className="text-accent-400">Ta</span>.do
                                </p>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-primary-200">
                                    Discovery local en RD
                                </p>
                            </div>
                        </Link>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
                            <Link to="/businesses" className="transition-colors hover:text-white">Negocios</Link>
                            <Link to="/about" className="transition-colors hover:text-white">Nosotros</Link>
                            <Link to="/terms" className="transition-colors hover:text-white">Términos</Link>
                            <Link to="/privacy" className="transition-colors hover:text-white">Privacidad</Link>
                        </div>

                        <p className="text-xs text-slate-400">
                            (c) {new Date().getFullYear()} AquiTa.do
                        </p>
                    </div>
                </div>
            </footer>
        );
    }

    return (
        <footer className="footer-shell mt-4 border-t border-primary-100/60 text-slate-200 sm:mt-6">
            <div className="flag-ribbon" aria-hidden="true"></div>
            <div className="max-w-7xl mx-auto px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
                <h2 className="sr-only">Navegación del pie de página</h2>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    <div className="footer-panel lg:col-span-5">
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
                                    Discovery local para República Dominicana
                                </p>
                            </div>
                        </Link>
                        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
                            Descubre negocios confiables con mejor contexto por zona,
                            categoría y señales de confianza en una plataforma pensada para el mercado dominicano.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <span className="chip !border-white/20 !bg-white/10 !text-blue-100">Discovery</span>
                            <span className="chip !border-white/20 !bg-white/10 !text-blue-100">Geografía RD</span>
                            <span className="chip !border-white/20 !bg-white/10 !text-blue-100">Confianza</span>
                        </div>
                    </div>

                    <div className="footer-panel lg:col-span-2">
                        <h3 className="font-display text-base font-semibold text-white">Explorar</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li><Link to="/businesses" className="transition-colors hover:text-white">Negocios</Link></li>
                            <li><Link to="/about" className="transition-colors hover:text-white">Sobre el proyecto</Link></li>
                            <li><Link to="/negocios/intencion/con-delivery" className="transition-colors hover:text-white">Con delivery</Link></li>
                            <li><Link to="/negocios/intencion/pet-friendly" className="transition-colors hover:text-white">Pet friendly</Link></li>
                            <li><Link to="/negocios/intencion/con-reservas" className="transition-colors hover:text-white">Con reservas</Link></li>
                        </ul>
                    </div>

                    <div className="footer-panel lg:col-span-2">
                        <h3 className="font-display text-base font-semibold text-white">Plataforma</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li><Link to="/register" className="transition-colors hover:text-white">Crear cuenta</Link></li>
                            <li><Link to="/login" className="transition-colors hover:text-white">Iniciar sesión</Link></li>
                            <li><Link to="/register-business" className="transition-colors hover:text-white">Registrar negocio</Link></li>
                            <li><Link to="/terms" className="transition-colors hover:text-white">Términos</Link></li>
                            <li><Link to="/privacy" className="transition-colors hover:text-white">Privacidad</Link></li>
                        </ul>
                    </div>

                    <div className="footer-panel lg:col-span-3">
                        <h3 className="font-display text-base font-semibold text-white">Contacto</h3>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            <li>info@aquita.do</li>
                            <li>+1 (809) 555-0000</li>
                            <li>Santo Domingo, RD</li>
                        </ul>
                        <p className="mt-4 text-xs leading-relaxed text-slate-400">
                            Enfocado hoy en República Dominicana.
                        </p>
                    </div>
                </div>

                <div className="mt-8 flex flex-col gap-3 border-t border-primary-800/70 pt-5 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <p>(c) {new Date().getFullYear()} AquiTa.do. Todos los derechos reservados.</p>
                    <div className="flex items-center gap-4">
                        <Link to="/terms" className="transition-colors hover:text-white">Términos</Link>
                        <Link to="/privacy" className="transition-colors hover:text-white">Privacidad</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
