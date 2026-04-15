import type { ListingViewMode, Province } from './types';

interface ListingControlsBarProps {
    activeFilterCount: number;
    currentProvince: string;
    currentView: ListingViewMode;
    filtersOpen: boolean;
    mappableResultsCount: number;
    onMapIntent?: () => void;
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
    activeFilterCount,
    currentProvince,
    currentView,
    filtersOpen,
    mappableResultsCount,
    onMapIntent,
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
        <div className="results-toolbar">
            <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:items-center">
                <label className="relative flex-1">
                    <span className="sr-only">Buscar negocios</span>
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="16.65" y1="16.65" x2="21" y2="21" />
                        </svg>
                    </span>
                    <input
                        id="businesses-search"
                        type="text"
                        placeholder="Buscar restaurantes, colmados o servicios"
                        value={searchInput}
                        onChange={(event) => onSearchInputChange(event.target.value)}
                        className="input-field py-3 pl-10 pr-4"
                    />
                </label>

                <label className="relative xl:w-72">
                    <span className="sr-only">Filtrar por provincia</span>
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10z" />
                            <circle cx="12" cy="11" r="2.5" />
                        </svg>
                    </span>
                    <select
                        id="businesses-province-top"
                        value={currentProvince}
                        onChange={(event) => onProvinceChange(event.target.value)}
                        className="input-field appearance-none py-3 pl-10 pr-10"
                    >
                        <option value="">Toda Republica Dominicana</option>
                        {provinces.map((province) => (
                            <option key={province.id} value={province.id}>
                                {province.name}
                            </option>
                        ))}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </label>

                <label className="relative xl:w-64">
                    <span className="sr-only">Ordenar resultados</span>
                    <select
                        value={sortKey}
                        onChange={(event) => onSortChange(event.target.value as typeof sortKey)}
                        className="input-field appearance-none py-3 pl-4 pr-10"
                    >
                        <option value="relevance">Mas relevantes</option>
                        <option value="rating">Mejor reputacion</option>
                        <option value="distance">Mas cercanos</option>
                        <option value="name">Nombre (A-Z)</option>
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={onToggleFilters}
                    aria-controls="filters-panel-mobile"
                    aria-expanded={filtersOpen}
                    aria-haspopup="dialog"
                    className="btn-secondary px-4 py-2.5"
                >
                    Filtros
                    {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </button>

                <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                    <button
                        type="button"
                        onClick={() => onViewModeChange('list')}
                        aria-pressed={currentView === 'list'}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                            currentView === 'list' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Lista
                    </button>
                    <button
                        type="button"
                        onClick={() => onViewModeChange('map')}
                        onMouseEnter={onMapIntent}
                        onFocus={onMapIntent}
                        aria-pressed={currentView === 'map'}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                            currentView === 'map' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        Mapa
                    </button>
                </div>

                <span className="chip !bg-white !text-slate-700">{resultsCountLabel}</span>
                {activeFilterCount > 0 ? (
                    <span className="chip !bg-white !text-slate-700">{activeFilterCount} filtros activos</span>
                ) : null}
                {currentView === 'map' ? (
                    <span className="chip !bg-white !text-slate-700">
                        {mappableResultsCount} de {totalVisibleResults} visibles en mapa
                    </span>
                ) : null}
            </div>
        </div>
    );
}
