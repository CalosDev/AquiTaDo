import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRoleCapabilities } from '../auth/capabilities';
import { getApiErrorMessage } from '../api/error';
import { aiApi, analyticsApi, businessApi, categoryApi, locationApi, reputationApi } from '../api/endpoints';
import { useAuth } from '../context/useAuth';
import { getOrCreateSessionId, getOrCreateVisitorId } from '../lib/clientContext';
import { formatNumberDo } from '../lib/market';
import { formatPublicCategoryName } from '../lib/categoryLabel';
import { OptimizedImage } from '../components/OptimizedImage';
import { featureFlags } from '../config/features';

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

interface AiConciergeMatch {
    id: string;
    name: string;
    slug: string;
    address: string;
    score: number;
    link: string;
    whatsapp?: string | null;
}

interface ReputationRankingItem {
    rank: number;
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    province?: { id: string; name: string } | null;
    city?: { id: string; name: string } | null;
    reputation: {
        score: number;
        tier: 'BRONZE' | 'SILVER' | 'GOLD';
        averageRating: number;
        reviewCount: number;
    };
}

const INTENT_LINKS = [
    { slug: 'con-delivery', label: 'Con delivery', subtitle: 'Entrega rapida', icon: 'MOTO' },
    { slug: 'con-parqueo', label: 'Con parqueo', subtitle: 'Llega sin estres', icon: 'PARK' },
    { slug: 'pet-friendly', label: 'Pet friendly', subtitle: 'Aceptan mascotas', icon: 'PET' },
    { slug: 'con-reservas', label: 'Con reservas', subtitle: 'Agenda facil', icon: 'BOOK' },
    { slug: 'accesibles', label: 'Accesibles', subtitle: 'Entrada inclusiva', icon: 'ACCESS' },
];

const OPERATING_POINTS = [
    {
        title: 'Descubre mejor',
        description: 'Filtros por categoría, provincia e intención para encontrar opciones reales en minutos.',
    },
    {
        title: 'Contacta directo',
        description: 'WhatsApp y contacto directo para convertir descubrimiento en acción inmediata.',
    },
    {
        title: 'Decide con confianza',
        description: 'Perfiles con mejor contexto para comparar opciones y elegir mas rapido.',
    },
];

type DominicanCategoryPreset = {
    key: string;
    label: string;
    queries: string[];
    slugHints: string[];
};

type HomeTopCategoryCard = {
    key: string;
    label: string;
    href: string;
    businessCount: number | null;
    categoryId?: string;
    source: string;
};

const DOMINICAN_CATEGORY_PRESETS: DominicanCategoryPreset[] = [
    { key: 'colmados', label: 'Colmados y mini markets', queries: ['colmado', 'minimarket'], slugHints: ['colmados', 'supermercados'] },
    { key: 'food', label: 'Restaurantes y pica pollo', queries: ['restaurante', 'pica pollo'], slugHints: ['restaurantes'] },
    { key: 'pharmacy', label: 'Farmacias y salud', queries: ['farmacia', 'salud'], slugHints: ['farmacias', 'salud'] },
    { key: 'beauty', label: 'Salones y barberias', queries: ['salon', 'barberia'], slugHints: ['salones-barberias', 'belleza', 'salones'] },
    { key: 'hardware', label: 'Ferreterias y construccion', queries: ['ferreteria', 'construccion'], slugHints: ['ferreterias', 'construccion'] },
    { key: 'tech', label: 'Tecnologia y servicios', queries: ['tecnologia', 'reparacion'], slugHints: ['tecnologia'] },
    { key: 'retail', label: 'Tiendas y moda', queries: ['tienda', 'moda'], slugHints: ['tiendas'] },
    { key: 'auto', label: 'Automotriz y talleres', queries: ['taller', 'mecanica'], slugHints: ['automotriz'] },
];

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function reputationTierLabel(tier: 'BRONZE' | 'SILVER' | 'GOLD'): string {
    if (tier === 'GOLD') {
        return 'Oro';
    }
    if (tier === 'SILVER') {
        return 'Plata';
    }
    return 'Bronce';
}

