import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { adsApi, businessApi, categoryApi, locationApi } from '../api/endpoints';

interface Business {
    id: string;
    name: string;
    slug: string;
    description: string;
    address: string;
    province?: { name: string };
    images: { url: string }[];
    categories?: { category: { name: string; icon?: string } }[];
    _count?: { reviews: number };
}

interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
}

interface Province {
    id: string;
    name: string;
    slug: string;
}

interface SponsoredPlacement {
    placementRank: number;
    campaign: {
        id: string;
        name: string;
        bidAmount: number;
        ctr: number;
    };
    business: {
        id: string;
        name: string;
        slug: string;
        province?: { name: string };
        city?: { name: string };
        categories?: { name: string; icon?: string }[];
    };
}

function resolveVisitorId(): string {
    const existingVisitorId = localStorage.getItem('analyticsVisitorId');
    if (existingVisitorId) {
        return existingVisitorId;
    }

    const generatedVisitorId = window.crypto?.randomUUID?.() ?? `visitor-${Date.now()}`;
    localStorage.setItem('analyticsVisitorId', generatedVisitorId);
    return generatedVisitorId;
}

export function BusinessesList() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [sponsoredPlacements, setSponsoredPlacements] = useState<SponsoredPlacement[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const currentSearch = searchParams.get('search') || '';
    const currentCategory = searchParams.get('categoryId') || '';
    const currentProvince = searchParams.get('provinceId') || '';
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const [searchInput, setSearchInput] = useState(currentSearch);

    useEffect(() => {
        setSearchInput(currentSearch);
    }, [currentSearch]);

    const loadFilters = useCallback(async () => {
        try {
            const [catRes, provRes] = await Promise.all([
                categoryApi.getAll(),
                locationApi.getProvinces(),
            ]);
            setCategories(catRes.data);
            setProvinces(provRes.data);
        } catch (error) {
            setLoadError(getApiErrorMessage(error, 'No se pudieron cargar los filtros'));
        }
    }, []);

    useEffect(() => {
        void loadFilters();
    }, [loadFilters]);

    const loadBusinesses = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const params: Record<string, string | number> = { page: currentPage, limit: 12 };
            if (currentSearch) params.search = currentSearch;
            if (currentCategory) params.categoryId = currentCategory;
            if (currentProvince) params.provinceId = currentProvince;

            const [businessesRes, sponsoredRes] = await Promise.all([
                businessApi.getAll(params),
                adsApi.getPlacements({
                    provinceId: currentProvince || undefined,
                    categoryId: currentCategory || undefined,
                    limit: 3,
                }),
            ]);

            setBusinesses(businessesRes.data.data || []);
            setTotal(businessesRes.data.total || 0);
            setTotalPages(businessesRes.data.totalPages || 0);
            setSponsoredPlacements((sponsoredRes.data || []) as SponsoredPlacement[]);
        } catch (error) {
            setLoadError(getApiErrorMessage(error, 'No se pudieron cargar los negocios'));
        } finally {
            setLoading(false);
        }
    }, [currentCategory, currentPage, currentProvince, currentSearch]);

    useEffect(() => {
        void loadBusinesses();
    }, [loadBusinesses]);

    useEffect(() => {
        if (sponsoredPlacements.length === 0) {
            return;
        }

        const visitorId = resolveVisitorId();
        sponsoredPlacements.forEach((placement) => {
            void adsApi.trackImpression(placement.campaign.id, {
                visitorId,
                placementKey: 'businesses-list',
            }).catch(() => undefined);
        });
    }, [sponsoredPlacements]);

    const updateFilter = useCallback((
        key: string,
        value: string,
        options: { resetPage?: boolean } = {},
    ) => {
        setSearchParams((prev) => {
            const params = new URLSearchParams(prev);
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }

            if (options.resetPage ?? true) {
                params.set('page', '1');
            }

            return params;
        });
    }, [setSearchParams]);

    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            if (searchInput !== currentSearch) {
                updateFilter('search', searchInput, { resetPage: true });
            }
        }, 350);

        return () => window.clearTimeout(debounceTimer);
    }, [searchInput, currentSearch, updateFilter]);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {loadError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {loadError}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Filters Sidebar */}
                <aside className="lg:w-72 shrink-0">
                    <div className="card p-6 sticky top-20">
                        <h3 className="font-display font-bold text-lg mb-4">Filtros</h3>

                        {/* Search */}
                        <div className="mb-5">
                            <label className="text-sm font-medium text-gray-600 mb-1.5 block">Buscar</label>
                            <input
                                type="text"
                                placeholder="Nombre o descripción..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="input-field text-sm"
                            />
                        </div>

                        {/* Category */}
                        <div className="mb-5">
                            <label className="text-sm font-medium text-gray-600 mb-1.5 block">Categoría</label>
                            <select
                                value={currentCategory}
                                onChange={(e) => updateFilter('categoryId', e.target.value)}
                                className="input-field text-sm"
                            >
                                <option value="">Todas las categorías</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.icon} {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Province */}
                        <div className="mb-5">
                            <label className="text-sm font-medium text-gray-600 mb-1.5 block">Provincia</label>
                            <select
                                value={currentProvince}
                                onChange={(e) => updateFilter('provinceId', e.target.value)}
                                className="input-field text-sm"
                            >
                                <option value="">Todas las provincias</option>
                                {provinces.map((prov) => (
                                    <option key={prov.id} value={prov.id}>
                                        {prov.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => {
                                setSearchInput('');
                                setSearchParams({});
                            }}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                </aside>

                {/* Results */}
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h1 className="font-display text-2xl font-bold text-gray-900">Negocios</h1>
                            <p className="text-sm text-gray-500">{total} resultados encontrados</p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                        </div>
                    ) : businesses.length > 0 ? (
                        <>
                            {sponsoredPlacements.length > 0 && (
                                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {sponsoredPlacements.map((placement) => (
                                        <Link
                                            key={placement.campaign.id}
                                            to={`/businesses/${placement.business.id}`}
                                            onClick={() => {
                                                void adsApi.trackClick(placement.campaign.id, {
                                                    visitorId: resolveVisitorId(),
                                                    placementKey: 'businesses-list',
                                                }).catch(() => undefined);
                                            }}
                                            className="rounded-xl border border-amber-200 bg-amber-50 p-3 hover:border-amber-300 transition-colors"
                                        >
                                            <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 mb-1">
                                                Patrocinado #{placement.placementRank}
                                            </p>
                                            <p className="text-sm font-semibold text-gray-900">
                                                {placement.business.name}
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                Campaña: {placement.campaign.name}
                                            </p>
                                            <p className="text-xs text-gray-600">
                                                CPC {placement.campaign.bidAmount} · CTR {placement.campaign.ctr}%
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                                {businesses.map((biz) => (
                                    <Link key={biz.id} to={`/businesses/${biz.id}`} className="card group">
                                        <div className="h-40 bg-gradient-to-br from-primary-50 to-accent-50 flex items-center justify-center">
                                            {biz.images?.[0] ? (
                                                <img src={biz.images[0].url} alt={biz.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-4xl">🏪</span>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <div className="flex gap-1.5 mb-2">
                                                {biz.categories?.slice(0, 2).map((bc, i) => (
                                                    <span key={i} className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                                                        {bc.category.icon} {bc.category.name}
                                                    </span>
                                                ))}
                                            </div>
                                            <h3 className="font-display font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                                                {biz.name}
                                            </h3>
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                📍 {biz.province?.name || biz.address}
                                            </p>
                                            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{biz.description}</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2 mt-8">
                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                        <button
                                            key={page}
                                            onClick={() =>
                                                updateFilter('page', String(page), { resetPage: false })
                                            }
                                            className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${page === currentPage
                                                    ? 'bg-primary-600 text-white shadow-lg'
                                                    : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-500'
                                                }`}
                                        >
                                            {page}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-20 text-gray-400">
                            <p className="text-5xl mb-4">🔍</p>
                            <p className="text-lg">No se encontraron negocios con estos filtros</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
