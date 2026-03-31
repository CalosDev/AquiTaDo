import type { ListingViewMode, Province } from './types';

interface ListingControlsBarProps {
    currentProvince: string;
    currentView: ListingViewMode;
    filtersOpen: boolean;
    mappableResultsCount: number;
    onProvinceChange: (value: string) => void;
    onSearchInputChange: (value: string) => void;
    onSortChange: (value: 'relevance' | 'rating' | 'distance' | 'name') => void;
    onToggleFilters: () => void;
    onViewModeChange: (nextView: ListingViewMode) => void;
    provinces: Province[];
    resultsCountLabel: string;
    searchInput: string;
    sortKey: 'relevance' | 'rating' | 'distance' | 'name';
    totalVisibleResults: number;
}

export function ListingControlsBar({
    currentProvince,
    currentView,
    filtersOpen,
    mappableResultsCount,
    onProvinceChange,
    onSearchInputChange,
    onSortChange,
    onToggleFilters,
    onViewModeChange,
    provinces,
    resultsCountLabel,
    searchInput,
    sortKey,
    totalVisibleResults,
}: ListingControlsBarProps) {
    return (
        <>
            <div className="panel-premium p-5 sm:p-6">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <circle cx="11" cy="11" r="7" />
                                    <line x1="16.65" y1="16.65" x2="21" y2="21" />
                                </svg>
                            </span>
                            <input
                                id="businesses-search"
                                type="text"
                                placeholder="Buscar negocios..."
                                value={searchInput}
                                onChange={(event) => onSearchInputChange(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>
                        <div className="relative sm:w-64">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10z" />
                                    <circle cx="12" cy="11" r="2.5" />
                                </svg>
                            </span>
                            <select
                                id="businesses-province-top"
                                value={currentProvince}
                                onChange={(event) => onProvinceChange(event.target.value)}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-8 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                <option value="">Toda Republica Dominicana</option>
                                {provinces.map((province) => (
                                    <option key={province.id} value={province.id}>
                                        {province.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                            <button
                                type="button"
                                onClick={() => onViewModeChange('list')}
                                aria-pressed={currentView === 'list'}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    currentView === 'list' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Lista
                            </button>
                            <button
                                type="button"
                                onClick={() => onViewModeChange('map')}
                                aria-pressed={currentView === 'map'}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    currentView === 'map' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Mapa
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={onToggleFilters}
                            aria-controls="filters-panel"
                            aria-pressed={filtersOpen}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M4 6h16" />
                                <path d="M7 12h10" />
                                <path d="M10 18h4" />
                            </svg>
                            Filtros
                        </button>

                        <div className="relative">
                            <select
                                value={sortKey}
                                onChange={(event) => onSortChange(event.target.value as typeof sortKey)}
                                className="min-w-[170px] appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-8 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                <option value="relevance">Mas relevantes</option>
                                <option value="rating">Mejor reputacion</option>
                                <option value="distance">Mas cercanos</option>
                                <option value="name">Nombre (A-Z)</option>
                            </select>
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">{resultsCountLabel}</p>
                {currentView === 'map' ? (
                    <p className="text-xs text-slate-500">
                        {mappableResultsCount} de {totalVisibleResults} resultados visibles con punto en mapa
                    </p>
                ) : null}
            </div>
        </>
    );
}
