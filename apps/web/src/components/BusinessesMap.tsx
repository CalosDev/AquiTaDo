import 'leaflet/dist/leaflet.css';
import { LatLngBounds } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';

const MAP_MARKER_COLORS = {
    selectedStroke: '#002d62',
    selectedFill: '#ce1126',
    verifiedStroke: '#002d62',
    defaultStroke: '#64748b',
    openFill: '#1d4ed8',
    defaultFill: '#60a5fa',
} as const;

type MapBusiness = {
    id: string;
    name: string;
    slug: string;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    verified?: boolean;
    distanceKm?: number | null;
    priceRange?: string | null;
    openNow?: boolean | null;
};

type BusinessesMapProps = {
    businesses: MapBusiness[];
    selectedBusinessId?: string | null;
    onSelectBusiness?: (businessId: string) => void;
    onOpenBusiness?: (businessId: string) => void;
    emptyLabel?: string;
};

function average(values: number[]): number {
    if (values.length === 0) {
        return 18.4861;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function BusinessesMap({
    businesses,
    selectedBusinessId = null,
    onSelectBusiness,
    onOpenBusiness,
    emptyLabel,
}: BusinessesMapProps) {
    const mappableBusinesses = useMemo(
        () => businesses.filter(
            (business) => typeof business.latitude === 'number' && typeof business.longitude === 'number',
        ) as Array<MapBusiness & { latitude: number; longitude: number }>,
        [businesses],
    );

    const selectedBusiness = useMemo(
        () => mappableBusinesses.find((business) => business.id === selectedBusinessId) ?? null,
        [mappableBusinesses, selectedBusinessId],
    );

    const center = useMemo(() => {
        if (mappableBusinesses.length === 0) {
            return { lat: 18.4861, lng: -69.9312 };
        }

        return {
            lat: average(mappableBusinesses.map((business) => business.latitude)),
            lng: average(mappableBusinesses.map((business) => business.longitude)),
        };
    }, [mappableBusinesses]);

    if (mappableBusinesses.length === 0) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
                {emptyLabel || 'No hay coordenadas suficientes para mostrar este resultado en mapa.'}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-primary-100/80 bg-white shadow-sm">
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={12}
                scrollWheelZoom={false}
                className="h-[420px] w-full"
            >
                <MapViewportSync
                    businesses={mappableBusinesses}
                    selectedBusinessId={selectedBusiness?.id ?? null}
                />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {mappableBusinesses.map((business) => (
                    <CircleMarker
                        key={business.id}
                        center={[business.latitude, business.longitude]}
                        radius={business.id === selectedBusiness?.id ? 12 : 9}
                        pathOptions={{
                            color: business.id === selectedBusiness?.id
                                ? MAP_MARKER_COLORS.selectedStroke
                                : business.verified
                                    ? MAP_MARKER_COLORS.verifiedStroke
                                    : MAP_MARKER_COLORS.defaultStroke,
                            fillColor: business.id === selectedBusiness?.id
                                ? MAP_MARKER_COLORS.selectedFill
                                : business.openNow
                                    ? MAP_MARKER_COLORS.openFill
                                    : MAP_MARKER_COLORS.defaultFill,
                            fillOpacity: business.id === selectedBusiness?.id ? 0.95 : 0.8,
                            weight: business.id === selectedBusiness?.id ? 3 : 2,
                        }}
                        eventHandlers={onSelectBusiness ? {
                            click: () => onSelectBusiness(business.id),
                        } : undefined}
                    >
                        <Popup>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-slate-900">{business.name}</p>
                                <p className="text-xs text-slate-600">{business.address}</p>
                                {business.distanceKm ? (
                                    <p className="text-xs text-primary-700">{business.distanceKm.toFixed(1)} km</p>
                                ) : null}
                                {business.priceRange ? (
                                    <p className="text-xs text-slate-500">{business.priceRange}</p>
                                ) : null}
                                {business.openNow !== null && business.openNow !== undefined ? (
                                    <p className={`text-xs font-medium ${business.openNow ? 'text-primary-700' : 'text-slate-500'}`}>
                                        {business.openNow ? 'Abierto ahora' : 'Cerrado ahora'}
                                    </p>
                                ) : null}
                                <Link
                                    to={`/businesses/${business.slug || business.id}`}
                                    onClick={() => onOpenBusiness?.(business.id)}
                                    className="inline-flex text-xs font-medium text-primary-700 underline underline-offset-2"
                                >
                                    Ver negocio
                                </Link>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MapContainer>
        </div>
    );
}

function MapViewportSync({
    businesses,
    selectedBusinessId,
}: {
    businesses: Array<MapBusiness & { latitude: number; longitude: number }>;
    selectedBusinessId?: string | null;
}) {
    const map = useMap();

    useEffect(() => {
        if (businesses.length === 0) {
            return;
        }

        const selectedBusiness = selectedBusinessId
            ? businesses.find((business) => business.id === selectedBusinessId)
            : null;

        if (selectedBusiness) {
            map.flyTo([selectedBusiness.latitude, selectedBusiness.longitude], Math.max(map.getZoom(), 14), {
                animate: true,
                duration: 0.6,
            });
            return;
        }

        if (businesses.length === 1) {
            map.setView([businesses[0].latitude, businesses[0].longitude], 14);
            return;
        }

        const bounds = new LatLngBounds(
            businesses.map((business) => [business.latitude, business.longitude] as [number, number]),
        );
        map.fitBounds(bounds, {
            padding: [36, 36],
            maxZoom: 13,
        });
    }, [businesses, map, selectedBusinessId]);

    return null;
}
