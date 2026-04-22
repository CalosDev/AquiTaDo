import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { ListingViewMode } from './types';

export const INTENT_FEATURE_MAP: Record<string, { label: string; feature: string; description: string }> = {
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

export const QUICK_INTENTION_FEATURE_MAP: Record<string, string> = {
    'con-delivery': 'delivery',
    'pet-friendly': 'pet friendly',
    'con-parqueo': 'estacionamiento',
    'con-reservas': 'reservaciones',
    'accesible-ada': 'accesible',
    'acepta-tarjeta': 'tarjeta',
    'wifi-gratis': 'wifi',
};

function parseNumericParam(value: string | null): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFilterText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export function useBusinessesListFilters() {
    const navigate = useNavigate();
    const { categorySlug, provinceSlug, intentSlug } = useParams<{
        categorySlug?: string;
        provinceSlug?: string;
        intentSlug?: string;
    }>();
    const [searchParams, setSearchParams] = useSearchParams();

    const currentSearch = searchParams.get('search') || '';
    const currentCategory = searchParams.get('categoryId') || '';
    const currentProvince = searchParams.get('provinceId') || '';
    const currentCity = searchParams.get('cityId') || '';
    const currentSector = searchParams.get('sectorId') || '';
    const currentFeature = searchParams.get('feature') || '';
    const currentOpenNow = searchParams.get('openNow') === 'true';
    const currentVerified = searchParams.get('verified') === 'true';
    const currentLatitude = parseNumericParam(searchParams.get('latitude'));
    const currentLongitude = parseNumericParam(searchParams.get('longitude'));
    const currentRadiusKm = parseNumericParam(searchParams.get('radiusKm')) ?? 5;
    const currentView: ListingViewMode = searchParams.get('view') === 'map' ? 'map' : 'list';
    const parsedPage = Number.parseInt(searchParams.get('page') || '1', 10);
    const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const [searchInput, setSearchInput] = useState(currentSearch);

    const selectedIntentions = useMemo(() => {
        const selected: string[] = [];
        const normalizedFeature = normalizeFilterText(currentFeature);

        Object.entries(QUICK_INTENTION_FEATURE_MAP).forEach(([intentionId, featureValue]) => {
            if (normalizedFeature && normalizedFeature === normalizeFilterText(featureValue)) {
                selected.push(intentionId);
            }
        });

        if (currentOpenNow) {
            selected.push('abierto-ahora');
        }

        if (currentVerified) {
            selected.push('verificado');
        }

        return selected;
    }, [currentFeature, currentOpenNow, currentVerified]);

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

    useEffect(() => {
        setSearchInput(currentSearch);
    }, [currentSearch]);

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
            setSearchParams((previous) => {
                const params = new URLSearchParams(previous);
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
    }, [categorySlug, intentSlug, navigate, provinceSlug, searchParams, setSearchParams]);

    const applyGeoFilter = useCallback((latitude: number, longitude: number, distance: number) => {
        startTransition(() => {
            setSearchParams((previous) => {
                const params = new URLSearchParams(previous);
                params.set('latitude', String(latitude));
                params.set('longitude', String(longitude));
                params.set('radiusKm', String(distance));
                params.set('page', '1');
                return params;
            });
        });
    }, [setSearchParams]);

    const clearGeoFilter = useCallback(() => {
        startTransition(() => {
            setSearchParams((previous) => {
                const params = new URLSearchParams(previous);
                params.delete('latitude');
                params.delete('longitude');
                params.delete('radiusKm');
                params.set('page', '1');
                return params;
            });
        });
    }, [setSearchParams]);

    const setViewMode = useCallback((nextView: ListingViewMode) => {
        if (nextView === currentView) {
            return;
        }

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
    }, [currentView, setSearchParams]);

    const clearAllFilters = useCallback(() => {
        setSearchInput('');
        if (categorySlug || provinceSlug || intentSlug) {
            navigate('/businesses');
            return;
        }
        setSearchParams({});
    }, [categorySlug, intentSlug, navigate, provinceSlug, setSearchParams]);

    return {
        categorySlug,
        provinceSlug,
        intentSlug,
        searchParams,
        setSearchParams,
        currentSearch,
        currentCategory,
        currentProvince,
        currentCity,
        currentSector,
        currentFeature,
        currentOpenNow,
        currentVerified,
        currentLatitude,
        currentLongitude,
        currentRadiusKm,
        currentView,
        currentPage,
        searchInput,
        setSearchInput,
        selectedIntentions,
        seoCanonicalPath,
        updateFilter,
        applyGeoFilter,
        clearGeoFilter,
        setViewMode,
        clearAllFilters,
    };
}
