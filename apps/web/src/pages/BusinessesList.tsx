import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/error';
import { adsApi, analyticsApi, businessApi, categoryApi, favoritesApi, locationApi } from '../api/endpoints';
import { BusinessesMap } from '../components/BusinessesMap';
import { OptimizedImage } from '../components/OptimizedImage';
import { useAuth } from '../context/useAuth';
import { getOrCreateSessionId, getOrCreateVisitorId } from '../lib/clientContext';
import { businessPriceRangeLabel } from '../lib/businessProfile';
import { applySeoMeta, removeJsonLd, upsertJsonLd } from '../seo/meta';
import { calculateBusinessTrustScore } from '../lib/trust';
import { preloadRouteChunk } from '../routes/preload';
import { featureFlags } from '../config/features';

interface Business {
    id: string;
    name: string;
    slug: string;
    description: string;
    address: string;
    verified: boolean;
    openNow?: boolean | null;
    todayHoursLabel?: string | null;
    profileCompletenessScore?: number;
    latitude?: number | null;
    longitude?: number | null;
    priceRange?: string | null;
    reputationScore?: number | string | null;
    relevanceScore?: number | null;
    distanceKm?: number | null;
    province?: { name: string };
    city?: { name: string } | null;
    sector?: { id: string; name: string } | null;
    images: { url: string }[];
    categories?: { category: { name: string; icon?: string; parent?: { name: string } | null } }[];
    _count?: { reviews: number };
}

interface Category {
    id: string;
    name: string;
    slug: string;
    icon?: string;
    parentId?: string | null;
    parent?: { id: string; name: string } | null;
    children?: Array<{ id: string }>;
}

interface Province {
    id: string;
    name: string;
    slug: string;
}

interface City {
    id: string;
    name: string;
}

interface Sector {
    id: string;
    name: string;
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

function getDisplayInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'N';
}

const INTENT_FEATURE_MAP: Record<string, { label: string; feature: string; description: string }> = {
    'con-delivery': {
        label: 'Negocios con delivery',
        feature: 'delivery',
        description: 'Encuentra negocios que ofrecen delivery en República Dominicana.',
    },
    'pet-friendly': {
        label: 'Negocios pet friendly',
        feature: 'pet friendly',
        description: 'Descubre negocios pet friendly para salir con tus mascotas.',
    },
    'con-parqueo': {
        label: 'Negocios con parqueo',
        feature: 'estacionamiento',
        description: 'Explora negocios con opciones de parqueo para clientes.',
    },
    'con-reservas': {
        label: 'Negocios con reservaciones',
        feature: 'reservaciones',
        description: 'Compara negocios que aceptan reservaciones en línea o por WhatsApp.',
    },
    accesibles: {
        label: 'Negocios accesibles',
        feature: 'accesible',
        description: 'Listado de negocios con facilidades de accesibilidad.',
    },
};

function buildPagination(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const pages: Array<number | 'ellipsis'> = [1];
    const windowStart = Math.max(currentPage - 1, 2);
    const windowEnd = Math.min(currentPage + 1, totalPages - 1);

    if (windowStart > 2) {
        pages.push('ellipsis');
    }

    for (let page = windowStart; page <= windowEnd; page += 1) {
        pages.push(page);
    }

    if (windowEnd < totalPages - 1) {
        pages.push('ellipsis');
    }

    pages.push(totalPages);
    return pages;
}

