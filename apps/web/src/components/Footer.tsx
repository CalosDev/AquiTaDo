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
        <footer className="mt-10 border-t border-slate-200 bg-white/92">
            <div className="container-xl py-10">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
                    <div className="space-y-4">
                        <div>
                            <p className="font-display text-2xl font-bold text-slate-900">
                                Aqui<span className="text-accent-600">Ta</span>.do
                            </p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                                Discovery local, operación SaaS y administración de plataforma con una misma base de producto para República Dominicana.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="chip">Discovery</span>
                            <span className="chip">SaaS</span>
                            <span className="chip">RD</span>
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

                <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <p>© {new Date().getFullYear()} AquiTa.do. Todos los derechos reservados.</p>
                    <p>Santo Domingo, República Dominicana.</p>
                </div>
            </div>
        </footer>
    );
}
