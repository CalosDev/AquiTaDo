import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage, isApiTimeoutError } from '../api/error';
import { adsApi, analyticsApi, businessApi, categoryApi, favoritesApi, locationApi } from '../api/endpoints';
import { OptimizedImage } from '../components/OptimizedImage';
import { PageFeedbackStack } from '../components/PageFeedbackStack';
import { useAuth } from '../context/useAuth';
import { getOrCreateSessionId, getOrCreateVisitorId } from '../lib/clientContext';
import { businessPriceRangeLabel } from '../lib/businessProfile';
import { applySeoMeta, removeJsonLd, upsertJsonLd } from '../seo/meta';
import { calculateBusinessTrustScore } from '../lib/trust';
import { trackGrowthEvent as trackGrowthSignal } from '../lib/growthTracking';
import { preloadRouteChunk } from '../routes/preload';
import { featureFlags } from '../config/features';
import { formatPublicCategoryName, formatPublicCategoryPath } from '../lib/categoryLabel';
import { FiltersSidebar } from './businesses-list/FiltersSidebar';
import { ListingControlsBar } from './businesses-list/ListingControlsBar';
import type { Business, Category, City, ListingViewMode, Province, Sector, SponsoredPlacement } from './businesses-list/types';

function getDisplayInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'N';
}

const INTENT_FEATURE_MAP: Record<string, { label: string; feature: string; description: string }> = {
    'con-delivery': {
        label: 'Negocios con delivery',
        feature: 'delivery',
        description: 'Encuentra negocios que ofrecen delivery en Republica Dominicana.',
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
        description: 'Compara negocios que aceptan reservaciones en linea o por WhatsApp.',
    },
    accesibles: {
        label: 'Negocios accesibles',
        feature: 'accesible',
        description: 'Listado de negocios con facilidades de accesibilidad.',
    },
};

const NO_RESULTS_SUGGESTIONS = [
    { to: '/negocios/intencion/con-delivery', label: 'Con delivery' },
    { to: '/negocios/intencion/con-reservas', label: 'Con reservas' },
    { to: '/negocios/intencion/pet-friendly', label: 'Pet friendly' },
] as const;

const PAGE_SIZE = 12;
const loadBusinessesMapModule = () => import('../components/BusinessesMap');
const BusinessesMapLazy = lazy(async () => {
    const module = await loadBusinessesMapModule();
    return { default: module.BusinessesMap };
});

