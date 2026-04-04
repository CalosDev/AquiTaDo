import type { Category, City, Province, Sector } from './types';
import { formatPublicCategoryIcon, formatPublicCategoryName } from '../../lib/categoryLabel';

interface FiltersSidebarProps {
    activeFilterChips: string[];
    categoryOptions: Category[];
    cities: City[];
    currentCategory: string;
    currentCity: string;
    currentFeature: string;
    currentOpenNow: boolean;
    currentProvince: string;
    currentSector: string;
    currentVerified: boolean;
    filtersOpen: boolean;
    onClearFilters: () => void;
    onFeatureChange: (value: string) => void;
    onTrackedFilterChange: (key: string, value: string, metadata: { source: string }) => void;
    provinces: Province[];
    sectors: Sector[];
}

export function FiltersSidebar({
    activeFilterChips,
    categoryOptions,
    cities,
    currentCategory,
    currentCity,
    currentFeature,
    currentOpenNow,
    currentProvince,
    currentSector,
    currentVerified,
    filtersOpen,
    onClearFilters,
    onFeatureChange,
    onTrackedFilterChange,
    provinces,
    sectors,
}: FiltersSidebarProps) {
    return (
        <aside className={`${filtersOpen ? 'block' : 'hidden'} lg:block`}>
            <div id="filters-panel" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-900">Filtros</h2>
                        {activeFilterChips.length > 0 ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {activeFilterChips.length}
                            </span>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className="text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                    >
                        Limpiar
                    </button>
                </div>

                {activeFilterChips.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {activeFilterChips.map((chip) => (
                            <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                                {chip}
                            </span>
                        ))}
                    </div>
                ) : null}

                <div className="mt-5 space-y-6">
                    <section>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categorias</p>
                        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
                            {categoryOptions.map((category) => (
                                <label key={category.id} className="flex items-center gap-2 text-sm text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={currentCategory === category.id}
                                        onChange={(event) => onTrackedFilterChange('categoryId', event.target.checked ? category.id : '', { source: 'sidebar-category' })}
                                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
                                    />
                                    <span>
                                        {formatPublicCategoryIcon(category.icon) ? `${formatPublicCategoryIcon(category.icon)} ` : ''}
                                        {formatPublicCategoryName(category.name)}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </section>

                    <section>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ubicacion</p>
                        <div className="mt-3 space-y-3">
                            <select
                                id="businesses-province"
                                value={currentProvince}
                                onChange={(event) => onTrackedFilterChange('provinceId', event.target.value, { source: 'sidebar-province' })}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            >
                                <option value="">Todas las provincias</option>
                                {provinces.map((province) => (
                                    <option key={province.id} value={province.id}>
                                        {province.name}
                                    </option>
                                ))}
                            </select>

                            <select
                                id="businesses-city"
                                value={currentCity}
                                onChange={(event) => onTrackedFilterChange('cityId', event.target.value, { source: 'sidebar-city' })}
                                disabled={!currentProvince}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                                <option value="">{currentProvince ? 'Todas las ciudades' : 'Selecciona una provincia'}</option>
                                {cities.map((city) => (
                                    <option key={city.id} value={city.id}>
                                        {city.name}
                                    </option>
                                ))}
                            </select>

                            <select
                                id="businesses-sector"
                                value={currentSector}
                                onChange={(event) => onTrackedFilterChange('sectorId', event.target.value, { source: 'sidebar-sector' })}
                                disabled={!currentCity || sectors.length === 0}
                                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                                <option value="">{currentCity ? 'Todos los sectores' : 'Selecciona una ciudad'}</option>
                                {sectors.map((sector) => (
                                    <option key={sector.id} value={sector.id}>
                                        {sector.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </section>

                    <section>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Servicios</p>
                        <div className="mt-3">
                            <input
                                id="businesses-feature"
                                type="text"
                                placeholder="Ej: delivery, parqueo, pet friendly"
                                value={currentFeature}
                                onChange={(event) => onFeatureChange(event.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                            />
                        </div>
                    </section>

                    <section>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Disponibilidad</p>
                        <div className="mt-3 space-y-2">
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={currentOpenNow}
                                    onChange={(event) => onTrackedFilterChange('openNow', event.target.checked ? 'true' : '', { source: 'sidebar-open-now' })}
                                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
                                />
                                Abierto ahora
                            </label>
                            <label className="flex items-center gap-2 text-sm text-slate-600">
                                <input
                                    type="checkbox"
                                    checked={currentVerified}
                                    onChange={(event) => onTrackedFilterChange('verified', event.target.checked ? 'true' : '', { source: 'sidebar-verified' })}
                                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
                                />
                                Verificados
                            </label>
                        </div>
                    </section>
                </div>
            </div>
        </aside>
    );
}
