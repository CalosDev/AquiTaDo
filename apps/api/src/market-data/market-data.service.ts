import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { ObservabilityService } from '../observability/observability.service';

type CachedValue<T> = {
    value: T;
    expiresAt: number;
};

type CurrentWeatherResponse = {
    provider: 'open-meteo';
    coordinates: {
        lat: number;
        lng: number;
    };
    observedAt: string;
    temperatureC: number;
    feelsLikeC: number | null;
    humidityPct: number | null;
    precipitationMm: number | null;
    windKmh: number | null;
    weatherCode: number | null;
    weatherLabel: string;
    isDay: boolean | null;
};

type ExchangeRateResponse = {
    provider: 'frankfurter';
    base: string;
    target: string;
    rate: number;
    amount: number;
    convertedAmount: number;
    observedOn: string;
};

@Injectable()
export class MarketDataService {
    private readonly logger = new Logger(MarketDataService.name);
    private readonly cacheTtlMs: number;
    private readonly requestTimeoutMs: number;
    private readonly openMeteoBaseUrl: string;
    private readonly frankfurterBaseUrl: string;
    private readonly weatherCache = new Map<string, CachedValue<CurrentWeatherResponse>>();
    private readonly fxCache = new Map<string, CachedValue<ExchangeRateResponse>>();

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(CircuitBreakerService)
        private readonly circuitBreakerService: CircuitBreakerService,
        @Inject(ObservabilityService)
        private readonly observabilityService: ObservabilityService,
    ) {
        this.cacheTtlMs = this.resolvePositiveInt('EXTERNAL_DATA_CACHE_TTL_SECONDS', 600) * 1000;
        this.requestTimeoutMs = this.resolvePositiveInt('EXTERNAL_DATA_TIMEOUT_MS', 3500);
        this.openMeteoBaseUrl = this.configService.get<string>('OPEN_METEO_BASE_URL')?.trim()
            || 'https://api.open-meteo.com';
        this.frankfurterBaseUrl = this.configService.get<string>('FRANKFURTER_BASE_URL')?.trim()
            || 'https://api.frankfurter.app';
    }

    async getCurrentWeather(lat: number, lng: number): Promise<CurrentWeatherResponse> {
        const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
        const cached = this.getValidCache(this.weatherCache, cacheKey);
        if (cached) {
            return cached;
        }

        const response = await this.circuitBreakerService.execute(
            'open-meteo.weather',
            async () => this.fetchCurrentWeather(lat, lng),
        );
        this.weatherCache.set(cacheKey, {
            value: response,
            expiresAt: Date.now() + this.cacheTtlMs,
        });
        return response;
    }

    async getExchangeRate(
        base: string,
        target: string,
        amount: number,
    ): Promise<ExchangeRateResponse> {
        const normalizedBase = base.toUpperCase();
        const normalizedTarget = target.toUpperCase();
        const cacheKey = `${normalizedBase}:${normalizedTarget}:${amount.toFixed(4)}`;
        const cached = this.getValidCache(this.fxCache, cacheKey);
        if (cached) {
            return cached;
        }

        const response = await this.circuitBreakerService.execute(
            'frankfurter.exchange-rate',
            async () => this.fetchExchangeRate(normalizedBase, normalizedTarget, amount),
        );
        this.fxCache.set(cacheKey, {
            value: response,
            expiresAt: Date.now() + this.cacheTtlMs,
        });
        return response;
    }

    private async fetchCurrentWeather(lat: number, lng: number): Promise<CurrentWeatherResponse> {
        const startedAt = Date.now();
        let success = true;

        try {
            const url = new URL('/v1/forecast', this.openMeteoBaseUrl);
            url.searchParams.set('latitude', lat.toString());
            url.searchParams.set('longitude', lng.toString());
            url.searchParams.set(
                'current',
                [
                    'temperature_2m',
                    'relative_humidity_2m',
                    'apparent_temperature',
                    'is_day',
                    'precipitation',
                    'weather_code',
                    'wind_speed_10m',
                ].join(','),
            );
            url.searchParams.set('timezone', 'auto');

            const payload = await this.getJsonWithTimeout(url.toString());
            const current = payload?.current ?? {};
            const observedAt = typeof current.time === 'string'
                ? current.time
                : new Date().toISOString();

            const weatherCode = this.coerceNumber(current.weather_code);
            return {
                provider: 'open-meteo',
                coordinates: {
                    lat,
                    lng,
                },
                observedAt,
                temperatureC: this.coerceNumber(current.temperature_2m) ?? 0,
                feelsLikeC: this.coerceNumber(current.apparent_temperature),
                humidityPct: this.coerceNumber(current.relative_humidity_2m),
                precipitationMm: this.coerceNumber(current.precipitation),
                windKmh: this.coerceNumber(current.wind_speed_10m),
                weatherCode,
                weatherLabel: this.resolveWeatherLabel(weatherCode),
                isDay: typeof current.is_day === 'number'
                    ? current.is_day === 1
                    : null,
            };
        } catch (error) {
            success = false;
            this.logger.warn(
                `Open-Meteo request failed (${error instanceof Error ? error.message : String(error)})`,
            );
            throw new ServiceUnavailableException('No se pudo consultar el clima en este momento');
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'open-meteo',
                'current-weather',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private async fetchExchangeRate(
        base: string,
        target: string,
        amount: number,
    ): Promise<ExchangeRateResponse> {
        const startedAt = Date.now();
        let success = true;

        try {
            const url = new URL('/latest', this.frankfurterBaseUrl);
            url.searchParams.set('from', base);
            url.searchParams.set('to', target);

            const payload = await this.getJsonWithTimeout(url.toString());
            const rateValue = this.coerceNumber(payload?.rates?.[target]);
            const dateValue = typeof payload?.date === 'string'
                ? payload.date
                : new Date().toISOString().slice(0, 10);

            if (rateValue === null || rateValue <= 0) {
                throw new Error('Invalid exchange rate payload');
            }

            return {
                provider: 'frankfurter',
                base,
                target,
                rate: rateValue,
                amount,
                convertedAmount: Number((rateValue * amount).toFixed(4)),
                observedOn: dateValue,
            };
        } catch (error) {
            success = false;
            this.logger.warn(
                `Frankfurter request failed (${error instanceof Error ? error.message : String(error)})`,
            );
            throw new ServiceUnavailableException('No se pudo consultar la tasa de cambio en este momento');
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'frankfurter',
                'exchange-rate',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private async getJsonWithTimeout(url: string): Promise<any> {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), this.requestTimeoutMs);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private resolveWeatherLabel(weatherCode: number | null): string {
        if (weatherCode === null) {
            return 'Condicion no disponible';
        }

        const labelsByCode: Record<number, string> = {
            0: 'Despejado',
            1: 'Mayormente despejado',
            2: 'Parcialmente nublado',
            3: 'Nublado',
            45: 'Neblina',
            48: 'Neblina densa',
            51: 'Llovizna ligera',
            53: 'Llovizna moderada',
            55: 'Llovizna intensa',
            61: 'Lluvia ligera',
            63: 'Lluvia moderada',
            65: 'Lluvia intensa',
            71: 'Nieve ligera',
            73: 'Nieve moderada',
            75: 'Nieve intensa',
            80: 'Aguaceros ligeros',
            81: 'Aguaceros moderados',
            82: 'Aguaceros fuertes',
            95: 'Tormenta electrica',
            96: 'Tormenta con granizo ligero',
            99: 'Tormenta con granizo fuerte',
        };

        return labelsByCode[weatherCode] || 'Condicion variable';
    }

    private getValidCache<T>(cache: Map<string, CachedValue<T>>, cacheKey: string): T | null {
        const entry = cache.get(cacheKey);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt <= Date.now()) {
            cache.delete(cacheKey);
            return null;
        }

        return entry.value;
    }

    private resolvePositiveInt(key: string, fallbackValue: number): number {
        const raw = this.configService.get<string>(key)?.trim();
        if (!raw) {
            return fallbackValue;
        }

        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return fallbackValue;
        }

        return parsed;
    }

    private coerceNumber(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
    }
}