function scheduleIdleTask(task: () => void): () => void {
    if (typeof window === 'undefined') {
        task();
        return () => undefined;
    }

    const idleWindow = window as Window & {
        requestIdleCallback?: (
            callback: IdleRequestCallback,
            options?: IdleRequestOptions,
        ) => number;
        cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
        const callbackId = idleWindow.requestIdleCallback(() => {
            task();
        }, { timeout: 650 });

        return () => idleWindow.cancelIdleCallback?.(callbackId);
    }

    const timeoutId = window.setTimeout(task, 220);
    return () => window.clearTimeout(timeoutId);
}

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
    const [sponsoredPlacementsLoading, setSponsoredPlacementsLoading] = useState(false);
    const [favoriteBusinessIds, setFavoriteBusinessIds] = useState<Set<string>>(new Set());
    const [favoriteProcessingId, setFavoriteProcessingId] = useState<string | null>(null);
    const [filtersLoading, setFiltersLoading] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [loadErrorType, setLoadErrorType] = useState<'timeout' | 'generic' | null>(null);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sortKey, setSortKey] = useState<'relevance' | 'rating' | 'distance' | 'name'>('relevance');
    const showSponsoredAds = featureFlags.sponsoredAds;

    const currentSearch = searchParams.get('search') || '';
    const currentCategory = searchParams.get('categoryId') || '';
    const currentProvince = searchParams.get('provinceId') || '';
    const currentCity = searchParams.get('cityId') || '';
    const currentSector = searchParams.get('sectorId') || '';
    const currentFeature = searchParams.get('feature') || '';
    const currentOpenNow = searchParams.get('openNow') === 'true';
    const currentVerified = searchParams.get('verified') === 'true';
    const currentView: ListingViewMode = searchParams.get('view') === 'map' ? 'map' : 'list';
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const [searchInput, setSearchInput] = useState(currentSearch);
    const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
    const paginationItems = useMemo(
        () => buildPagination(currentPage, totalPages),
        [currentPage, totalPages],
    );
    const sortedBusinesses = useMemo(() => {
        if (sortKey === 'relevance') {
            return businesses;
        }

        const sorted = [...businesses];
        if (sortKey === 'rating') {
            sorted.sort((left, right) => Number(right.reputationScore ?? 0) - Number(left.reputationScore ?? 0));
            return sorted;
        }

        if (sortKey === 'distance') {
            sorted.sort((left, right) => {
                const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
                const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
                return leftDistance - rightDistance;
            });
            return sorted;
        }

        sorted.sort((left, right) => left.name.localeCompare(right.name, 'es'));
        return sorted;
    }, [businesses, sortKey]);
    const mappableBusinesses = useMemo(
        () => sortedBusinesses.filter(
            (business) => typeof business.latitude === 'number' && typeof business.longitude === 'number',
        ),
        [sortedBusinesses],
    );
    const selectedBusiness = useMemo(
        () => sortedBusinesses.find((business) => business.id === selectedBusinessId) ?? null,
        [selectedBusinessId, sortedBusinesses],
    );
    const resultsCountLabel = useMemo(() => {
        if (loading) {
            return 'Cargando resultados...';
        }

        return `Mostrando ${businesses.length} resultado${businesses.length === 1 ? '' : 's'}`;
    }, [businesses.length, loading]);
    const pageSummary = useMemo(() => {
        if (loading) {
            return '';
        }
        if (total === 0) {
            return 'Mostrando 0 resultados';
        }
        const start = (currentPage - 1) * PAGE_SIZE + 1;
        const end = Math.min(total, start + businesses.length - 1);
        return `Mostrando ${start}-${end} de ${total} resultados`;
    }, [businesses.length, currentPage, loading, total]);
    const shouldShowInitialLoading = loading && businesses.length === 0 && !loadError;
    const isRefreshingResults = loading && businesses.length > 0 && !loadError;
    const activeCategory = useMemo(
        () => categories.find((category) => category.slug === categorySlug || category.id === currentCategory) || null,
        [categories, categorySlug, currentCategory],
    );
    const activeCategoryDisplayName = useMemo(
        () => (activeCategory ? formatPublicCategoryName(activeCategory.name) : ''),
        [activeCategory],
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
            return `${formatPublicCategoryName(activeCategory.name)} en ${activeCity.name}`;
        }
        if (activeCity) {
            return `Negocios en ${activeCity.name}`;
        }
        if (activeCategory && activeProvince) {
            return `${formatPublicCategoryName(activeCategory.name)} en ${activeProvince.name}`;
        }
        if (activeCategory) {
            return formatPublicCategoryName(activeCategory.name);
        }
        if (activeProvince) {
            return `Negocios en ${activeProvince.name}`;
        }
        return 'Negocios';
    }, [activeCategory, activeCity, activeIntent, activeProvince]);
    const activeFilterChips = useMemo(() => {
        const chips: string[] = [];
        if (currentSearch) chips.push(`Busqueda: ${currentSearch}`);
        if (activeCategory) chips.push(`Categoria: ${formatPublicCategoryName(activeCategory.name)}`);
        if (activeProvince) chips.push(`Provincia: ${activeProvince.name}`);
        if (activeCity) chips.push(`Ciudad: ${activeCity.name}`);
        if (activeSector) chips.push(`Sector: ${activeSector.name}`);
        if (currentFeature) chips.push(`Servicio: ${currentFeature}`);
        if (currentOpenNow) chips.push('Abiertos ahora');
        if (currentVerified) chips.push('Verificados');
        return chips;
    }, [activeCategory, activeCity, activeProvince, activeSector, currentFeature, currentOpenNow, currentSearch, currentVerified]);
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
    const prefetchBusinessDestination = useCallback((business: { id?: string | null; slug?: string | null }) => {
        const businessPath = `/businesses/${business.slug || business.id}`;
        preloadRouteChunk(businessPath);
        businessApi.prefetchPublicDetail({
            id: business.id,
            slug: business.slug,
        });
    }, []);

    useEffect(() => {
        setSearchInput(currentSearch);
    }, [currentSearch]);

    useEffect(() => {
        if (mappableBusinesses.length === 0) {
            if (selectedBusinessId !== null) {
                setSelectedBusinessId(null);
            }
            return;
        }

        const selectedStillVisible = selectedBusinessId
            ? mappableBusinesses.some((business) => business.id === selectedBusinessId)
            : false;

        if (!selectedStillVisible) {
            setSelectedBusinessId(mappableBusinesses[0].id);
        }
    }, [mappableBusinesses, selectedBusinessId]);

    useEffect(() => {
        if (currentView === 'map') {
            void loadBusinessesMapModule();
        }
    }, [currentView]);

    const loadFilters = useCallback(async () => {
        setFiltersLoading(true);
        try {
            const [catRes, provRes] = await Promise.all([
                categoryApi.getAll(),
                locationApi.getProvinces(),
            ]);
            setCategories(catRes.data);
            setProvinces(provRes.data);
        } catch (error) {
            setLoadErrorType(isApiTimeoutError(error) ? 'timeout' : 'generic');
            setLoadError(getApiErrorMessage(error, 'No se pudieron cargar los filtros'));
        } finally {
            setFiltersLoading(false);
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
        setLoadErrorType(null);
        setSponsoredPlacements([]);
        setSponsoredPlacementsLoading(false);
        try {
            const params: Record<string, string | number | boolean> = { page: currentPage, limit: PAGE_SIZE };
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
            if (currentVerified) params.verified = true;

            const businessesRes = await businessApi.getAll(params);

            setBusinesses(businessesRes.data.data || []);
            setTotal(businessesRes.data.total || 0);
            setTotalPages(businessesRes.data.totalPages || 0);
        } catch (error) {
            setLoadErrorType(isApiTimeoutError(error) ? 'timeout' : 'generic');
            setLoadError(getApiErrorMessage(error, 'No se pudieron cargar los negocios'));
            setSponsoredPlacements([]);
        } finally {
            setLoading(false);
        }
    }, [categorySlug, currentCategory, currentCity, currentFeature, currentOpenNow, currentPage, currentProvince, currentSearch, currentSector, currentVerified, provinceSlug]);

    useEffect(() => {
        void loadBusinesses();
    }, [loadBusinesses]);

    useEffect(() => {
        if (!showSponsoredAds) {
            setSponsoredPlacements([]);
            setSponsoredPlacementsLoading(false);
            return;
        }

        if (loading || loadError || businesses.length === 0) {
            if (!loading && businesses.length === 0) {
                setSponsoredPlacements([]);
                setSponsoredPlacementsLoading(false);
            }
            return;
        }

        let active = true;
        setSponsoredPlacementsLoading(true);
        const cancelIdleTask = scheduleIdleTask(() => {
            void adsApi.getPlacements({
                provinceId: currentProvince || undefined,
                categoryId: currentCategory || undefined,
                limit: 3,
            })
                .then((response) => {
                    if (!active) {
                        return;
                    }
                    setSponsoredPlacements((response.data || []) as SponsoredPlacement[]);
                })
                .catch(() => {
                    if (!active) {
                        return;
                    }
                    setSponsoredPlacements([]);
                })
                .finally(() => {
                    if (active) {
                        setSponsoredPlacementsLoading(false);
                    }
                });
        });

        return () => {
            active = false;
            cancelIdleTask();
        };
    }, [businesses.length, currentCategory, currentProvince, loadError, loading, showSponsoredAds]);

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

    const trackListingEvent = useCallback((
        eventType: 'LISTING_FILTER_APPLY' | 'LISTING_VIEW_CHANGE' | 'LISTING_MAP_SELECT',
        metadata: Record<string, unknown>,
        overrides: { businessId?: string } = {},
    ) => {
        void trackGrowthSignal({
            eventType,
            businessId: overrides.businessId,
            categoryId: currentCategory || undefined,
            provinceId: currentProvince || undefined,
            cityId: currentCity || undefined,
            searchQuery: currentSearch || undefined,
            metadata: {
                page: currentPage,
                currentView,
                feature: currentFeature || undefined,
                sectorId: currentSector || undefined,
                openNow: currentOpenNow,
                verified: currentVerified,
                ...metadata,
            },
        });
    }, [
        currentCategory,
        currentCity,
        currentFeature,
        currentOpenNow,
        currentPage,
        currentProvince,
        currentSearch,
        currentSector,
        currentVerified,
        currentView,
    ]);

    const handleMapSelectBusiness = useCallback((businessId: string) => {
        setSelectedBusinessId(businessId);
        trackListingEvent('LISTING_MAP_SELECT', {
            selectedBusinessId: businessId,
            resultsOnPage: sortedBusinesses.length,
            mappableResults: mappableBusinesses.length,
        }, { businessId });
    }, [mappableBusinesses.length, sortedBusinesses.length, trackListingEvent]);

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

    const handleTrackedFilterChange = useCallback((
        key: string,
        value: string,
        metadata: Record<string, unknown>,
    ) => {
        trackListingEvent('LISTING_FILTER_APPLY', {
            filterKey: key,
            value: value || null,
            ...metadata,
        });
        updateFilter(key, value);
    }, [trackListingEvent, updateFilter]);

    const handleViewModeChange = useCallback((nextView: ListingViewMode) => {
        if (nextView === currentView) {
            return;
        }

        if (nextView === 'map') {
            void loadBusinessesMapModule();
        }

        trackListingEvent('LISTING_VIEW_CHANGE', {
            nextView,
            previousView: currentView,
            resultsOnPage: sortedBusinesses.length,
            mappableResults: mappableBusinesses.length,
        });

        startTransition(() => {
            setSearchParams((previous) => {
                const params = new URLSearchParams(previous);
                if (nextView === 'map') {
                    params.set('view', 'map');
                } else {
                    params.delete('view');
                }
                return params;
            });
        });
    }, [currentView, mappableBusinesses.length, setSearchParams, sortedBusinesses.length, trackListingEvent]);

    const handleSortChange = useCallback((nextSort: typeof sortKey) => {
        setSortKey(nextSort);
        trackListingEvent('LISTING_FILTER_APPLY', {
            filterKey: 'sort',
            value: nextSort,
            source: 'topbar-sort',
        });
    }, [trackListingEvent]);

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

    const handleClearFilters = useCallback(() => {
        trackListingEvent('LISTING_FILTER_APPLY', {
            filterKey: 'clear_all',
            value: null,
            source: 'filters-panel',
        });
        setSearchInput('');
        if (categorySlug || provinceSlug || intentSlug) {
            navigate('/businesses');
            return;
        }
        setSearchParams({});
    }, [categorySlug, intentSlug, navigate, provinceSlug, setSearchParams, trackListingEvent]);

    useEffect(() => {
        const debounceTimer = window.setTimeout(() => {
            if (searchInput !== currentSearch) {
                trackListingEvent('LISTING_FILTER_APPLY', {
                    filterKey: 'search',
                    value: searchInput.trim() || null,
                    source: 'topbar-search',
                });
                updateFilter('search', searchInput, { resetPage: true });
            }
        }, 350);

        return () => window.clearTimeout(debounceTimer);
    }, [searchInput, currentSearch, trackListingEvent, updateFilter]);

    useEffect(() => {
        const headingBase = activeIntent
            ? activeIntent.label
            : activeCategory && activeProvince
            ? `${activeCategoryDisplayName} en ${activeProvince.name}`
            : activeCategory
                ? `${activeCategoryDisplayName} en Republica Dominicana`
                : activeProvince
                    ? `Negocios en ${activeProvince.name}`
                    : 'Directorio de negocios en Republica Dominicana';

        const descriptionBase = activeIntent
            ? `${activeIntent.description} Contacta por WhatsApp o teléfono desde AquiTa.do.`
            : activeCategory && activeProvince
            ? `Descubre ${activeCategoryDisplayName.toLowerCase()} en ${activeProvince.name}. Compara opciones locales, contacta por WhatsApp y reserva en AquiTa.do.`
            : activeCategory
                ? `Explora ${activeCategoryDisplayName.toLowerCase()} en Republica Dominicana. Filtra, compara y contacta negocios verificados en AquiTa.do.`
                : activeProvince
                    ? `Encuentra negocios locales en ${activeProvince.name}. Descubre perfiles verificados, reseñas y canales de contacto.`
                    : 'Explora negocios locales en Republica Dominicana. Filtra por categoría y provincia para encontrar opciones verificadas.';

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
                name: activeCategoryDisplayName,
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
                itemListElement: businesses.slice(0, PAGE_SIZE).map((business, index) => ({
                    '@type': 'ListItem',
                    position: index + 1,
                    name: business.name,
                    url: `${origin}/businesses/${business.slug || business.id}`,
                })),
            });
        } else {
            removeJsonLd('businesses-list-itemlist');
        }
    }, [activeCategory, activeCategoryDisplayName, activeIntent, activeProvince, businesses, intentSlug, seoCanonicalPath]);

    useEffect(() => {
        return () => {
            removeJsonLd('businesses-list-breadcrumb');
            removeJsonLd('businesses-list-itemlist');
        };
    }, []);

    
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
            <PageFeedbackStack
                items={
                    loadError
                        ? [
                            {
                                id: 'businesses-load-error',
                                tone: 'danger',
                                text: loadError,
                            },
                        ]
                        : []
                }
            />

            <h1 className="sr-only">{listingHeading}</h1>

            <ListingControlsBar
                currentProvince={currentProvince}
                currentView={currentView}
                filtersOpen={filtersOpen}
                mappableResultsCount={mappableBusinesses.length}
                onMapIntent={() => void loadBusinessesMapModule()}
                onProvinceChange={(value) => handleTrackedFilterChange('provinceId', value, { source: 'topbar-province' })}
                onSearchInputChange={setSearchInput}
                onSortChange={handleSortChange}
                onToggleFilters={() => setFiltersOpen((previous) => !previous)}
                onViewModeChange={handleViewModeChange}
                provinces={provinces}
                resultsCountLabel={resultsCountLabel}
                searchInput={searchInput}
                sortKey={sortKey}
                totalVisibleResults={sortedBusinesses.length}
            />

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <FiltersSidebar
                    activeFilterChips={activeFilterChips}
                    categoryOptions={categoryOptions}
                    cities={cities}
                    currentCategory={currentCategory}
                    currentCity={currentCity}
                    currentFeature={currentFeature}
                    currentOpenNow={currentOpenNow}
                    currentProvince={currentProvince}
                    currentSector={currentSector}
                    currentVerified={currentVerified}
                    filtersOpen={filtersOpen}
                    loading={filtersLoading}
                    onClearFilters={handleClearFilters}
                    onFeatureChange={(value) => updateFilter('feature', value)}
                    onTrackedFilterChange={handleTrackedFilterChange}
                    provinces={provinces}
                    sectors={sectors}
                />

                <div className="min-w-0">
                    {shouldShowInitialLoading ? (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div
                                        key={index}
                                        className="flex min-h-[24rem] flex-col rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)]"
                                    >
                                        <div className="relative overflow-hidden rounded-[1.35rem] bg-slate-100">
                                            <div className="absolute left-3 top-3 h-7 w-24 rounded-full bg-white/80 animate-pulse"></div>
                                            <div className="absolute left-28 top-3 h-7 w-20 rounded-full bg-white/70 animate-pulse"></div>
                                            <div className="aspect-[4/3] animate-pulse bg-slate-100"></div>
                                        </div>

                                        <div className="mt-4 space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="h-6 w-3/5 rounded-full bg-slate-100 animate-pulse"></div>
                                                <div className="h-6 w-14 rounded-full bg-slate-100 animate-pulse"></div>
                                            </div>

                                            <div className="h-4 w-2/5 rounded-full bg-slate-100 animate-pulse"></div>
                                            <div className="h-4 w-1/3 rounded-full bg-slate-100 animate-pulse"></div>
                                            <div className="h-4 w-4/5 rounded-full bg-slate-100 animate-pulse"></div>

                                            <div className="flex flex-wrap gap-2 pt-1">
                                                <div className="h-7 w-24 rounded-full bg-slate-100 animate-pulse"></div>
                                                <div className="h-7 w-36 rounded-full bg-slate-100 animate-pulse"></div>
                                                <div className="h-7 w-24 rounded-full bg-slate-100 animate-pulse"></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="h-4 w-40 rounded-full bg-slate-100 animate-pulse"></div>
                                <div className="h-9 w-24 rounded-xl bg-slate-100 animate-pulse"></div>
                            </div>
                        </div>
                    ) : loadError && businesses.length === 0 ? (
                        <div className="rounded-[1.75rem] border border-accent-100 bg-white p-6 shadow-[0_28px_80px_-42px_rgba(15,23,42,0.28)] sm:p-8">
                            <div className="max-w-2xl">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-500">
                                    {loadErrorType === 'timeout' ? 'Servicio despertando' : 'No pudimos completar la carga'}
                                </p>
                                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
                                    {loadErrorType === 'timeout'
                                        ? 'La carga está tardando más de lo normal'
                                        : 'Hubo un problema al traer los negocios'}
                                </h2>
                                <p className="mt-2 max-w-xl text-sm text-slate-600">
                                    {loadErrorType === 'timeout'
                                        ? 'Estamos reintentando cuando el servicio tarda en responder. Puedes volver a intentar sin perder tus filtros.'
                                        : 'Revisa tu conexión o vuelve a intentarlo en unos segundos. Mientras tanto, tu contexto de búsqueda se mantiene.'}
                                </p>
                            </div>

                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => void loadBusinesses()}
                                    className="inline-flex items-center justify-center rounded-2xl bg-primary-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
                                >
                                    Reintentar carga
                                </button>
                                <button
                                    type="button"
                                    onClick={handleClearFilters}
                                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                                >
                                    Limpiar filtros
                                </button>
                            </div>
                        </div>
                    ) : sortedBusinesses.length > 0 ? (
                        <>
                            {isRefreshingResults ? (
                                <div className="mb-4 rounded-2xl border border-primary-100 bg-primary-50/80 px-4 py-3 text-sm text-primary-700 shadow-sm">
                                    Actualizando resultados sin perder el contexto actual...
                                </div>
                            ) : null}

                            {loadError ? (
                                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
                                    {loadErrorType === 'timeout'
                                        ? 'La actualizacion tardó más de lo normal. Te dejamos los últimos resultados visibles mientras reintentas.'
                                        : loadError}
                                </div>
                            ) : null}

                            {showSponsoredAds && sponsoredPlacements.length > 0 ? (
                                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                                            onMouseEnter={() => prefetchBusinessDestination(placement.business)}
                                            onFocus={() => prefetchBusinessDestination(placement.business)}
                                            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700 transition hover:border-amber-300"
                                        >
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Patrocinado #{placement.placementRank}</p>
                                            <p className="mt-1 font-semibold text-slate-900">{placement.business.name}</p>
                                            <p className="mt-1 text-xs text-slate-600">Campana: {placement.campaign.name}</p>
                                            <p className="mt-1 text-xs text-slate-600">CPC {placement.campaign.bidAmount} · CTR {placement.campaign.ctr}%</p>
                                        </Link>
                                    ))}
                                </div>
                            ) : null}

                            {showSponsoredAds && sponsoredPlacementsLoading && sponsoredPlacements.length === 0 ? (
                                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {Array.from({ length: 3 }).map((_, index) => (
                                        <div
                                            key={`sponsored-skeleton-${index}`}
                                            className="rounded-2xl border border-slate-200 bg-white p-4"
                                        >
                                            <div className="h-3 w-24 rounded-full bg-slate-100 animate-pulse" />
                                            <div className="mt-3 h-5 w-2/3 rounded-full bg-slate-100 animate-pulse" />
                                            <div className="mt-2 h-4 w-3/4 rounded-full bg-slate-100 animate-pulse" />
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {currentView === 'map' ? (
                                <div className="discovery-callout mb-4 p-3">
                                    <div className="mb-3 flex flex-col gap-3 border-b border-slate-100 pb-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-900">Mapa sincronizado con el listado</h2>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Los filtros activos y la paginación de esta vista se reflejan en el mapa.
                                                {` ${mappableBusinesses.length} de ${sortedBusinesses.length} resultados visibles tienen coordenadas.`}
                                            </p>
                                        </div>
                                        {selectedBusiness ? (
                                            <Link
                                                to={`/businesses/${selectedBusiness.slug || selectedBusiness.id}`}
                                                onClick={() => trackBusinessClick(selectedBusiness.id, 'listing-map-selected')}
                                                onMouseEnter={() => prefetchBusinessDestination(selectedBusiness)}
                                                onFocus={() => prefetchBusinessDestination(selectedBusiness)}
                                                className="text-xs font-semibold text-primary-700 transition hover:text-primary-800"
                                            >
                                                Ver {selectedBusiness.name}
                                            </Link>
                                        ) : null}
                                    </div>
                                    <Suspense
                                        fallback={(
                                            <div className="h-[420px] overflow-hidden rounded-2xl border border-primary-100/80 bg-white shadow-sm">
                                                <div className="h-full w-full animate-pulse bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.12),_transparent_55%),linear-gradient(135deg,_rgba(248,250,252,0.95),_rgba(226,232,240,0.9))]" />
                                            </div>
                                        )}
                                    >
                                        <BusinessesMapLazy
                                        businesses={sortedBusinesses}
                                        selectedBusinessId={selectedBusinessId}
                                        onSelectBusiness={handleMapSelectBusiness}
                                        onOpenBusiness={(businessId) => trackBusinessClick(businessId, 'listing-map-selected')}
                                        emptyLabel="No hay coordenadas suficientes en esta página para dibujar el mapa todavía."
                                        />
                                    </Suspense>
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {sortedBusinesses.map((biz) => {
                                    const trust = trustByBusinessId.get(biz.id);
                                    const businessPath = `/businesses/${biz.slug || biz.id}`;
                                    const primaryCategory = biz.categories?.[0]?.category ?? null;
                                    const secondaryCategory = biz.categories?.[1]?.category ?? null;
                                    const reviewCount = biz._count?.reviews ?? 0;
                                    const locationLabel = [biz.sector?.name, biz.city?.name || biz.province?.name].filter(Boolean).join(' · ');
                                    const priceLabel = businessPriceRangeLabel(biz.priceRange);
                                    const priceChip = priceLabel ? priceLabel.split(' ')[0] : null;
                                    const ratingValue = Number(biz.reputationScore ?? 0);
                                    const ratingDisplay = Number.isFinite(ratingValue) && ratingValue > 0 ? (ratingValue / 20).toFixed(1) : null;
                                    const isMappable = typeof biz.latitude === 'number' && typeof biz.longitude === 'number';
                                    const isSelectedOnMap = currentView === 'map' && isMappable && selectedBusinessId === biz.id;

                                    return (
                                        <Link
                                            key={biz.id}
                                            to={businessPath}
                                            onClick={() => {
                                                trackBusinessClick(biz.id, 'businesses-list');
                                            }}
                                            onMouseEnter={() => {
                                                prefetchBusinessDestination(biz);
                                                if (currentView === 'map' && isMappable) {
                                                    setSelectedBusinessId(biz.id);
                                                }
                                            }}
                                            onFocus={() => {
                                                prefetchBusinessDestination(biz);
                                                if (currentView === 'map' && isMappable) {
                                                    setSelectedBusinessId(biz.id);
                                                }
                                            }}
                                            className={`group listing-card defer-render-card ${
                                                isSelectedOnMap
                                                    ? 'border-primary-300 ring-2 ring-primary-100'
                                                    : ''
                                            }`}
                                        >
                                            <div className="listing-card-media aspect-[4/3]">
                                                {biz.images?.[0] ? (
                                                    <OptimizedImage
                                                        src={biz.images[0].url}
                                                        alt={biz.name}
                                                        className="h-full w-full object-cover"
                                                        priority={currentPage === 1 && currentView === 'list' && sortedBusinesses[0]?.id === biz.id}
                                                        sizes="(min-width: 1280px) 26rem, (min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                                                    />
                                                ) : (
                                                    <div className="flex h-full items-center justify-center text-4xl font-display font-bold text-slate-300">
                                                        {getDisplayInitial(biz.name)}
                                                    </div>
                                                )}
                                                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                                                    {biz.verified ? (
                                                        <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                                                            Verificado
                                                        </span>
                                                    ) : null}
                                                    {biz.openNow !== null && biz.openNow !== undefined ? (
                                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                                            biz.openNow ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'
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
                                                        className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
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

                                            <div className="mt-3 space-y-2">
                                                <div className="flex items-center justify-between gap-3">
                                                    <h2 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-primary-700">
                                                        {biz.name}
                                                    </h2>
                                                    {priceChip ? (
                                                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                                            {priceChip}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {primaryCategory ? (
                                                    <p className="text-xs text-slate-500">
                                                        {formatPublicCategoryPath(primaryCategory.parent?.name, primaryCategory.name)}
                                                    </p>
                                                ) : null}

                                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                                                        <svg className="h-4 w-4 text-primary-600" viewBox="0 0 20 20" fill="currentColor">
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.538 1.118l-2.8-2.034a1 1 0 0 0-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.539-1.118l1.071-3.292a1 1 0 0 0-.364-1.118L2.98 8.719c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z" />
                                                        </svg>
                                                        <span className="font-semibold text-slate-700">{ratingDisplay ?? '0.0'}</span>
                                                    </span>
                                                    <span>({reviewCount})</span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                    <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                                        <path d="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10z" />
                                                        <circle cx="12" cy="11" r="2.5" />
                                                    </svg>
                                                    <span>{locationLabel || biz.province?.name || biz.address}</span>
                                                    {biz.distanceKm ? (
                                                        <>
                                                            <span className="text-slate-400">|</span>
                                                            <span>{biz.distanceKm.toFixed(1)} km</span>
                                                        </>
                                                    ) : null}
                                                </div>
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    {secondaryCategory ? (
                                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                            {formatPublicCategoryName(secondaryCategory.name)}
                                                        </span>
                                                    ) : null}
                                                    {biz.todayHoursLabel ? (
                                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                                            Hoy: {biz.todayHoursLabel}
                                                        </span>
                                                    ) : null}
                                                    {trust ? (
                                                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                                            trust.level === 'ALTA'
                                                                ? 'bg-primary-50 text-primary-700'
                                                                : trust.level === 'MEDIA'
                                                                    ? 'bg-amber-50 text-amber-700'
                                                                    : 'bg-red-50 text-red-700'
                                                        }`}>
                                                            Confianza {trust.score}
                                                        </span>
                                                    ) : null}
                                                    {currentView === 'map' && !isMappable ? (
                                                        <span className="rounded-full border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                                                            Sin punto en mapa
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-slate-500">{pageSummary}</p>
                                {totalPages > 1 ? (
                                    <div className="flex flex-wrap items-center gap-2 justify-end">
                                        <button
                                            type="button"
                                            onClick={() => updateFilter('page', String(currentPage - 1), { resetPage: false })}
                                            disabled={currentPage === 1}
                                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                                currentPage === 1
                                                    ? 'border-slate-200 text-slate-400'
                                                    : 'border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-700'
                                            }`}
                                        >
                                            Anterior
                                        </button>
                                        {paginationItems.map((page, index) => (
                                            page === 'ellipsis' ? (
                                                <span
                                                    key={`ellipsis-${index}`}
                                                    className="w-9 text-center text-xs text-slate-400"
                                                >
                                                    ...
                                                </span>
                                            ) : (
                                                <button
                                                    key={page}
                                                    type="button"
                                                    onClick={() => updateFilter('page', String(page), { resetPage: false })}
                                                    className={`h-9 w-9 rounded-xl text-xs font-semibold transition ${
                                                        page === currentPage
                                                            ? 'bg-primary-600 text-white'
                                                            : 'border border-slate-200 text-slate-600 hover:border-primary-300'
                                                    }`}
                                                >
                                                    {page}
                                                </button>
                                            )
                                        ))}
                                        <button
                                            type="button"
                                            onClick={() => updateFilter('page', String(currentPage + 1), { resetPage: false })}
                                            disabled={currentPage === totalPages}
                                            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                                currentPage === totalPages
                                                    ? 'border-slate-200 text-slate-400'
                                                    : 'border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-700'
                                            }`}
                                        >
                                            Siguiente
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <div className="discovery-callout px-6 py-16 text-center text-slate-500">
                            <p className="text-sm font-semibold text-slate-700">No encontramos coincidencias con esta combinacion</p>
                            <p className="mt-2 text-sm leading-relaxed">
                                Ajusta uno o dos filtros, cambia la provincia o prueba una intencion rapida para descubrir negocios cercanos.
                            </p>
                            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleClearFilters}
                                    className="btn-primary text-sm"
                                >
                                    Limpiar filtros
                                </button>
                                <Link to="/" className="btn-secondary text-sm">
                                    Volver al inicio
                                </Link>
                            </div>
                            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                                {NO_RESULTS_SUGGESTIONS.map((suggestion) => (
                                    <Link
                                        key={suggestion.to}
                                        to={suggestion.to}
                                        className="chip transition hover:!bg-primary-50 hover:!text-primary-700"
                                    >
                                        {suggestion.label}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}



