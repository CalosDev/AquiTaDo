import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getRoleCapabilities } from '../auth/capabilities';

export function Footer() {
    const { isAuthenticated, user } = useAuth();
    const roleCapabilities = getRoleCapabilities(user?.role);
    const canRegisterBusiness = roleCapabilities.canRegisterBusiness;
    const registerBusinessPath = !isAuthenticated
        ? '/register'
        : roleCapabilities.canAccessAdminPanel
            ? '/admin'
        : canRegisterBusiness
            ? '/register-business'
            : '/businesses';
    const registerBusinessLabel = !isAuthenticated
        ? 'Crear Cuenta'
        : roleCapabilities.canAccessAdminPanel
            ? 'Panel Admin'
        : canRegisterBusiness
            ? 'Registrar Negocio'
            : 'Explorar Negocios';

    return (
        <footer className="bg-primary-900 text-slate-200 border-t border-primary-800">
            <div className="flag-ribbon" aria-hidden="true"></div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="col-span-1 md:col-span-2">
                        <Link to="/" className="flex items-center gap-2 mb-4 hover-lift">
                            <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-lg">
                                A
                            </div>
                            <span className="font-display font-bold text-xl text-white">
                                Aqui<span className="text-accent-400">Ta</span>.do
                            </span>
                        </Link>
                        <p className="text-slate-300 text-sm leading-relaxed max-w-md">
                            El directorio inteligente de negocios locales en Republica Dominicana.
                            Descubre restaurantes, tiendas, hoteles y mas cerca de ti.
                        </p>
                        <div className="flex gap-2 mt-4">
                            <span className="inline-block w-8 h-5 rounded-sm" style={{ background: '#CE1126' }}></span>
                            <span className="inline-block w-8 h-5 rounded-sm" style={{ background: '#002D62' }}></span>
                            <span className="inline-block w-8 h-5 rounded-sm border border-gray-600" style={{ background: '#FFFFFF' }}></span>
                        </div>
                    </div>

                    {/* Links */}
                    <div>
                        <h4 className="font-display font-semibold text-white mb-4">Explora</h4>
                        <ul className="space-y-2 text-sm text-slate-300">
                            <li><Link to="/businesses" className="hover:text-accent-300 transition-colors">Negocios</Link></li>
                            <li><Link to={registerBusinessPath} className="hover:text-accent-300 transition-colors">{registerBusinessLabel}</Link></li>
                            <li><Link to="/register" className="hover:text-accent-300 transition-colors">Crear Cuenta</Link></li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="font-display font-semibold text-white mb-4">Contacto</h4>
                        <ul className="space-y-2 text-sm text-slate-300">
                            <li>Email: info@aquita.do</li>
                            <li>Telefono: +1 (809) 555-0000</li>
                            <li>Ubicacion: Santo Domingo, RD</li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-primary-800/80 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-slate-400">
                        (c) {new Date().getFullYear()} AquiTa.do - Hecho en Republica Dominicana
                    </p>
                    <div className="flex gap-4 text-sm text-slate-400">
                        <Link to="/terms" className="hover:text-white transition-colors">Terminos</Link>
                        <Link to="/privacy" className="hover:text-white transition-colors">Privacidad</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