function reputationTierClass(tier: 'BRONZE' | 'SILVER' | 'GOLD'): string {
    if (tier === 'GOLD') {
        return 'bg-amber-100 text-amber-800 border border-amber-200';
    }
    if (tier === 'SILVER') {
        return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
    return 'bg-orange-100 text-orange-800 border border-orange-200';
}

function trackGrowthEvent(payload: {
    eventType: 'SEARCH_QUERY' | 'SEARCH_RESULT_CLICK';
    categoryId?: string;
    provinceId?: string;
    businessId?: string;
    metadata?: Record<string, unknown>;
    searchQuery?: string;
}) {
    return analyticsApi.trackGrowthEvent({
        ...payload,
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
    }).catch(() => undefined);
}

function toAffinityPercent(score: number): number {
    if (!Number.isFinite(score)) {
        return 0;
    }

    return Math.max(0, Math.min(100, Math.round(score * 100)));
}

export function Home() {
    const { isAuthenticated, user } = useAuth();
    const navigate = useNavigate();

    const [searchQuery, setSearchQuery] = useState('');
    const [categories, setCategories] = useState<Category[]>([]);
    const [recentBusinesses, setRecentBusinesses] = useState<Business[]>([]);
    const [provinces, setProvinces] = useState<Province[]>([]);
    const [totalBusinesses, setTotalBusinesses] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [aiQuery, setAiQuery] = useState('');
    const [aiCategoryId, setAiCategoryId] = useState('');
    const [aiProvinceId, setAiProvinceId] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState('');
    const [aiAnswer, setAiAnswer] = useState('');
    const [aiMatches, setAiMatches] = useState<AiConciergeMatch[]>([]);
    const [rankingProvinceId, setRankingProvinceId] = useState('');
    const [rankingsLoading, setRankingsLoading] = useState(false);
    const [rankingsError, setRankingsError] = useState('');
    const [rankings, setRankings] = useState<ReputationRankingItem[]>([]);
    const showAiConcierge = featureFlags.aiConcierge;

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
        ? 'Crear cuenta y registrar negocio'
        : roleCapabilities.canAccessAdminPanel
            ? 'Ir al panel admin'
            : canRegisterBusiness
                ? 'Registrar mi negocio'
                : 'Explorar negocios';

    const topCategories = useMemo(
        () => [...categories].sort((a, b) => (b._count?.businesses ?? 0) - (a._count?.businesses ?? 0)),
        [categories],
    );
    const topProvinces = useMemo(
        () => [...provinces].sort((a, b) => (b._count?.businesses ?? 0) - (a._count?.businesses ?? 0)).slice(0, 10),
        [provinces],
    );
    const topRadarCategories = useMemo(
        () => topCategories.slice(0, 4),
        [topCategories],
    );
    const topCategoryCards = useMemo<HomeTopCategoryCard[]>(() => {
        const cards: HomeTopCategoryCard[] = [];
        const usedCategoryIds = new Set<string>();
        const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

        for (const preset of DOMINICAN_CATEGORY_PRESETS) {
            const matchBySlug = preset.slugHints
                .map((slug) => categoryBySlug.get(slug))
                .find((entry): entry is Category => Boolean(entry));

            const matchByName = matchBySlug
                ? null
                : categories.find((category) => {
                    const normalizedName = normalizeText(formatPublicCategoryName(category.name));
                    return preset.queries.some((query) => normalizedName.includes(normalizeText(query)));
                });

            const matchedCategory = matchBySlug || matchByName;
            if (matchedCategory) {
                usedCategoryIds.add(matchedCategory.id);
                cards.push({
                    key: preset.key,
                    label: preset.label,
                    href: `/negocios/categoria/${matchedCategory.slug}`,
                    businessCount: matchedCategory._count?.businesses ?? 0,
                    categoryId: matchedCategory.id,
                    source: 'home-category-grid-curated',
                });
                continue;
            }

            cards.push({
                key: preset.key,
                label: preset.label,
                href: `/businesses?search=${encodeURIComponent(preset.queries[0])}`,
                businessCount: null,
                source: 'home-category-grid-curated-fallback',
            });
        }

        const remaining = topCategories
            .filter((category) => !usedCategoryIds.has(category.id))
            .map<HomeTopCategoryCard>((category) => ({
                key: category.id,
                label: formatPublicCategoryName(category.name),
                href: category.slug
                    ? `/negocios/categoria/${category.slug}`
                    : `/businesses?categoryId=${category.id}`,
                businessCount: category._count?.businesses ?? 0,
                categoryId: category.id,
                source: 'home-category-grid-top',
            }));

        return [...cards, ...remaining].slice(0, 8);
    }, [categories, topCategories]);

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const [catRes, bizRes, provRes] = await Promise.all([
                categoryApi.getAll(),
                businessApi.getAll({ limit: 6 }),
                locationApi.getProvinces(),
            ]);
            setCategories(catRes.data);
            setRecentBusinesses(bizRes.data.data || []);
            setTotalBusinesses(Number(bizRes.data.total || 0));
            setProvinces(provRes.data);
        } catch (error) {
            setLoadError(getApiErrorMessage(error, 'No se pudo cargar la información inicial'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        let active = true;
        setRankingsLoading(true);
        setRankingsError('');

        void reputationApi.getRankings({
            provinceId: rankingProvinceId || undefined,
            limit: 6,
        })
            .then((response) => {
                if (!active) {
                    return;
                }
                setRankings((response.data ?? []) as ReputationRankingItem[]);
            })
            .catch((error) => {
                if (!active) {
                    return;
                }
                setRankings([]);
                setRankingsError(getApiErrorMessage(error, 'No se pudo cargar el ranking de reputación'));
            })
            .finally(() => {
                if (active) {
                    setRankingsLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [rankingProvinceId]);

    const handleSearch = (event: React.FormEvent) => {
        event.preventDefault();
        const normalizedQuery = searchQuery.trim();
        if (!normalizedQuery) {
            return;
        }

        void trackGrowthEvent({
            eventType: 'SEARCH_QUERY',
            searchQuery: normalizedQuery,
            metadata: { source: 'home-hero-search' },
        });

        navigate(`/businesses?search=${encodeURIComponent(normalizedQuery)}`);
    };

    const handleBusinessClick = (businessId: string) => {
        void trackGrowthEvent({
            eventType: 'SEARCH_RESULT_CLICK',
            businessId,
            metadata: { source: 'home-recent-businesses' },
        });
    };

    const handleAiSearch = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!showAiConcierge) {
            return;
        }

        const query = aiQuery.trim();
        if (!query) {
            setAiError('Escribe una consulta para el asistente');
            return;
        }

        setAiLoading(true);
        setAiError('');

        try {
            const response = await aiApi.askConcierge({
                query,
                categoryId: aiCategoryId || undefined,
                provinceId: aiProvinceId || undefined,
                limit: 6,
            });

            setAiAnswer(String(response.data?.answer || ''));
            setAiMatches((response.data?.data ?? []) as AiConciergeMatch[]);

            void trackGrowthEvent({
                eventType: 'SEARCH_QUERY',
                searchQuery: query,
                categoryId: aiCategoryId || undefined,
                provinceId: aiProvinceId || undefined,
                metadata: { source: 'home-ai-concierge' },
            });
        } catch (error) {
            setAiAnswer('');
            setAiMatches([]);
            setAiError(getApiErrorMessage(error, 'No se pudo consultar el asistente'));
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <div className="animate-fade-in">
            {loadError && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {loadError}
                    </div>
                </div>
            )}

            <section className="gradient-hero relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 subtle-grid-bg"></div>
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
                    <div className="grid gap-8 xl:gap-10 lg:grid-cols-12 lg:items-center">
                        <div className="lg:col-span-7">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-100">
                                <span className="h-2 w-2 rounded-full bg-red-300"></span>
                                Ecosistema local dominicano
                            </div>
                            <h1 className="mt-5 font-display text-4xl sm:text-5xl xl:text-6xl font-extrabold leading-tight text-white">
                                Descubre negocios reales
                                <span className="block text-accent-300">por zona, categoria y confianza en RD</span>
                            </h1>
                            <p className="mt-5 max-w-2xl text-base md:text-lg leading-relaxed text-blue-100">
                                AquiTa.do te ayuda a encontrar negocios locales utiles, comparables y confiables en Republica Dominicana,
                                con mejor contexto por categoria, ubicacion y calidad de ficha.
                            </p>

                            <div className="mt-5 flex flex-wrap gap-2.5">
                                <span className="chip !border-white/30 !bg-white/10 !text-white">Enfocado 100% en RD</span>
                                <span className="chip !border-white/30 !bg-white/10 !text-white">Discovery por ubicacion</span>
                                <span className="chip !border-white/30 !bg-white/10 !text-white">Catalogo confiable</span>
                            </div>

                            <div className="mt-6 flex flex-wrap gap-3">
                                <Link to="/businesses" className="btn-accent">
                                    Explorar negocios
                                </Link>
                                <Link
                                    to={registerBusinessPath}
                                    className="btn-secondary !bg-white/92 !text-primary-800 hover:!bg-white"
                                >
                                    {registerBusinessLabel}
                                </Link>
                            </div>

                            <form onSubmit={handleSearch} className="mt-7 max-w-3xl">
                                <div className="hero-glass-card p-2 md:p-3">
                                    <div className="flex flex-col gap-2 md:flex-row">
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(event) => setSearchQuery(event.target.value)}
                                            placeholder="Busca restaurantes, colmados, salones, farmacias..."
                                            aria-label="Buscar negocios"
                                            className="input-field flex-1 !border-white/50 !bg-white text-sm md:text-base"
                                        />
                                        <button type="submit" className="btn-accent whitespace-nowrap">
                                            Buscar ahora
                                        </button>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 px-1">
                                        {['Comida criolla', 'Farmacia 24h', 'Taller automotriz'].map((preset) => (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() => setSearchQuery(preset)}
                                                className="rounded-full border border-white/35 bg-white/12 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/20"
                                            >
                                                {preset}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </form>

                            <div className="mt-6 flex flex-wrap gap-2.5">
                                <span className="kpi-chip-soft">
                                    {loading ? '...' : formatNumberDo(totalBusinesses)} negocios
                                </span>
                                <span className="kpi-chip-soft">
                                    {loading ? '...' : provinces.length} provincias
                                </span>
                                <span className="kpi-chip-soft">
                                    {loading ? '...' : categories.length} categorías
                                </span>
                            </div>
                        </div>

                        <div className="lg:col-span-5">
                            <div className="hero-accent-ring p-6 md:p-7 text-white">
                                <p className="text-xs uppercase tracking-[0.18em] text-blue-200 font-semibold">Radar local</p>
                                <h2 className="mt-2 font-display text-2xl font-bold">Qué está moviendo el mercado</h2>

                                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="hero-metric-card">
                                        <p className="hero-metric-label">Top categoría</p>
                                        <p className="hero-metric-value truncate">
                                            {topRadarCategories[0] ? formatPublicCategoryName(topRadarCategories[0].name) : 'Cargando'}
                                        </p>
                                    </div>
                                    <div className="hero-metric-card">
                                        <p className="hero-metric-label">Cobertura activa</p>
                                        <p className="hero-metric-value">
                                            {loading ? '...' : formatNumberDo(totalBusinesses)}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-5 space-y-3">
                                    {topRadarCategories.length > 0 ? topRadarCategories.map((category, index) => (
                                        <Link
                                            key={category.id}
                                            to={category.slug ? `/negocios/categoria/${category.slug}` : `/businesses?categoryId=${category.id}`}
                                            onClick={() => {
                                                void trackGrowthEvent({
                                                    eventType: 'SEARCH_QUERY',
                                                    categoryId: category.id,
                                                    metadata: { source: 'home-radar-category' },
                                                });
                                            }}
                                            className="hero-radar-item"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                                                    {index + 1}
                                                </span>
                                                <span className="truncate">{formatPublicCategoryName(category.name)}</span>
                                            </div>
                                            <span className="text-blue-100">{formatNumberDo(category._count?.businesses ?? 0)}</span>
                                        </Link>
                                    )) : (
                                        <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-blue-100">
                                            Cargando categorías destacadas...
                                        </div>
                                    )}
                                </div>

                                <div className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4">
                                    <p className="text-xs uppercase tracking-wide text-blue-100">Cobertura</p>
                                    <p className="mt-1 font-semibold">
                                        {topProvinces.length > 0
                                            ? `${topProvinces[0].name}, ${topProvinces[1]?.name ?? 'Santiago'} y mas`
                                            : 'Santo Domingo, Santiago y mas'}
                                    </p>
                                    <p className="mt-1 text-sm text-blue-100">
                                        Pensado para el contexto local dominicano y para decidir mejor.
                                    </p>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14">
                {showAiConcierge && (
                    <div className="section-shell p-6 md:p-8 border-t-4 border-primary-600 mb-8">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div>
                            <p className="text-xs uppercase tracking-wide text-primary-700 font-semibold">Asistente IA</p>
                            <h2 className="font-display text-2xl md:text-3xl font-bold text-gray-900 mt-1">
                                Pregunta en lenguaje natural
                            </h2>
                            <p className="text-gray-600 mt-2 max-w-2xl">
                                Ejemplo: "Donde hay comida criolla con parqueo en Piantini?".
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleAiSearch} className="mt-5 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <input
                                value={aiQuery}
                                onChange={(event) => setAiQuery(event.target.value)}
                                placeholder="Que negocio necesitas hoy?"
                                className="input-field md:col-span-2"
                                aria-label="Consulta al asistente IA"
                            />
                            <select
                                value={aiCategoryId}
                                onChange={(event) => setAiCategoryId(event.target.value)}
                                className="input-field"
                                aria-label="Filtrar por categoría"
                            >
                                <option value="">Todas las categorías</option>
                                {categories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {formatPublicCategoryName(category.name)}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={aiProvinceId}
                                onChange={(event) => setAiProvinceId(event.target.value)}
                                className="input-field"
                                aria-label="Filtrar por provincia"
                            >
                                <option value="">Todas las provincias</option>
                                {provinces.map((province) => (
                                    <option key={province.id} value={province.id}>
                                        {province.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button type="submit" className="btn-primary" disabled={aiLoading}>
                                {aiLoading ? 'Consultando...' : 'Consultar asistente'}
                            </button>
                            {aiError ? <p className="text-sm text-red-700">{aiError}</p> : null}
                        </div>
                    </form>

                    {(aiAnswer || aiMatches.length > 0) && (
                        <div className="mt-5 space-y-4">
                            {aiAnswer ? (
                                <div className="rounded-xl border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm leading-relaxed text-gray-800">
                                    {aiAnswer}
                                </div>
                            ) : null}

                            {aiMatches.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {aiMatches.map((match) => (
                                        <Link
                                            key={match.id}
                                            to={match.slug ? `/businesses/${match.slug}` : `/businesses/${match.id}`}
                                            onClick={() => handleBusinessClick(match.id)}
                                            className="panel-premium p-4"
                                        >
                                            <p className="font-semibold text-gray-900">{match.name}</p>
                                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{match.address}</p>
                                            <p className="text-xs text-primary-700 mt-2 font-medium">
                                                Afinidad {toAffinityPercent(match.score)}%
                                            </p>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500">No hubo coincidencias para esa consulta.</p>
                            )}
                        </div>
                    )}
                    </div>
                )}

                <div className="section-shell p-5 md:p-7">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="section-title !text-2xl md:!text-3xl">Explora por intención</h2>
                            <p className="section-subtitle">Rutas rapidas para encontrar justo lo que necesitas.</p>
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {INTENT_LINKS.map((intent) => (
                            <Link
                                key={intent.slug}
                                to={`/negocios/intencion/${intent.slug}`}
                                onClick={() => {
                                    void trackGrowthEvent({
                                        eventType: 'SEARCH_QUERY',
                                        metadata: { source: 'home-intent-card', intent: intent.slug },
                                    });
                                }}
                                className="panel-premium p-4"
                            >
                                <p className="text-[11px] uppercase tracking-[0.16em] text-primary-600 font-bold">{intent.icon}</p>
                                <p className="mt-2 font-display text-lg font-semibold text-slate-900">{intent.label}</p>
                                <p className="mt-1 text-sm text-slate-600">{intent.subtitle}</p>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-7">
                <div className="grid gap-8 lg:grid-cols-2">
                    <div className="section-shell p-6">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h3 className="font-display text-2xl font-bold text-slate-900">Categorías top en RD</h3>
                                <p className="mt-1 text-sm text-slate-600">Taxonomia local para descubrir negocios dominicanos sin friccion.</p>
                            </div>
                            <Link to="/businesses" className="text-sm font-semibold text-primary-700 hover:text-primary-800">
                                Ver todo
                            </Link>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            {topCategoryCards.map((category) => (
                                <Link
                                    key={category.key}
                                    to={category.href}
                                    onClick={() => {
                                        void trackGrowthEvent({
                                            eventType: 'SEARCH_QUERY',
                                            categoryId: category.categoryId,
                                            metadata: { source: category.source, categoryKey: category.key },
                                        });
                                    }}
                                    className="panel-premium p-3 text-sm font-semibold text-slate-700 hover:text-primary-700"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate">{category.label}</span>
                                        <span className="text-xs text-slate-500">
                                            {category.businessCount !== null ? category.businessCount : 'Explorar'}
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="section-shell p-6">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <h3 className="font-display text-2xl font-bold text-slate-900">Provincias activas</h3>
                                <p className="mt-1 text-sm text-slate-600">Cobertura local con enfoque en demanda real.</p>
                            </div>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2.5">
                            {topProvinces.map((province) => (
                                <Link
                                    key={province.id}
                                    to={province.slug ? `/negocios/provincia/${province.slug}` : `/businesses?provinceId=${province.id}`}
                                    onClick={() => {
                                        void trackGrowthEvent({
                                            eventType: 'SEARCH_QUERY',
                                            provinceId: province.id,
                                            metadata: { source: 'home-province-chip' },
                                        });
                                    }}
                                    className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100"
                                >
                                    {province.name}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-7">
                <div className="section-shell p-6">
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h3 className="font-display text-2xl font-bold text-slate-900">Ranking de reputación</h3>
                            <p className="mt-1 text-sm text-slate-600">
                                Negocios verificados con mejor desempeno por provincia.
                            </p>
                        </div>
                        <select
                            value={rankingProvinceId}
                            onChange={(event) => setRankingProvinceId(event.target.value)}
                            className="input-field text-sm max-w-xs"
                            aria-label="Filtrar ranking por provincia"
                        >
                            <option value="">Toda República Dominicana</option>
                            {provinces.map((province) => (
                                <option key={province.id} value={province.id}>
                                    {province.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {rankingsError ? (
                        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {rankingsError}
                        </div>
                    ) : null}

                    {rankingsLoading ? (
                        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="panel-premium p-4">
                                    <div className="h-4 w-32 rounded bg-gray-100 animate-pulse"></div>
                                    <div className="mt-2 h-3 w-56 rounded bg-gray-100 animate-pulse"></div>
                                </div>
                            ))}
                        </div>
                    ) : rankings.length === 0 ? (
                        <p className="mt-5 text-sm text-slate-500">Aún no hay ranking disponible para ese filtro.</p>
                    ) : (
                        <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            {rankings.map((item) => (
                                <Link
                                    key={item.id}
                                    to={`/businesses/${item.slug || item.id}`}
                                    onClick={() => handleBusinessClick(item.id)}
                                    className="panel-premium p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-primary-700">#{item.rank}</p>
                                            <p className="font-display text-lg font-semibold text-slate-900">{item.name}</p>
                                            <p className="text-xs text-slate-500">
                                                {item.city?.name || item.province?.name || 'República Dominicana'}
                                            </p>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${reputationTierClass(item.reputation.tier)}`}>
                                            {reputationTierLabel(item.reputation.tier)}
                                        </span>
                                    </div>
                                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
                                        <span className="font-semibold text-slate-800">Score {item.reputation.score.toFixed(1)}</span>
                                        <span>
                                            Rating {item.reputation.averageRating > 0 ? item.reputation.averageRating.toFixed(1) : '0.0'}
                                        </span>
                                        <span>{item.reputation.reviewCount} reseñas</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-14">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <h2 className="section-title !text-3xl">Negocios recientes</h2>
                        <p className="section-subtitle">Perfiles nuevos listos para recibir clientes.</p>
                    </div>
                    <Link to="/businesses" className="btn-secondary text-sm w-fit">Ver todo el directorio</Link>
                </div>

                {recentBusinesses.length === 0 ? (
                    <div className="section-shell mt-6 p-10 text-center">
                        <p className="font-display text-2xl font-semibold text-slate-800">Aún no hay negocios registrados.</p>
                        <p className="mt-2 text-sm text-slate-600">Aporta la primera ficha util para esa zona o categoria.</p>
                        <Link to={registerBusinessPath} className="btn-primary mt-5 inline-flex">{registerBusinessLabel}</Link>
                    </div>
                ) : (
                    <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {recentBusinesses.map((business) => (
                            <Link
                                key={business.id}
                                to={`/businesses/${business.slug || business.id}`}
                                onClick={() => handleBusinessClick(business.id)}
                                className="panel-premium group overflow-hidden"
                            >
                                <div className="relative h-48 bg-gradient-to-br from-primary-50 to-accent-50">
                                    {business.images?.[0] ? (
                                        <OptimizedImage
                                            src={business.images[0].url}
                                            alt={business.name}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <div className="h-full w-full flex items-center justify-center text-sm font-semibold text-primary-700">
                                            Imagen pendiente
                                        </div>
                                    )}
                                    <div className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-primary-700">
                                        Nuevo
                                    </div>
                                </div>
                                <div className="p-5">
                                    <h3 className="font-display text-xl font-semibold text-slate-900 group-hover:text-primary-700 transition-colors">
                                        {business.name}
                                    </h3>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {business.province?.name || business.address}
                                    </p>
                                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                                        {business.description}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-7">
                <div className="section-shell p-6 md:p-8">
                    <h2 className="section-title !text-3xl">Por que AquiTa.do es diferente</h2>
                    <p className="section-subtitle mt-2">
                        No es solo un listado: prioriza contexto local, fichas utiles y senales de confianza.
                    </p>
                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                        {OPERATING_POINTS.map((point) => (
                            <article key={point.title} className="panel-premium p-5">
                                <h3 className="font-display text-xl font-semibold text-slate-900">{point.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">{point.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="gradient-hero mt-14">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
                    <p className="chip !bg-white/10 !text-white !border-white/30 mx-auto w-fit">Impulsa tu presencia local</p>
                    <h2 className="mt-4 font-display text-3xl md:text-5xl font-extrabold text-white">
                        Lleva tu negocio del barrio al siguiente nivel
                    </h2>
                    <p className="mt-4 text-base md:text-lg text-blue-100 max-w-2xl mx-auto">
                        Crea una ficha mas completa, mejora tu visibilidad local y ayuda a que mas personas te encuentren.
                    </p>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                        <Link to={registerBusinessPath} className="btn-accent inline-flex text-base md:text-lg px-8">
                            {registerBusinessLabel}
                        </Link>
                        <Link to="/businesses" className="btn-secondary !bg-white/90 !text-primary-800 hover:!bg-white">
                            Ver directorio público
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
