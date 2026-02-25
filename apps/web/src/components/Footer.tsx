import { Link } from 'react-router-dom';

export function Footer() {
    return (
        <footer className="bg-gray-900 text-gray-300">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="col-span-1 md:col-span-2">
                        <Link to="/" className="flex items-center gap-2 mb-4">
                            <div className="w-9 h-9 rounded-xl gradient-hero flex items-center justify-center text-white font-bold text-lg">
                                A
                            </div>
                            <span className="font-display font-bold text-xl text-white">
                                Aqui<span className="text-accent-400">Ta</span>.do
                            </span>
                        </Link>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-md">
                            El directorio inteligente de negocios locales en República Dominicana.
                            Descubre restaurantes, tiendas, hoteles y más cerca de ti.
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
                        <ul className="space-y-2 text-sm">
                            <li><Link to="/businesses" className="hover:text-accent-400 transition-colors">Negocios</Link></li>
                            <li><Link to="/register-business" className="hover:text-accent-400 transition-colors">Registrar Negocio</Link></li>
                            <li><Link to="/register" className="hover:text-accent-400 transition-colors">Crear Cuenta</Link></li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="font-display font-semibold text-white mb-4">Contacto</h4>
                        <ul className="space-y-2 text-sm">
                            <li>📧 info@aquita.do</li>
                            <li>📱 +1 (809) 555-0000</li>
                            <li>📍 Santo Domingo, RD</li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-gray-500">
                        © {new Date().getFullYear()} AquiTa.do — Hecho con ❤️ en República Dominicana
                    </p>
                    <div className="flex gap-4 text-sm text-gray-500">
                        <a href="#" className="hover:text-white transition-colors">Términos</a>
                        <a href="#" className="hover:text-white transition-colors">Privacidad</a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
