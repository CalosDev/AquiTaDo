import { useMemo } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

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
};

function average(values: number[]): number {
    if (values.length === 0) {
        return 18.4861;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function BusinessesMap({ businesses }: BusinessesMapProps) {
    const mappableBusinesses = useMemo(
        () => businesses.filter(
            (business) => typeof business.latitude === 'number' && typeof business.longitude === 'number',
        ) as Array<MapBusiness & { latitude: number; longitude: number }>,
        [businesses],
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
            <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                No hay coordenadas suficientes para mostrar este resultado en mapa.
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={12}
                scrollWheelZoom={false}
                className="h-[420px] w-full"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {mappableBusinesses.map((business) => (
                    <CircleMarker
                        key={business.id}
                        center={[business.latitude, business.longitude]}
                        radius={10}
                        pathOptions={{
                            color: business.verified ? '#0f766e' : '#475569',
                            fillColor: business.openNow ? '#16a34a' : '#0284c7',
                            fillOpacity: 0.8,
                            weight: 2,
                        }}
                    >
                        <Popup>
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-gray-900">{business.name}</p>
                                <p className="text-xs text-gray-600">{business.address}</p>
                                {business.distanceKm ? (
                                    <p className="text-xs text-primary-700">{business.distanceKm.toFixed(1)} km</p>
                                ) : null}
                                {business.priceRange ? (
                                    <p className="text-xs text-gray-500">{business.priceRange}</p>
                                ) : null}
                                {business.openNow !== null && business.openNow !== undefined ? (
                                    <p className={`text-xs font-medium ${business.openNow ? 'text-green-700' : 'text-gray-500'}`}>
                                        {business.openNow ? 'Abierto ahora' : 'Cerrado ahora'}
                                    </p>
                                ) : null}
                                <a
                                    href={`/businesses/${business.slug || business.id}`}
                                    className="inline-flex text-xs font-medium text-primary-700 underline underline-offset-2"
                                >
                                    Ver negocio
                                </a>
                            </div>
                        </Popup>
                    </CircleMarker>
                ))}
            </MapContainer>
        </div>
    );
}
