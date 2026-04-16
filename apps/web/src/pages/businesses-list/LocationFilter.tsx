import React, { useEffect, useState } from 'react';

interface LocationFilterProps {
  onLocationChange: (latitude: number, longitude: number, distance: number) => void;
  onClearLocation: () => void;
  currentDistance?: number;
  disabled?: boolean;
}

interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const LocationFilter: React.FC<LocationFilterProps> = ({
  onLocationChange,
  onClearLocation,
  currentDistance = 5,
  disabled = false,
}) => {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [distance, setDistance] = useState(currentDistance);
  const [isActive, setIsActive] = useState(false);

  const requestGeolocation = () => {
    setLoading(true);
    setError('');

    if (!navigator.geolocation) {
      setError('Geolocalización no disponible en tu navegador');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const coords = { latitude, longitude, accuracy };
        setLocation(coords);
        setIsActive(true);
        onLocationChange(latitude, longitude, distance);
        setLoading(false);
      },
      (err) => {
        let errorMessage = 'No se pudo obtener tu ubicación';
        if (err.code === err.PERMISSION_DENIED) {
          errorMessage = 'Permiso de ubicación denegado. Habilítalo en la configuración del navegador.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMessage = 'Información de ubicación no disponible';
        } else if (err.code === err.TIMEOUT) {
          errorMessage = 'Tiempo de espera agotado al obtener ubicación';
        }
        setError(errorMessage);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  };

  const handleDistanceChange = (newDistance: number) => {
    setDistance(newDistance);
    if (location && isActive) {
      onLocationChange(location.latitude, location.longitude, newDistance);
    }
  };

  const handleClear = () => {
    setLocation(null);
    setIsActive(false);
    setError('');
    onClearLocation();
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">📍 Búsqueda por Proximidad</h3>
        <p className="mt-1 text-xs text-slate-600">
          Encuentra negocios cercanos a tu ubicación actual.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </div>
      )}

      {!isActive ? (
        <button
          type="button"
          onClick={requestGeolocation}
          disabled={disabled || loading}
          className={`w-full rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition ${
            loading
              ? 'border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed'
              : 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
          }`}
        >
          {loading ? (
            <>
              <span className="inline-block animate-spin mr-2">⏳</span>
              Obteniendo ubicación...
            </>
          ) : (
            <>
              <span className="mr-2">📍</span>
              Usar mi ubicación
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <p className="font-semibold text-primary-900">✅ Ubicación activa</p>
              <p className="mt-1 text-primary-700">
                Precisión: ±{Math.round(location?.accuracy || 0)}m
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100 transition"
            >
              Limpiar
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="distance-slider" className="text-xs font-semibold text-primary-900">
                Radio de búsqueda
              </label>
              <span className="text-sm font-bold text-primary-700">{distance} km</span>
            </div>
            <input
              id="distance-slider"
              type="range"
              min="1"
              max="50"
              value={distance}
              onChange={(e) => handleDistanceChange(Number(e.target.value))}
              className="w-full"
              aria-label="Radio de búsqueda en kilómetros"
            />
            <div className="flex justify-between text-xs text-primary-600">
              <span>1 km</span>
              <span>50 km</span>
            </div>
          </div>

          <p className="text-xs text-primary-600">
            Mostrando negocios dentro de {distance} km de tu ubicación.
          </p>
        </div>
      )}
    </div>
  );
};

export default LocationFilter;
