import { Link } from 'react-router-dom';
import { getDisplayInitial } from './helpers';
import type { NearbyBusiness } from './types';

interface NearbyBusinessesSectionProps {
    businesses: NearbyBusiness[];
    loading: boolean;
}

export function NearbyBusinessesSection({ businesses, loading }: NearbyBusinessesSectionProps) {
    return (
        <div className="panel-premium p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Exploracion cercana</p>
                    <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">Negocios cerca de aqui</h2>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {businesses.length} resultado{businesses.length === 1 ? '' : 's'}
                </span>
            </div>
            <div className="mt-5">
                {loading ? (
                    <p className="text-sm text-slate-500">Cargando negocios cercanos...</p>
                ) : businesses.length > 0 ? (
                    <div className="space-y-3">
                        {businesses.map((nearbyBusiness) => {
                            const parsedDistance = Number(nearbyBusiness.distance);
                            const distanceLabel = Number.isFinite(parsedDistance)
                                ? `${parsedDistance.toFixed(1)} km`
                                : null;

                            return (
                                <Link
                                    key={nearbyBusiness.id}
                                    to={`/businesses/${nearbyBusiness.slug || nearbyBusiness.id}`}
                                    className="group flex items-center gap-4 rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
                                >
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-semibold text-emerald-700">
                                        {getDisplayInitial(nearbyBusiness.name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-slate-900 transition-colors group-hover:text-emerald-700">
                                            {nearbyBusiness.name}
                                        </p>
                                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                            {nearbyBusiness.address || 'Direccion no disponible'}
                                        </p>
                                    </div>
                                    {distanceLabel ? (
                                        <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                            {distanceLabel}
                                        </span>
                                    ) : null}
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">No hay resultados cercanos para mostrar.</p>
                )}
            </div>
        </div>
    );
}
