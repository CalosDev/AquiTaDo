import { useEffect, useState } from 'react';

interface LocationFilterProps {
  onLocationChange: (latitude: number, longitude: number, distance: number) => void;
  onClearLocation: () => void;
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  currentDistance?: number;
  disabled?: boolean;
}

interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
}

function LocationFilter({
  onLocationChange,
  onClearLocation,
  currentLatitude,
  currentLongitude,
  currentDistance = 5,
  disabled = false,
}: LocationFilterProps) {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [distance, setDistance] = useState(currentDistance);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    setDistance(currentDistance);
  }, [currentDistance]);

  useEffect(() => {
    if (typeof currentLatitude === 'number' && typeof currentLongitude === 'number') {
      setLocation((previous) => ({
        latitude: currentLatitude,
        longitude: currentLongitude,
        accuracy: previous?.accuracy ?? 0,
      }));
      setIsActive(true);
      return;
    }

    setLocation(null);
    setIsActive(false);
  }, [currentLatitude, currentLongitude]);

  const requestGeolocation = () => {
    setLoading(true);
    setError('');

    if (!navigator.geolocation) {
      setError('La geolocalizacion no esta disponible en tu navegador.');
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
      (nextError) => {
        let errorMessage = 'No se pudo obtener tu ubicacion.';
        if (nextError.code === nextError.PERMISSION_DENIED) {
          errorMessage = 'Permiso de ubicacion denegado. Habilitalo en la configuracion del navegador.';
        } else if (nextError.code === nextError.POSITION_UNAVAILABLE) {
          errorMessage = 'La informacion de ubicacion no esta disponible ahora mismo.';
        } else if (nextError.code === nextError.TIMEOUT) {
          errorMessage = 'Se agoto el tiempo de espera al solicitar la ubicacion.';
        }
        setError(errorMessage);
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      },
    );
  };

  const handleDistanceChange = (nextDistance: number) => {
    setDistance(nextDistance);
    if (location && isActive) {
      onLocationChange(location.latitude, location.longitude, nextDistance);
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
        <h3 className="text-sm font-semibold text-slate-900">Busqueda por proximidad</h3>
        <p className="mt-1 text-xs text-slate-600">
          Usa tu ubicacion para priorizar negocios cercanos sin salir del listado.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </div>
      ) : null}

      {!isActive ? (
        <button
          type="button"
          onClick={requestGeolocation}
          disabled={disabled || loading}
          className={`w-full rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition ${
            loading
              ? 'cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500'
              : 'border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100'
          }`}
        >
          {loading ? (
            <>
              <span className="mr-2 inline-flex h-4 w-4 animate-spin items-center justify-center align-[-2px]" aria-hidden="true">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-3.2-6.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Obteniendo ubicacion...
            </>
          ) : (
            <>
              <span className="mr-2 inline-flex h-4 w-4 items-center justify-center align-[-2px]" aria-hidden="true">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 21s-6-4.35-6-10a6 6 0 0 1 12 0c0 5.65-6 10-6 10z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="11" r="2.5" />
                </svg>
              </span>
              Usar mi ubicacion
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-primary-200 bg-primary-50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <p className="font-semibold text-primary-900">Ubicacion activa</p>
              {location?.accuracy ? (
                <p className="mt-1 text-primary-700">Precision aproximada: +/-{Math.round(location.accuracy)}m</p>
              ) : (
                <p className="mt-1 text-primary-700">Priorizando negocios cercanos para esta busqueda.</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
            >
              Limpiar
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="distance-slider" className="text-xs font-semibold text-primary-900">
                Radio de busqueda
              </label>
              <span className="text-sm font-bold text-primary-700">{distance} km</span>
            </div>
            <input
              id="distance-slider"
              type="range"
              min="1"
              max="50"
              value={distance}
              onChange={(event) => handleDistanceChange(Number(event.target.value))}
              className="w-full"
              aria-label="Radio de busqueda en kilometros"
            />
            <div className="flex justify-between text-xs text-primary-600">
              <span>1 km</span>
              <span>50 km</span>
            </div>
          </div>

          <p className="text-xs text-primary-600">
            Mostrando negocios dentro de {distance} km de tu ubicacion.
          </p>
        </div>
      )}
    </div>
  );
}

export default LocationFilter;
