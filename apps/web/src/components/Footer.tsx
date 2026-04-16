import { Link } from 'react-router-dom';

type FooterProps = {
    compact?: boolean;
};

export function Footer({ compact = false }: FooterProps) {
    if (compact) {
        return (
            <footer className="mt-6 border-t border-slate-200 bg-white/90">
                <div className="container-xl flex flex-col gap-3 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="font-display text-lg font-bold text-slate-900">AquiTa.do</span>
                        <span className="text-xs uppercase tracking-[0.16em] text-slate-400">Discovery local en RD</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <Link to="/businesses" className="transition-colors hover:text-slate-900">Negocios</Link>
                        <Link to="/terms" className="transition-colors hover:text-slate-900">Términos</Link>
                        <Link to="/privacy" className="transition-colors hover:text-slate-900">Privacidad</Link>
                    </div>
                </div>
            </footer>
        );
    }

    return (
        <footer className="mt-20 border-t border-slate-200/60 bg-gradient-to-b from-white/80 to-slate-50/50 backdrop-blur-md">
            <div className="container-xl py-16">
                <div className="grid gap-12 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
                    <div className="space-y-6">
                        <div>
                            <p className="font-display text-3xl font-black tracking-tight text-slate-900">
                                Aqui<span className="text-accent-600">Ta</span><span className="text-primary-700">.do</span>
                            </p>
                            <p className="mt-4 max-w-sm text-base leading-relaxed text-slate-500">
                                La plataforma líder en discovery local y gestión de negocios diseñada exclusivamente para el mercado dominicano.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="px-3 py-1 rounded-full bg-primary-50 text-primary-700 text-[10px] font-bold uppercase tracking-wider border border-primary-100/50">Discovery</span>
                            <span className="px-3 py-1 rounded-full bg-accent-50 text-accent-700 text-[10px] font-bold uppercase tracking-wider border border-accent-100/50">SaaS</span>
                            <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase tracking-wider border border-slate-200/50">RD</span>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-semibold text-slate-900">Explorar</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <Link to="/businesses" className="block transition-colors hover:text-slate-900">Negocios</Link>
                            <Link to="/negocios/intencion/con-delivery" className="block transition-colors hover:text-slate-900">Con delivery</Link>
                            <Link to="/negocios/intencion/con-reservas" className="block transition-colors hover:text-slate-900">Con reservas</Link>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-semibold text-slate-900">Plataforma</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <Link to="/register" className="block transition-colors hover:text-slate-900">Crear cuenta</Link>
                            <Link to="/login" className="block transition-colors hover:text-slate-900">Iniciar sesión</Link>
                            <Link to="/register-business" className="block transition-colors hover:text-slate-900">Registrar negocio</Link>
                        </div>
                    </div>

                    <div>
                        <p className="text-sm font-semibold text-slate-900">Legal</p>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <Link to="/about" className="block transition-colors hover:text-slate-900">Sobre AquiTa.do</Link>
                            <Link to="/terms" className="block transition-colors hover:text-slate-900">Términos</Link>
                            <Link to="/privacy" className="block transition-colors hover:text-slate-900">Privacidad</Link>
                        </div>
                    </div>
                </div>

                <div className="mt-16 flex flex-col gap-4 border-t border-slate-200/60 pt-8 text-sm font-medium text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <p>© {new Date().getFullYear()} AquiTa.do</p>
                        <span className="h-1 w-1 rounded-full bg-slate-300"></span>
                        <p>Hecho con <span className="text-accent-500">❤️</span> en RD</p>
                    </div>
                    <p className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Santo Domingo, República Dominicana
                    </p>
                </div>
            </div>
        </footer>
    );
}
