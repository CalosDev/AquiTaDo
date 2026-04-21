import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { OptimizedImage } from '../../components/OptimizedImage';
import type { Business, ListingViewMode } from './types';

function getDisplayInitial(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : 'N';
}

type BusinessCardTrust = {
    level: 'ALTA' | 'MEDIA' | 'BAJA';
    score: number;
};

type BusinessCardProps = {
    business: Business;
    businessPath: string;
    currentView: ListingViewMode;
    isAuthenticated: boolean;
    isCustomerRole: boolean;
    isFavorite: boolean;
    isFavoriteProcessing: boolean;
    isMappable: boolean;
    isPriorityImage: boolean;
    isSelectedOnMap: boolean;
    locationLabel: string;
    onBusinessClick: (businessId: string) => void;
    onPrefetchBusiness: (business: { id?: string | null; slug?: string | null }) => void;
    onSelectBusiness: (businessId: string) => void;
    onToggleFavorite: (event: MouseEvent<HTMLButtonElement>, businessId: string) => void | Promise<void>;
    priceChip: string | null;
    primaryCategoryPath: string | null;
    ratingDisplay: string | null;
    reviewCount: number;
    secondaryCategoryName: string | null;
    trust: BusinessCardTrust | null;
};

export function BusinessCard({
    business,
    businessPath,
    currentView,
    isAuthenticated,
    isCustomerRole,
    isFavorite,
    isFavoriteProcessing,
    isMappable,
    isPriorityImage,
    isSelectedOnMap,
    locationLabel,
    onBusinessClick,
    onPrefetchBusiness,
    onSelectBusiness,
    onToggleFavorite,
    priceChip,
    primaryCategoryPath,
    ratingDisplay,
    reviewCount,
    secondaryCategoryName,
    trust,
}: BusinessCardProps) {
    const handlePointerPreview = () => {
        onPrefetchBusiness(business);
        if (currentView === 'map' && isMappable) {
            onSelectBusiness(business.id);
        }
    };

    return (
        <Link
            to={businessPath}
            onClick={() => {
                onBusinessClick(business.id);
            }}
            onMouseEnter={handlePointerPreview}
            onFocus={handlePointerPreview}
            className={`group listing-card defer-render-card ${
                isSelectedOnMap
                    ? 'border-primary-300 ring-2 ring-primary-100'
                    : ''
            }`}
        >
            <div className="listing-card-media aspect-[4/3]">
                {business.images?.[0] ? (
                    <OptimizedImage
                        src={business.images[0].url}
                        alt={business.name}
                        className="h-full w-full object-cover"
                        priority={isPriorityImage}
                        sizes="(min-width: 1280px) 26rem, (min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-display font-bold text-slate-300">
                        {getDisplayInitial(business.name)}
                    </div>
                )}
                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    {business.verified ? (
                        <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                            Verificado
                        </span>
                    ) : null}
                    {business.openNow !== null && business.openNow !== undefined ? (
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                            business.openNow ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                            {business.openNow ? 'Abierto' : 'Cerrado'}
                        </span>
                    ) : null}
                </div>
                {isAuthenticated && isCustomerRole ? (
                    <button
                        type="button"
                        onClick={(event) => void onToggleFavorite(event, business.id)}
                        disabled={isFavoriteProcessing}
                        aria-label={
                            isFavorite
                                ? `Quitar ${business.name} de favoritos`
                                : `Guardar ${business.name} en favoritos`
                        }
                        className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${
                            isFavorite
                                ? 'border-primary-600 bg-primary-600 text-white'
                                : 'border-white/80 bg-white/90 text-slate-600 hover:border-primary-300'
                        }`}
                    >
                        {isFavoriteProcessing
                            ? '...'
                            : isFavorite
                                ? 'Guardado'
                                : 'Guardar'}
                    </button>
                ) : null}
            </div>

            <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="truncate text-base font-semibold text-slate-900 transition group-hover:text-primary-700">
                        {business.name}
                    </h2>
                    {priceChip ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {priceChip}
                        </span>
                    ) : null}
                </div>

                {primaryCategoryPath ? (
                    <p className="text-xs text-slate-500">
                        {primaryCategoryPath}
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
                    <span>{locationLabel || business.province?.name || business.address}</span>
                    {business.distanceKm ? (
                        <>
                            <span className="text-slate-400">|</span>
                            <span>{business.distanceKm.toFixed(1)} km</span>
                        </>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                    {secondaryCategoryName ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                            {secondaryCategoryName}
                        </span>
                    ) : null}
                    {business.todayHoursLabel ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                            Hoy: {business.todayHoursLabel}
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
}
