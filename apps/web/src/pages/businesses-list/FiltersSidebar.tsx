import type { Category, City, Province, Sector } from './types';
import { formatPublicCategoryIcon, formatPublicCategoryName } from '../../lib/categoryLabel';
import { ActionBar, AppCard, InlineNotice } from '../../components/ui';
import IntentionFilter from './IntentionFilter';
import LocationFilter from './LocationFilter';

interface FiltersSidebarProps {
    activeFilterChips: string[];
    categoryOptions: Category[];
    cities: City[];
    currentCategory: string;
    currentCity: string;
    currentFeature: string;
    currentLatitude: number | null;
    currentLongitude: number | null;
    currentProvince: string;
    currentRadiusKm: number;
    currentSector: string;
    currentIntentions: string[];
    filtersOpen: boolean;
    loading: boolean;
    onClearFilters: () => void;
    onClose: () => void;
    onFeatureChange: (value: string) => void;
    onGeoFilterChange: (latitude: number, longitude: number, distance: number) => void;
    onGeoFilterClear: () => void;
    onIntentionChange: (intentionId: string, selected: boolean) => void;
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
    currentLatitude,
    currentLongitude,
    currentProvince,
    currentRadiusKm,
    currentSector,
    currentIntentions,
    filtersOpen,
    loading,
    onClearFilters,
    onClose,
    onFeatureChange,
    onGeoFilterChange,
    onGeoFilterClear,
    onIntentionChange,
    onTrackedFilterChange,
    provinces,
    sectors,
}: FiltersSidebarProps) {
    const renderFiltersPanel = (panelId: string, titleId: string) => (
        <AppCard
            title="Refina tu busqueda"
            description="Ajusta ubicacion, categoria y disponibilidad sin perder el contexto del listado."
            className="card-filter density-medium space-y-5"
            actions={(
                <ActionBar className="justify-end">
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className="btn-ghost text-xs"
                    >
                        Limpiar
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-ghost h-11 w-11 p-0 lg:hidden"
                        aria-label="Cerrar filtros"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 18 18 6M6 6l12 12" />
                        </svg>
                    </button>
                </ActionBar>
            )}
        >
            <div id={panelId} aria-labelledby={titleId}>
                <span id={titleId} className="sr-only">
                    Refina tu busqueda
                </span>

                {activeFilterChips.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {activeFilterChips.map((chip) => (
                            <span key={chip} className="chip !bg-white !text-slate-700">
                                {chip}
                            </span>
                        ))}
                    </div>
                ) : (
                    <InlineNotice
                        body="Todavia no has aplicado filtros avanzados."
                        className="mb-1"
                    />
                )}

            <section className="space-y-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Categorias</p>
                    <p className="mt-1 text-sm text-slate-600">Elige una categoria principal para recortar el directorio.</p>
                </div>
                {loading ? (
                    <div className="space-y-2" aria-hidden="true">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div key={`category-skeleton-${index}`} className="h-9 rounded-2xl bg-white/80" />
                        ))}
                    </div>
                ) : (
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {categoryOptions.map((category) => (
                            <label
                                key={category.id}
                                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                            >
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
                )}
            </section>

            <section className="space-y-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Intenciones</p>
                    <p className="mt-1 text-sm text-slate-600">Activa senales rapidas sin escribir filtros manuales.</p>
                </div>
                <IntentionFilter
                    selectedIntentions={currentIntentions}
                    onIntentionChange={onIntentionChange}
                />
            </section>

            <section className="space-y-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Cerca de ti</p>
                    <p className="mt-1 text-sm text-slate-600">Ordena el discovery por cercania cuando quieras explorar por contexto real.</p>
                </div>
                <LocationFilter
                    currentLatitude={currentLatitude}
                    currentLongitude={currentLongitude}
                    currentDistance={currentRadiusKm}
                    disabled={loading}
                    onLocationChange={onGeoFilterChange}
                    onClearLocation={onGeoFilterClear}
                />
            </section>

            <section className="space-y-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ubicacion</p>
                    <p className="mt-1 text-sm text-slate-600">Provincia, ciudad y sector se encadenan para no sobrecargar el listado.</p>
                </div>
                <div className="space-y-3">
                    <select
                        id="businesses-province"
                        value={currentProvince}
                        onChange={(event) => onTrackedFilterChange('provinceId', event.target.value, { source: 'sidebar-province' })}
                        disabled={loading}
                        className="input-field"
                    >
                        <option value="">{loading ? 'Cargando provincias...' : 'Todas las provincias'}</option>
                        {provinces.map((province) => (
                            <option key={province.id} value={province.id}>
                                {province.name}
                                {typeof province._count?.businesses === 'number' ? ` (${province._count.businesses})` : ''}
                            </option>
                        ))}
                    </select>

                    <select
                        id="businesses-city"
                        value={currentCity}
                        onChange={(event) => onTrackedFilterChange('cityId', event.target.value, { source: 'sidebar-city' })}
                        disabled={loading || !currentProvince}
                        className="input-field disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <option value="">
                            {loading ? 'Cargando ciudades...' : currentProvince ? 'Todas las ciudades' : 'Selecciona una provincia'}
                        </option>
                        {cities.map((city) => (
                            <option key={city.id} value={city.id}>
                                {city.name}
                                {typeof city._count?.businesses === 'number' ? ` (${city._count.businesses})` : ''}
                            </option>
                        ))}
                    </select>

                    <select
                        id="businesses-sector"
                        value={currentSector}
                        onChange={(event) => onTrackedFilterChange('sectorId', event.target.value, { source: 'sidebar-sector' })}
                        disabled={loading || !currentCity || sectors.length === 0}
                        className="input-field disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <option value="">
                            {loading ? 'Cargando sectores...' : currentCity ? 'Todos los sectores' : 'Selecciona una ciudad'}
                        </option>
                        {sectors.map((sector) => (
                            <option key={sector.id} value={sector.id}>
                                {sector.name}
                                {typeof sector._count?.businesses === 'number' ? ` (${sector._count.businesses})` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </section>

            <section className="space-y-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Servicios</p>
                    <p className="mt-1 text-sm text-slate-600">Usa palabras clave concretas como delivery, parqueo o pet friendly.</p>
                </div>
                <input
                    id="businesses-feature"
                    type="text"
                    placeholder="Ej: delivery, parqueo, pet friendly"
                    value={currentFeature}
                    onChange={(event) => onFeatureChange(event.target.value)}
                    disabled={loading}
                    className="input-field"
                />
            </section>
            </div>
        </AppCard>
    );

    return (
        <>
            <aside className="discovery-sidebar hidden lg:block">
                {renderFiltersPanel('filters-panel-desktop', 'filters-panel-title-desktop')}
            </aside>

            {filtersOpen ? (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
                        aria-label="Cerrar filtros"
                        onClick={onClose}
                    />
                    <aside
                        className="fixed inset-y-0 right-0 z-40 w-full max-w-sm p-3 lg:hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="filters-panel-title-mobile"
                    >
                        <div className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto">
                            {renderFiltersPanel('filters-panel-mobile', 'filters-panel-title-mobile')}
                        </div>
                    </aside>
                </>
            ) : null}
        </>
    );
}
