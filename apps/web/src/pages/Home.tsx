import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { categoryApi, businessApi, locationApi } from '../api/endpoints';

interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    _count?: { businesses: number };
}

interface Business {
    id: string;
    name: string;
    slug: string;
    description: string;
    address: string;
    province?: { name: string };
    images: { url: string }[];
    _count?: { reviews: number };
}

interface Province {
    id: string;
    name: string;
    slug: string;
    _count?: { businesses: number };
}

export function Home() {
    const [searchQuery, setSearchQuery] = useState('');
    const [categories, setCategories] = useState<Category[]>([]);
    const [recentBusinesses, setRecentBusinesses] = useState<Business[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [loadError, setLoadError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoadError('');
        try {
            const [catRes, bizRes, provRes] = await Promise.all([
                categoryApi.getAll(),
                businessApi.getAll({ limit: 6 }),
                locationApi.getProvinces(),
            ]);
            setCategories(catRes.data);
            setRecentBusinesses(bizRes.data.data || []);
            setProvinces(provRes.data);
        } catch (error) {
            setLoadError(getApiErrorMessage(error, 'No se pudo cargar la informacion inicial'));
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            navigate(`/businesses?search=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <div className="animate-fade-in">
            {loadError && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {loadError}
                    </div>
                </div>
            )}

            {/* Hero Section */}
            <section className="gradient-hero relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 relative z-10">
                    <div className="text-center max-w-3xl mx-auto">
                        <h1 className="font-display text-4xl md:text-6xl font-extrabold text-white mb-6 leading-tight">
                            Descubre lo mejor de{' '}
                            <span className="text-accent-400">República Dominicana</span>
                        </h1>
                        <p className="text-lg md:text-xl text-blue-100 mb-10 leading-relaxed">
                            Encuentra negocios locales, restaurantes, tiendas y servicios cerca de ti.
                            El directorio más completo del país.
                        </p>

                        {/* Search Bar */}
                        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
                            <div className="flex bg-white rounded-2xl shadow-2xl shadow-black/20 overflow-hidden">
                                <div className="flex-1 flex items-center px-5">
                                    <svg className="w-5 h-5 text-gray-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Buscar negocios, restaurantes, servicios..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full py-4 outline-none text-gray-700 placeholder-gray-400"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="bg-accent-500 hover:bg-accent-600 text-white font-semibold px-8 py-4 transition-colors"
                                >
                                    Buscar
                                </button>
                            </div>
                        </form>

                        {/* Quick Stats */}
                        <div className="flex justify-center gap-8 mt-10">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">1,000+</div>
                                <div className="text-sm text-blue-200">Negocios</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">32</div>
                                <div className="text-sm text-blue-200">Provincias</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">15</div>
                                <div className="text-sm text-blue-200">Categorías</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Categories */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="text-center mb-10">
                    <h2 className="font-display text-3xl font-bold text-gray-900 mb-3">
                        Explora por Categoría
                    </h2>
                    <p className="text-gray-500">Encuentra exactamente lo que necesitas</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {categories.slice(0, 15).map((cat) => (
                        <Link
                            key={cat.id}
                            to={`/businesses?categoryId=${cat.id}`}
                            className="card p-5 text-center group cursor-pointer"
                        >
                            <div className="text-3xl mb-2">{cat.icon || '📁'}</div>
                            <h3 className="font-semibold text-gray-800 text-sm group-hover:text-primary-600 transition-colors">
                                {cat.name}
                            </h3>
                            {cat._count && (
                                <span className="text-xs text-gray-400 mt-1">{cat._count.businesses} negocios</span>
                            )}
                        </Link>
                    ))}
                </div>
            </section>

            {/* Provinces */}
            <section className="bg-gray-50 py-16">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-10">
                        <h2 className="font-display text-3xl font-bold text-gray-900 mb-3">
                            Busca por Provincia
                        </h2>
                        <p className="text-gray-500">Negocios en toda la República Dominicana</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3">
                        {provinces.slice(0, 16).map((prov) => (
                            <Link
                                key={prov.id}
                                to={`/businesses?provinceId=${prov.id}`}
                                className="px-4 py-2 bg-white rounded-full text-sm font-medium text-gray-600 border border-gray-200 hover:border-primary-500 hover:text-primary-600 hover:shadow-md transition-all"
                            >
                                📍 {prov.name}
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* Recent Businesses */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h2 className="font-display text-3xl font-bold text-gray-900 mb-2">
                            Negocios Recientes
                        </h2>
                        <p className="text-gray-500">Los últimos en unirse a AquiTa.do</p>
                    </div>
                    <Link to="/businesses" className="btn-secondary text-sm">
                        Ver todos →
                    </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recentBusinesses.map((biz) => (
                        <Link key={biz.id} to={`/businesses/${biz.id}`} className="card group">
                            <div className="h-48 bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center">
                                {biz.images?.[0] ? (
                                    <img src={biz.images[0].url} alt={biz.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-5xl">🏪</span>
                                )}
                            </div>
                            <div className="p-5">
                                <h3 className="font-display font-semibold text-lg text-gray-900 group-hover:text-primary-600 transition-colors mb-1">
                                    {biz.name}
                                </h3>
                                <p className="text-sm text-gray-500 mb-2 flex items-center gap-1">
                                    📍 {biz.province?.name || biz.address}
                                </p>
                                <p className="text-sm text-gray-600 line-clamp-2">
                                    {biz.description}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
                {recentBusinesses.length === 0 && (
                    <div className="text-center py-16 text-gray-400">
                        <p className="text-5xl mb-4">🏗️</p>
                        <p className="text-lg">Aún no hay negocios registrados. ¡Sé el primero!</p>
                        <Link to="/register-business" className="btn-primary mt-4 inline-block">
                            Registrar mi Negocio
                        </Link>
                    </div>
                )}
            </section>

            {/* CTA Section */}
            <section className="gradient-hero py-16">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h2 className="font-display text-3xl md:text-4xl font-extrabold text-white mb-4">
                        ¿Tienes un negocio en RD?
                    </h2>
                    <p className="text-blue-100 text-lg mb-8">
                        Regístrate gratis y llega a miles de clientes potenciales
                    </p>
                    <Link to="/register-business" className="btn-accent text-lg px-10 py-3.5">
                        Registrar mi Negocio Gratis
                    </Link>
                </div>
            </section>
        </div>
    );
}