export function BusinessesList() {
    const { isAuthenticated, user } = useAuth();
    const { categorySlug, provinceSlug, intentSlug } = useParams<{
        categorySlug?: string;
        provinceSlug?: string;
        intentSlug?: string;
    }>();
    const navigate = useNavigate();
    const isCustomerRole = user?.role === 'USER';
    const [searchParams, setSearchParams] = useSearchParams();
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [cities, setCities] = useState<City[]>([]);
    const [sectors, setSectors] = useState<Sector[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [sponsoredPlacements, setSponsoredPlacements] = useState<SponsoredPlacement[]>([]);
    const [favoriteBusinessIds, setFavoriteBusinessIds] = useState<Set<string>>(new Set());
    const [favoriteProcessingId, setFavoriteProcessingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const showSponsoredAds = featureFlags.sponsoredAds;

    const currentSearch = searchParams.get('search') || '';
    const currentCategory = searchParams.get('categoryId') || '';
    const currentProvince = searchParams.get('provinceId') || '';
    const currentCity = searchParams.get('cityId') || '';
    const currentSector = searchParams.get('sectorId') || '';
    const currentFeature = searchParams.get('feature') || '';
    const currentOpenNow = searchParams.get('openNow') === 'true';
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const [searchInput, setSearchInput] = useState(currentSearch);
    const paginationItems = useMemo(
        () => buildPagination(currentPage, totalPages),
        [currentPage, totalPages],
    );
    const activeCategory = useMemo(
        () => categories.find((category) => category.slug === categorySlug || category.id === currentCategory) || null,
        [categories, categorySlug, currentCategory],
    );
    const activeProvince = useMemo(
        () => provinces.find((province) => province.slug === provinceSlug || province.id === currentProvince) || null,
        [provinces, provinceSlug, currentProvince],
    );
    const activeCity = useMemo(
        () => cities.find((city) => city.id === currentCity) || null,
        [cities, currentCity],
    );
    const activeSector = useMemo(
        () => sectors.find((sector) => sector.id === currentSector) || null,
        [sectors, currentSector],
    );
    const categoryOptions = useMemo(
        () => categories.filter((category) => !category.children || category.children.length === 0),
        [categories],
    );
    const activeIntent = useMemo(
        () => (intentSlug ? INTENT_FEATURE_MAP[intentSlug] || null : null),
        [intentSlug],
    );
    const listingHeading = useMemo(() => {
        if (activeIntent) {
            return activeIntent.label;
        }
        if (activeCity && activeCategory) {
            return `${activeCategory.name} en ${activeCity.name}`;
        }
        if (activeCity) {
            return `Negocios en ${activeCity.name}`;
        }
        if (activeCategory && activeProvince) {
            return `${activeCategory.name} en ${activeProvince.name}`;
        }
        if (activeCategory) {
            return activeCategory.name;
        }
        if (activeProvince) {
            return `Negocios en ${activeProvince.name}`;
        }
        return 'Negocios';
    }, [activeCategory, activeCity, activeIntent, activeProvince]);
    const activeFilterChips = useMemo(() => {
        const chips: string[] = [];
        if (currentSearch) chips.push(`Busqueda: ${currentSearch}`);
        if (activeCategory) chips.push(`Categoria: ${activeCategory.name}`);
        if (activeProvince) chips.push(`Provincia: ${activeProvince.name}`);
        if (activeCity) chips.push(`Ciudad: ${activeCity.name}`);
        if (activeSector) chips.push(`Sector: ${activeSector.name}`);
        if (currentFeature) chips.push(`Servicio: ${currentFeature}`);
        if (currentOpenNow) chips.push('Abiertos ahora');
        return chips;
    }, [activeCategory, activeCity, activeProvince, activeSector, currentFeature, currentOpenNow, currentSearch]);
    const resultsSummary = useMemo(() => {
        const segments = [`${total} resultado${total === 1 ? '' : 's'}`];
        if (activeSector) {
            segments.push(`en ${activeSector.name}`);
        } else if (activeCity) {
            segments.push(`en ${activeCity.name}`);
        } else if (activeProvince) {
            segments.push(`en ${activeProvince.name}`);
        }
        if (currentOpenNow) {
            segments.push('solo abiertos ahora');
        }
        return segments.join(' • ');
    }, [activeCity, activeProvince, activeSector, currentOpenNow, total]);
    const seoCanonicalPath = useMemo(() => {
        if (intentSlug) {
            return `/negocios/intencion/${intentSlug}`;
        }
        if (categorySlug && provinceSlug) {
            return `/negocios/${provinceSlug}/${categorySlug}`;
        }
        if (categorySlug) {
            return `/negocios/categoria/${categorySlug}`;
        }
        if (provinceSlug) {
            return `/negocios/provincia/${provinceSlug}`;
        }
        return '/businesses';
    }, [categorySlug, provinceSlug, intentSlug]);
    const trustByBusinessId = useMemo(() => {
        const lookup = new Map<string, ReturnType<typeof calculateBusinessTrustScore>>();
        businesses.forEach((business) => {
            lookup.set(
                business.id,
                calculateBusinessTrustScore({
                    verified: business.verified,
                    reputationScore: business.reputationScore,
                    reviewsCount: business._count?.reviews ?? 0,
                    hasDescription: Boolean(business.description?.trim()),
                    hasAddress: Boolean(business.address?.trim()),
                    hasImages: Boolean(business.images?.length),
                }),
            );
        });
        return lookup;
    }, [businesses]);

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

    useEffect(() => {
        if (!categorySlug && !provinceSlug) {
            return;
        }

        if (categorySlug && categories.length === 0) {
            return;
        }

        if (provinceSlug && provinces.length === 0) {
            return;
        }

        const nextCategoryId = categorySlug
            ? (categories.find((category) => category.slug === categorySlug)?.id || '')
            : '';
        const nextProvinceId = provinceSlug
            ? (provinces.find((province) => province.slug === provinceSlug)?.id || '')
            : '';

        setSearchParams((previous) => {
            const params = new URLSearchParams(previous);

            if (nextCategoryId) {
                params.set('categoryId', nextCategoryId);
            } else {
                params.delete('categoryId');
            }

            if (nextProvinceId) {
                params.set('provinceId', nextProvinceId);
            } else {
                params.delete('provinceId');
            }

            if (params.get('page') && params.get('page') !== '1') {
                params.set('page', '1');
            }

            return params.toString() === previous.toString() ? previous : params;
        }, { replace: true });
    }, [categorySlug, provinceSlug, categories, provinces, setSearchParams]);

    useEffect(() => {
        if (!intentSlug) {
            return;
        }

        const intentConfig = INTENT_FEATURE_MAP[intentSlug];
        if (!intentConfig) {
            return;
        }

        setSearchParams((previous) => {
            const params = new URLSearchParams(previous);
            params.set('feature', intentConfig.feature);
            if (params.get('page') && params.get('page') !== '1') {
                params.set('page', '1');
            }
            return params.toString() === previous.toString() ? previous : params;
        }, { replace: true });
    }, [intentSlug, setSearchParams]);

    const loadBusinesses = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const params: Record<string, string | number | boolean> = { page: currentPage, limit: 12 };
            if (currentSearch) params.search = currentSearch;
            if (currentCategory) {
                params.categoryId = currentCategory;
            } else if (categorySlug) {
                params.categorySlug = categorySlug;
            }
            if (currentProvince) {
                params.provinceId = currentProvince;
            } else if (provinceSlug) {
                params.provinceSlug = provinceSlug;
            }
            if (currentCity) params.cityId = currentCity;
            if (currentSector) params.sectorId = currentSector;
            if (currentFeature) params.feature = currentFeature;
            if (currentOpenNow) params.openNow = true;

            const businessesRes = await businessApi.getAll(params);
            const sponsoredRes = showSponsoredAds
                ? await adsApi.getPlacements({
                    provinceId: currentProvince || undefined,
                    categoryId: currentCategory || undefined,
                    limit: 3,
                })
                : null;

            setBusinesses(businessesRes.data.data || []);
            setTotal(businessesRes.data.total || 0);
            setTotalPages(businessesRes.data.totalPages || 0);
            setSponsoredPlacements(showSponsoredAds ? ((sponsoredRes?.data || []) as SponsoredPlacement[]) : []);
        } catch (error) {
            setLoadError(getApiErrorMessage(error, 'No se pudieron cargar los negocios'));
        } finally {
            setLoading(false);
        }
    }, [categorySlug, currentCategory, currentCity, currentFeature, currentOpenNow, currentPage, currentProvince, currentSearch, currentSector, provinceSlug, showSponsoredAds]);

    useEffect(() => {
        void loadBusinesses();
    }, [loadBusinesses]);

    useEffect(() => {
        if (!isAuthenticated || !isCustomerRole) {
            setFavoriteBusinessIds(new Set());
            return;
        }

        let active = true;
        void favoritesApi.getFavoriteBusinesses({ limit: 100 })
            .then((response) => {
                if (!active) {
                    return;
                }
                const ids = new Set<string>(
                    ((response.data?.data ?? []) as Array<{ businessId: string }>).map((item) => item.businessId),
                );
                setFavoriteBusinessIds(ids);
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [isAuthenticated, isCustomerRole]);

    useEffect(() => {
        if (!showSponsoredAds || sponsoredPlacements.length === 0) {
            return;
        }

        const visitorId = getOrCreateVisitorId();
        sponsoredPlacements.forEach((placement) => {
            void adsApi.trackImpression(placement.campaign.id, {
                visitorId,
                placementKey: 'businesses-list',
            }).catch(() => undefined);
        });
    }, [showSponsoredAds, sponsoredPlacements]);

    const trackBusinessClick = useCallback((businessId: string, source: string) => {
        void analyticsApi.trackGrowthEvent({
            eventType: 'SEARCH_RESULT_CLICK',
            businessId,
            categoryId: currentCategory || undefined,
            provinceId: currentProvince || undefined,
            cityId: currentCity || undefined,
            visitorId: getOrCreateVisitorId(),
            sessionId: getOrCreateSessionId(),
            searchQuery: currentSearch || undefined,
            metadata: {
                source,
                page: currentPage,
                feature: currentFeature || undefined,
                sectorId: currentSector || undefined,
                openNow: currentOpenNow,
            },
        }).catch(() => undefined);
    }, [currentCategory, currentCity, currentFeature, currentOpenNow, currentPage, currentProvince, currentSearch, currentSector]);

    const updateFilter = useCallback((
        key: string,
        value: string,
        options: { resetPage?: boolean } = {},
    ) => {
        const isSeoRoutePinnedFilter =
            (key === 'categoryId' && Boolean(categorySlug))
            || (key === 'provinceId' && Boolean(provinceSlug))
            || (key === 'feature' && Boolean(intentSlug));

        if (isSeoRoutePinnedFilter) {
            const params = new URLSearchParams(searchParams);
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }

            if (options.resetPage ?? true) {
                params.set('page', '1');
            }

            startTransition(() => {
                navigate({
                    pathname: '/businesses',
                    search: params.toString() ? `?${params.toString()}` : '',
                });
            });
            return;
        }

        startTransition(() => {
            setSearchParams((prev) => {
                const params = new URLSearchParams(prev);
                if (value) {
                    params.set(key, value);
                } else {
                    params.delete(key);
                }

                if (key === 'provinceId' && params.has('cityId')) {
                    params.delete('cityId');
                }

                if (options.resetPage ?? true) {
                    params.set('page', '1');
                }

                return params;
            });
        });
    }, [setSearchParams, categorySlug, provinceSlug, intentSlug, searchParams, navigate]);

    useEffect(() => {
        if (!currentProvince) {
            setCities([]);
            setSectors([]);
            if (currentCity) {
                updateFilter('cityId', '');
            }
            if (currentSector) {
                updateFilter('sectorId', '');
            }
            return;
        }

        let active = true;
        void locationApi.getCities(currentProvince)
            .then((response) => {
                if (!active) {
                    return;
                }

                const nextCities = (response.data || []) as City[];
                setCities(nextCities);

                if (currentCity && !nextCities.some((city) => city.id === currentCity)) {
                    updateFilter('cityId', '');
                }
            })
            .catch(() => {
                if (active) {
                    setCities([]);
                }
            });

        return () => {
            active = false;
        };
    }, [currentProvince, currentCity, currentSector, updateFilter]);

    useEffect(() => {
        if (!currentCity) {
            setSectors([]);
            if (currentSector) {
                updateFilter('sectorId', '');
            }
            return;
        }

        let active = true;
        void locationApi.getSectors(currentCity)
            .then((response) => {
                if (!active) {
                    return;
                }

                const nextSectors = (response.data || []) as Sector[];
                setSectors(nextSectors);

                if (currentSector && !nextSectors.some((sector) => sector.id === currentSector)) {
                    updateFilter('sectorId', '');
                }
            })
            .catch(() => {
                if (active) {
                    setSectors([]);
                }
            });

        return () => {
            active = false;
        };
    }, [currentCity, currentSector, updateFilter]);

    const handleToggleFavorite = async (event: React.MouseEvent<HTMLButtonElement>, businessId: string) => {
        event.preventDefault();
        event.stopPropagation();

        if (!isAuthenticated || !isCustomerRole) {
            return;
        }

        setFavoriteProcessingId(businessId);
        try {
            const response = await favoritesApi.toggleFavoriteBusiness({ businessId });
            const nextFavorite = Boolean(response.data?.favorite);

            setFavoriteBusinessIds((previous) => {
                const next = new Set(previous);
                if (nextFavorite) {
                    next.add(businessId);
                } else {
                    next.delete(businessId);
                }
                return next;
            });
        } catch {
            // Keep list flow stable even if favorites call fails.
        } finally {
            setFavoriteProcessingId(null);
        }
    };

    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            if (searchInput !== currentSearch) {
                updateFilter('search', searchInput, { resetPage: true });
            }
        }, 350);

        return () => window.clearTimeout(debounceTimer);
    }, [searchInput, currentSearch, updateFilter]);

    useEffect(() => {
        const headingBase = activeIntent
            ? activeIntent.label
            : activeCategory && activeProvince
            ? `${activeCategory.name} en ${activeProvince.name}`
            : activeCategory
                ? `${activeCategory.name} en República Dominicana`
                : activeProvince
                    ? `Negocios en ${activeProvince.name}`
                    : 'Directorio de negocios en República Dominicana';

        const descriptionBase = activeIntent
            ? `${activeIntent.description} Contacta por WhatsApp o teléfono desde AquiTa.do.`
            : activeCategory && activeProvince
            ? `Descubre ${activeCategory.name.toLowerCase()} en ${activeProvince.name}. Compara opciones locales, contacta por WhatsApp y reserva en AquiTa.do.`
            : activeCategory
                ? `Explora ${activeCategory.name.toLowerCase()} en República Dominicana. Filtra, compara y contacta negocios verificados en AquiTa.do.`
                : activeProvince
                    ? `Encuentra negocios locales en ${activeProvince.name}. Descubre perfiles verificados, reseñas y canales de contacto.`
                    : 'Explora negocios locales en República Dominicana. Filtra por categoría y provincia para encontrar opciones verificadas.';

        applySeoMeta({
            title: `${headingBase} | AquiTa.do`,
            description: descriptionBase,
            canonicalPath: seoCanonicalPath,
        });

        const origin = window.location.origin;
        const breadcrumbItems = [
            { name: 'Inicio', url: `${origin}/` },
            { name: 'Negocios', url: `${origin}/businesses` },
        ];

        if (activeProvince) {
            breadcrumbItems.push({
                name: activeProvince.name,
                url: `${origin}/negocios/provincia/${activeProvince.slug}`,
            });
        }

        if (activeIntent && intentSlug) {
            breadcrumbItems.push({
                name: activeIntent.label,
                url: `${origin}/negocios/intencion/${intentSlug}`,
            });
        } else if (activeCategory) {
            breadcrumbItems.push({
                name: activeCategory.name,
                url: activeProvince
                    ? `${origin}/negocios/${activeProvince.slug}/${activeCategory.slug}`
                    : `${origin}/negocios/categoria/${activeCategory.slug}`,
            });
        }

        upsertJsonLd('businesses-list-breadcrumb', {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbItems.map((item, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: item.name,
                item: item.url,
            })),
        });

        if (businesses.length > 0) {
            upsertJsonLd('businesses-list-itemlist', {
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: headingBase,
                itemListElement: businesses.slice(0, 12).map((business, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: business.name,
                    url: `${origin}/businesses/${business.slug || business.id}`,
                })),
            });
        } else {
            removeJsonLd('businesses-list-itemlist');
        }
    }, [activeCategory, activeIntent, activeProvince, businesses, intentSlug, seoCanonicalPath]);

    useEffect(() => {
        return () => {
            removeJsonLd('businesses-list-breadcrumb');
            removeJsonLd('businesses-list-itemlist');
        };
    }, []);

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10 animate-fade-in">
            {loadError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {loadError}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6 xl:gap-8">
                {/* Filters Sidebar */}
                <aside className="lg:w-80 shrink-0">
                    <div className="card overflow-hidden lg:sticky lg:top-24">
                        <div className="bg-gradient-to-br from-slate-950 via-primary-950 to-primary-900 px-6 py-6 text-white">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">Discovery local</p>
                            <p className="mt-2 font-display text-3xl font-bold text-white">Filtra mejor</p>
                            <p className="mt-2 text-sm leading-6 text-white/75">
                                {activeFilterChips.length > 0
                                    ? `${activeFilterChips.length} filtro${activeFilterChips.length === 1 ? '' : 's'} activo${activeFilterChips.length === 1 ? '' : 's'}.`
                                    : 'Ajusta ubicacion, categoria y disponibilidad sin salir del flujo de discovery.'}
                            </p>
                        </div>
                        <div className="space-y-5 p-6">
                            {activeFilterChips.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {activeFilterChips.map((chip) => (
                                        <span key={chip} className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
                                            {chip}
                                        </span>
                                    ))}
                                </div>
                            ) : null}

                        {/* Search */}
                        <div>
                            <label htmlFor="businesses-search" className="text-sm font-medium text-gray-600 mb-1.5 block">Buscar</label>
                            <input
                                id="businesses-search"
                                type="text"
                                placeholder="Nombre o descripcion"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="input-field text-sm"
                            />
                        </div>

                        {/* Category */}
                        <div>
                            <label htmlFor="businesses-category" className="text-sm font-medium text-gray-600 mb-1.5 block">Categoria</label>
                            <select
                                id="businesses-category"
                                value={currentCategory}
                                onChange={(e) => updateFilter('categoryId', e.target.value)}
                                className="input-field text-sm"
                            >
                                <option value="">Todas las categorias</option>
                                {categoryOptions.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.parent?.name ? `${cat.parent.name} / ` : ''}{cat.icon} {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                            {/* Province */}
                            <div>
                                <label htmlFor="businesses-province" className="text-sm font-medium text-gray-600 mb-1.5 block">Provincia</label>
                                <select
                                    id="businesses-province"
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

                            <div>
                                <label htmlFor="businesses-city" className="text-sm font-medium text-gray-600 mb-1.5 block">Ciudad</label>
                                <select
                                    id="businesses-city"
                                    value={currentCity}
                                    onChange={(e) => updateFilter('cityId', e.target.value)}
                                    disabled={!currentProvince}
                                    className="input-field text-sm disabled:bg-gray-50 disabled:text-gray-400"
                                >
                                    <option value="">{currentProvince ? 'Todas las ciudades' : 'Selecciona una provincia'}</option>
                                    {cities.map((city) => (
                                        <option key={city.id} value={city.id}>
                                            {city.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="businesses-sector" className="text-sm font-medium text-gray-600 mb-1.5 block">Sector</label>
                            <select
                                id="businesses-sector"
                                value={currentSector}
                                onChange={(e) => updateFilter('sectorId', e.target.value)}
                                disabled={!currentCity || sectors.length === 0}
                                className="input-field text-sm disabled:bg-gray-50 disabled:text-gray-400"
                            >
                                <option value="">{currentCity ? 'Todos los sectores' : 'Selecciona una ciudad'}</option>
                                {sectors.map((sector) => (
                                    <option key={sector.id} value={sector.id}>
                                        {sector.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="businesses-feature" className="text-sm font-medium text-gray-600 mb-1.5 block">Servicio o intencion</label>
                            <input
                                id="businesses-feature"
                                type="text"
                                placeholder="Ej: delivery, parqueo, pet friendly"
                                value={currentFeature}
                                onChange={(e) => updateFilter('feature', e.target.value)}
                                className="input-field text-sm"
                            />
                        </div>

                        <label className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-900">
                            <input
                                type="checkbox"
                                checked={currentOpenNow}
                                onChange={(event) => updateFilter('openNow', event.target.checked ? 'true' : '')}
                            />
                            Mostrar solo negocios abiertos ahora
                        </label>

                        <button
                            onClick={() => {
                                setSearchInput('');
                                if (categorySlug || provinceSlug || intentSlug) {
                                    navigate('/businesses');
                                    return;
                                }
                                setSearchParams({});
                            }}
                            className="text-left text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                            Limpiar filtros
                        </button>
                        </div>
                    </div>
                </aside>

                {/* Results */}
                <div className="flex-1 min-w-0">
                    <div className="mb-6 rounded-[1.5rem] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resultados</p>
                                <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">{listingHeading}</h1>
                                <p className="mt-2 text-sm text-slate-500">{resultsSummary}</p>
                            </div>
                            {activeFilterChips.length > 0 ? (
                                <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
                                    {activeFilterChips.slice(0, 4).map((chip) => (
                                        <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                            {chip}
                                        </span>
                                    ))}
                                    {activeFilterChips.length > 4 ? (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                            +{activeFilterChips.length - 4} mas
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                            {Array.from({ length: 9 }).map((_, index) => (
                                <div key={index} className="card p-4">
                                    <div className="h-40 rounded-xl bg-gray-100 animate-pulse mb-3"></div>
                                    <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse mb-2"></div>
                                    <div className="h-3 w-full rounded bg-gray-100 animate-pulse mb-1.5"></div>
                                    <div className="h-3 w-4/5 rounded bg-gray-100 animate-pulse"></div>
                                </div>
                            ))}
                        </div>
                    ) : businesses.length > 0 ? (
                        <>
                            {showSponsoredAds && sponsoredPlacements.length > 0 && (
                                <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                    {sponsoredPlacements.map((placement) => (
                                        <Link
                                            key={placement.campaign.id}
                                            to={`/businesses/${placement.business.slug || placement.business.id}`}
                                            onClick={() => {
                                                if (showSponsoredAds) {
                                                    void adsApi.trackClick(placement.campaign.id, {
                                                        visitorId: getOrCreateVisitorId(),
                                                        placementKey: 'businesses-list',
                                                    }).catch(() => undefined);
                                                }
                                                trackBusinessClick(placement.business.id, 'sponsored-placement');
                                            }}
                                            className="rounded-xl border border-amber-200 bg-amber-50 p-3 hover:border-amber-300 transition-colors hover-lift"
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

                            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {businesses.map((biz) => {
                                    const trust = trustByBusinessId.get(biz.id);
                                    const businessPath = `/businesses/${biz.slug || biz.id}`;
                                    const primaryCategory = biz.categories?.[0]?.category ?? null;
                                    const secondaryCategory = biz.categories?.[1]?.category ?? null;
                                    const reviewCount = biz._count?.reviews ?? 0;
                                    const locationLabel = [biz.sector?.name, biz.city?.name || biz.province?.name].filter(Boolean).join(' - ');
                                    const priceLabel = businessPriceRangeLabel(biz.priceRange);

                                    return (
                                    <Link
                                        key={biz.id}
                                        to={businessPath}
                                        onClick={() => {
                                            trackBusinessClick(biz.id, 'businesses-list');
                                        }}
                                        onMouseEnter={() => preloadRouteChunk(businessPath)}
                                        onFocus={() => preloadRouteChunk(businessPath)}
                                        className="card group overflow-hidden hover-lift"
                                    >
                                        <div className="relative h-44 bg-gradient-to-br from-primary-50 to-accent-50">
                                            {biz.images?.[0] ? (
                                                <OptimizedImage
                                                    src={biz.images[0].url}
                                                    alt={biz.name}
                                                    className="h-full w-full object-cover"
                                                    loading="lazy"
                                                    decoding="async"
                                                />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-4xl font-display font-bold text-primary-200">
                                                    {getDisplayInitial(biz.name)}
                                                </div>
                                            )}
                                            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {biz.verified ? (
                                                        <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                                                            Verificado
                                                        </span>
                                                    ) : null}
                                                    {biz.openNow !== null && biz.openNow !== undefined ? (
                                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                                            biz.openNow
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {biz.openNow ? 'Abierto' : 'Cerrado'}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {isAuthenticated && isCustomerRole ? (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => void handleToggleFavorite(event, biz.id)}
                                                        disabled={favoriteProcessingId === biz.id}
                                                        aria-label={
                                                            favoriteBusinessIds.has(biz.id)
                                                                ? `Quitar ${biz.name} de favoritos`
                                                                : `Guardar ${biz.name} en favoritos`
                                                        }
                                                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                                                            favoriteBusinessIds.has(biz.id)
                                                                ? 'border-primary-600 bg-primary-600 text-white'
                                                                : 'border-white/80 bg-white/90 text-slate-600 hover:border-primary-300'
                                                        }`}
                                                    >
                                                        {favoriteProcessingId === biz.id
                                                            ? '...'
                                                            : favoriteBusinessIds.has(biz.id)
                                                                ? 'Guardado'
                                                                : 'Guardar'}
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 via-slate-950/10 to-transparent p-4">
                                                <div className="flex items-end justify-between gap-3">
                                                    <div className="min-w-0">
                                                        {primaryCategory ? (
                                                            <p className="truncate text-xs font-medium text-white/80">
                                                                {primaryCategory.parent?.name ? `${primaryCategory.parent.name} / ` : ''}{primaryCategory.name}
                                                            </p>
                                                        ) : null}
                                                        <h2 className="truncate font-display text-xl font-semibold text-white group-hover:text-primary-100">
                                                            {biz.name}
                                                        </h2>
                                                    </div>
                                                    {priceLabel ? (
                                                        <span className="shrink-0 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-700">
                                                            {priceLabel}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3 p-4">
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                                                <span>{reviewCount} resenas</span>
                                                {trust ? (
                                                    <span className={`rounded-full px-2.5 py-1 font-semibold ${
                                                        trust.level === 'ALTA'
                                                            ? 'bg-emerald-50 text-emerald-700'
                                                            : trust.level === 'MEDIA'
                                                                ? 'bg-amber-50 text-amber-700'
                                                                : 'bg-red-50 text-red-700'
                                                    }`}>
                                                        Confianza {trust.score}/100
                                                    </span>
                                                ) : null}
                                                {biz.distanceKm ? (
                                                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">
                                                        {biz.distanceKm.toFixed(1)} km
                                                    </span>
                                                ) : null}
                                            </div>
                                            {locationLabel ? (
                                                <p className="text-xs text-slate-500">{locationLabel}</p>
                                            ) : (
                                                <p className="text-xs text-slate-500">{biz.province?.name || biz.address}</p>
                                            )}

                                            <p className="line-clamp-2 text-sm leading-6 text-slate-600">{biz.description}</p>

                                            <div className="flex flex-wrap gap-2">
                                                {secondaryCategory ? (
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                        {secondaryCategory.name}
                                                    </span>
                                                ) : null}
                                                {biz.todayHoursLabel ? (
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                        Hoy: {biz.todayHoursLabel}
                                                    </span>
                                                ) : null}
                                                {biz.profileCompletenessScore !== undefined ? (
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                        Ficha {biz.profileCompletenessScore}% completa
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </Link>
                                    );
                                })}
                                </div>
                                <div className="xl:sticky xl:top-24 self-start space-y-3">
                                    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contexto geografico</p>
                                        <h2 className="mt-2 font-display text-xl font-semibold text-slate-900">Mapa de resultados</h2>
                                        <p className="mt-2 text-sm leading-6 text-slate-500">
                                            Valida cercania, cobertura por zona y concentracion del catalogo antes de abrir una ficha.
                                        </p>
                                    </div>
                                    <BusinessesMap businesses={businesses} />
                                </div>
                            </div>

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex justify-center gap-2 mt-8">
                                    {paginationItems.map((page, index) => (
                                        page === 'ellipsis' ? (
                                            <span
                                                key={`ellipsis-${index}`}
                                                className="w-10 h-10 inline-flex items-center justify-center text-gray-500"
                                            >
                                                ...
                                            </span>
                                        ) : (
                                            <button
                                                key={page}
                                                onClick={() =>
                                                    updateFilter('page', String(page), { resetPage: false })
                                                }
                                                className={`w-10 h-10 touch-target rounded-xl text-sm font-medium transition-all ${page === currentPage
                                                    ? 'bg-primary-600 text-white shadow-lg'
                                                    : 'bg-white text-gray-600 border border-gray-200 hover:border-primary-500'
                                                    }`}
                                            >
                                                {page}
                                            </button>
                                        )
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-20 text-slate-500">
                            <p className="text-5xl mb-4">🔍</p>
                            <p className="text-lg">No se encontraron negocios con estos filtros</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
