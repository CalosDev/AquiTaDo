import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ObservabilityService } from '../observability/observability.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';

type CachedValue<T> = {
    value: T;
    expiresAt: number;
};

type GeocodeInput = {
    address: string;
    province?: string | null;
    city?: string | null;
};

type GeocodeResult = {
    latitude: number;
    longitude: number;
    formattedAddress: string | null;
    confidence: number | null;
    provider: 'geoapify' | 'nominatim';
};

type PhoneValidationResult = {
    isValid: boolean;
    normalizedPhone: string | null;
    provider: 'local' | 'veriphone';
    countryCode: string | null;
    carrier: string | null;
    lineType: string | null;
    reason: string | null;
};

type VeriphonePayload = {
    phone?: unknown;
    phone_valid?: unknown;
    country_code?: unknown;
    country?: unknown;
    carrier?: unknown;
    phone_type?: unknown;
};

@Injectable()
export class IntegrationsService {
    private readonly logger = new Logger(IntegrationsService.name);
    private readonly cacheTtlMs: number;
    private readonly requestTimeoutMs: number;
    private readonly geoapifyApiKey: string | null;
    private readonly geoapifyBaseUrl: string;
    private readonly geoapifyMinConfidence: number;
    private readonly nominatimEnabled: boolean;
    private readonly nominatimBaseUrl: string;
    private readonly nominatimUserAgent: string;
    private readonly nominatimEmail: string | null;
    private readonly nominatimMinIntervalMs: number;
    private readonly veriphoneApiKey: string | null;
    private readonly veriphoneBaseUrl: string;
    private readonly veriphoneStrictMode: boolean;
    private readonly geocodeCache = new Map<string, CachedValue<GeocodeResult | null>>();
    private readonly phoneValidationCache = new Map<string, CachedValue<PhoneValidationResult>>();
    private nominatimNextAllowedAt = 0;

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
        this.geoapifyApiKey = this.resolveOptionalString('GEOAPIFY_API_KEY');
        this.geoapifyBaseUrl = this.resolveOptionalString('GEOAPIFY_BASE_URL') || 'https://api.geoapify.com';
        this.geoapifyMinConfidence = this.resolveRangeNumber('GEOAPIFY_MIN_CONFIDENCE', 0, 1, 0.65);
        this.nominatimEnabled = this.resolveBooleanLike('NOMINATIM_ENABLED', false);
        this.nominatimBaseUrl = this.resolveOptionalString('NOMINATIM_BASE_URL')
            || 'https://nominatim.openstreetmap.org';
        this.nominatimUserAgent = this.resolveOptionalString('NOMINATIM_USER_AGENT')
            || 'AquiTaDo-Geocoder/1.0 (+https://aquitado.vercel.app)';
        this.nominatimEmail = this.resolveOptionalString('NOMINATIM_EMAIL');
        this.nominatimMinIntervalMs = this.resolvePositiveInt('NOMINATIM_MIN_INTERVAL_MS', 1100);
        this.veriphoneApiKey = this.resolveOptionalString('VERIPHONE_API_KEY');
        this.veriphoneBaseUrl = this.resolveOptionalString('VERIPHONE_BASE_URL') || 'https://api.veriphone.io';
        this.veriphoneStrictMode = this.resolveBooleanLike('VERIPHONE_STRICT_MODE', false);
    }

    async geocodeDominicanAddress(input: GeocodeInput): Promise<GeocodeResult | null> {
        const address = input.address.trim();
        if (address.length === 0) {
            return null;
        }

        const queryParts = [address, input.city?.trim(), input.province?.trim(), 'Republica Dominicana']
            .filter((part): part is string => !!part && part.length > 0);

        const query = queryParts.join(', ');
        const cacheKey = query.toLowerCase();
        const cached = this.getValidCache(this.geocodeCache, cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        let geocode: GeocodeResult | null = null;

        if (this.geoapifyApiKey) {
            try {
                geocode = await this.circuitBreakerService.execute(
                    'geoapify.geocode',
                    async () => this.fetchGeoapifyGeocode(query),
                );
                if (
                    geocode
                    && geocode.confidence !== null
                    && geocode.confidence < this.geoapifyMinConfidence
                ) {
                    geocode = null;
                }
            } catch (error) {
                this.logger.warn(
                    `Geoapify geocoding failed (${error instanceof Error ? error.message : String(error)})`,
                );
            }
        }

        if (!geocode && this.nominatimEnabled) {
            try {
                geocode = await this.circuitBreakerService.execute(
                    'nominatim.geocode',
                    async () => this.fetchNominatimGeocode(query),
                );
            } catch (error) {
                this.logger.warn(
                    `Nominatim geocoding failed (${error instanceof Error ? error.message : String(error)})`,
                );
            }
        }

        this.geocodeCache.set(cacheKey, {
            value: geocode,
            expiresAt: Date.now() + this.cacheTtlMs,
        });

        return geocode;
    }

    async validateDominicanPhone(rawPhone: string): Promise<PhoneValidationResult> {
        const normalizedLocal = this.normalizeDominicanPhone(rawPhone);
        if (!normalizedLocal) {
            return {
                isValid: false,
                normalizedPhone: null,
                provider: 'local',
                countryCode: null,
                carrier: null,
                lineType: null,
                reason: 'Formato invalido para numero dominicano',
            };
        }

        const cached = this.getValidCache(this.phoneValidationCache, normalizedLocal);
        if (cached) {
            return cached;
        }

        let result: PhoneValidationResult;
        if (!this.veriphoneApiKey) {
            result = {
                isValid: true,
                normalizedPhone: normalizedLocal,
                provider: 'local',
                countryCode: 'DO',
                carrier: null,
                lineType: null,
                reason: null,
            };
            this.phoneValidationCache.set(normalizedLocal, {
                value: result,
                expiresAt: Date.now() + this.cacheTtlMs,
            });
            return result;
        }

        try {
            result = await this.circuitBreakerService.execute(
                'veriphone.phone',
                async () => this.fetchVeriphoneValidation(normalizedLocal),
            );
        } catch (error) {
            this.logger.warn(
                `Veriphone validation failed (${error instanceof Error ? error.message : String(error)})`,
            );
            if (this.veriphoneStrictMode) {
                throw new ServiceUnavailableException('No se pudo validar el numero telefonico');
            }
            result = {
                isValid: true,
                normalizedPhone: normalizedLocal,
                provider: 'local',
                countryCode: 'DO',
                carrier: null,
                lineType: null,
                reason: null,
            };
        }

        this.phoneValidationCache.set(normalizedLocal, {
            value: result,
            expiresAt: Date.now() + this.cacheTtlMs,
        });
        return result;
    }

    normalizeDominicanPhone(rawPhone: string): string | null {
        const trimmed = rawPhone.trim();
        if (trimmed.length === 0) {
            return null;
        }

        const digits = trimmed.replace(/\D+/g, '');
        if (/^(809|829|849)\d{7}$/.test(digits)) {
            return `+1${digits}`;
        }

        if (/^1(809|829|849)\d{7}$/.test(digits)) {
            return `+${digits}`;
        }

        return null;
    }

    private async fetchGeoapifyGeocode(query: string): Promise<GeocodeResult | null> {
        const startedAt = Date.now();
        let success = true;

        try {
            const url = new URL('/v1/geocode/search', this.geoapifyBaseUrl);
            url.searchParams.set('text', query);
            url.searchParams.set('filter', 'countrycode:do');
            url.searchParams.set('lang', 'es');
            url.searchParams.set('limit', '1');
            url.searchParams.set('apiKey', this.geoapifyApiKey as string);

            const payload = await this.getJsonWithTimeout(url.toString());
            const parsed = this.parseGeoapifyResult(payload);
            return parsed;
        } catch (error) {
            success = false;
            throw error;
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'geoapify',
                'geocode-search',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private async fetchNominatimGeocode(query: string): Promise<GeocodeResult | null> {
        if (Date.now() < this.nominatimNextAllowedAt) {
            return null;
        }
        this.nominatimNextAllowedAt = Date.now() + this.nominatimMinIntervalMs;

        const startedAt = Date.now();
        let success = true;

        try {
            const url = new URL('/search', this.nominatimBaseUrl);
            url.searchParams.set('format', 'jsonv2');
            url.searchParams.set('limit', '1');
            url.searchParams.set('countrycodes', 'do');
            url.searchParams.set('q', query);
            if (this.nominatimEmail) {
                url.searchParams.set('email', this.nominatimEmail);
            }

            const payload = await this.getJsonWithTimeout(url.toString(), {
                'User-Agent': this.nominatimUserAgent,
            });

            if (!Array.isArray(payload) || payload.length === 0) {
                return null;
            }

            const first = payload[0] as {
                lat?: unknown;
                lon?: unknown;
                display_name?: unknown;
            };
            const lat = this.coerceNumber(first.lat);
            const lng = this.coerceNumber(first.lon);
            if (lat === null || lng === null) {
                return null;
            }
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return null;
            }

            return {
                latitude: lat,
                longitude: lng,
                formattedAddress: typeof first.display_name === 'string'
                    ? first.display_name
                    : null,
                confidence: null,
                provider: 'nominatim',
            };
        } catch (error) {
            success = false;
            throw error;
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'nominatim',
                'geocode-search',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private async fetchVeriphoneValidation(normalizedPhone: string): Promise<PhoneValidationResult> {
        const startedAt = Date.now();
        let success = true;

        try {
            const url = new URL('/v2/verify', this.veriphoneBaseUrl);
            url.searchParams.set('phone', normalizedPhone);
            url.searchParams.set('key', this.veriphoneApiKey as string);

            const payload = (await this.getJsonWithTimeout(url.toString())) as VeriphonePayload;
            const providerIsValid = payload.phone_valid === true;
            const providerCountryCode = typeof payload.country_code === 'string'
                ? payload.country_code.trim().toUpperCase()
                : null;
            const providerPhoneRaw = typeof payload.phone === 'string'
                ? payload.phone
                : normalizedPhone;
            const providerNormalized = this.normalizeDominicanPhone(providerPhoneRaw);
            const isValid = providerIsValid
                && providerCountryCode === 'DO'
                && providerNormalized !== null;

            return {
                isValid,
                normalizedPhone: isValid ? providerNormalized : null,
                provider: 'veriphone',
                countryCode: providerCountryCode,
                carrier: typeof payload.carrier === 'string' ? payload.carrier.trim() : null,
                lineType: typeof payload.phone_type === 'string' ? payload.phone_type.trim() : null,
                reason: isValid ? null : 'Proveedor reporta telefono invalido para RD',
            };
        } catch (error) {
            success = false;
            throw error;
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'veriphone',
                'phone-verify',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private parseGeoapifyResult(payload: unknown): GeocodeResult | null {
        const feature = this.resolveGeoFeature(payload);
        if (!feature) {
            return null;
        }

        const lat = this.coerceNumber(feature.lat);
        const lng = this.coerceNumber(feature.lng);
        if (lat === null || lng === null) {
            return null;
        }
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return null;
        }

        return {
            latitude: lat,
            longitude: lng,
            formattedAddress: feature.formattedAddress,
            confidence: feature.confidence,
            provider: 'geoapify',
        };
    }

    private resolveGeoFeature(payload: unknown): {
        lat: number | null;
        lng: number | null;
        formattedAddress: string | null;
        confidence: number | null;
    } | null {
        if (!payload || typeof payload !== 'object') {
            return null;
        }

        const asRecord = payload as Record<string, unknown>;
        if (Array.isArray(asRecord.features) && asRecord.features.length > 0) {
            return this.parseGeoFeatureEntry(asRecord.features[0]);
        }
        if (Array.isArray(asRecord.results) && asRecord.results.length > 0) {
            return this.parseGeoResultEntry(asRecord.results[0]);
        }
        return null;
    }

    private parseGeoFeatureEntry(entry: unknown): {
        lat: number | null;
        lng: number | null;
        formattedAddress: string | null;
        confidence: number | null;
    } | null {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const feature = entry as {
            geometry?: {
                coordinates?: unknown;
            };
            properties?: {
                formatted?: unknown;
                rank?: {
                    confidence?: unknown;
                };
            };
        };

        let lng: number | null = null;
        let lat: number | null = null;
        const coordinates = feature.geometry?.coordinates;
        if (
            Array.isArray(coordinates)
            && coordinates.length >= 2
        ) {
            lng = this.coerceNumber(coordinates[0]);
            lat = this.coerceNumber(coordinates[1]);
        }

        return {
            lat,
            lng,
            formattedAddress: typeof feature.properties?.formatted === 'string'
                ? feature.properties.formatted
                : null,
            confidence: this.coerceNumber(feature.properties?.rank?.confidence),
        };
    }

    private parseGeoResultEntry(entry: unknown): {
        lat: number | null;
        lng: number | null;
        formattedAddress: string | null;
        confidence: number | null;
    } | null {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const result = entry as {
            lat?: unknown;
            lon?: unknown;
            formatted?: unknown;
            rank?: {
                confidence?: unknown;
            };
        };
        return {
            lat: this.coerceNumber(result.lat),
            lng: this.coerceNumber(result.lon),
            formattedAddress: typeof result.formatted === 'string' ? result.formatted : null,
            confidence: this.coerceNumber(result.rank?.confidence),
        };
    }

    private async getJsonWithTimeout(
        url: string,
        headers?: Record<string, string>,
    ): Promise<unknown> {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), this.requestTimeoutMs);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    ...(headers || {}),
                },
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

    private resolvePositiveInt(envKey: string, fallbackValue: number): number {
        const raw = this.configService.get<string>(envKey);
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return fallbackValue;
        }
        return parsed;
    }

    private resolveRangeNumber(
        envKey: string,
        min: number,
        max: number,
        fallbackValue: number,
    ): number {
        const raw = this.configService.get<string>(envKey);
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            return fallbackValue;
        }
        return parsed;
    }

    private resolveOptionalString(envKey: string): string | null {
        const raw = this.configService.get<string>(envKey);
        if (!raw) {
            return null;
        }
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    private resolveBooleanLike(envKey: string, fallbackValue: boolean): boolean {
        const raw = this.configService.get<string>(envKey);
        if (!raw) {
            return fallbackValue;
        }
        const normalized = raw.trim().toLowerCase();
        if (normalized === '1' || normalized === 'true') {
            return true;
        }
        if (normalized === '0' || normalized === 'false') {
            return false;
        }
        return fallbackValue;
    }

    private getValidCache<T>(cache: Map<string, CachedValue<T>>, cacheKey: string): T | undefined {
        const entry = cache.get(cacheKey);
        if (!entry) {
            return undefined;
        }
        if (entry.expiresAt <= Date.now()) {
            cache.delete(cacheKey);
            return undefined;
        }
        return entry.value;
    }

    private coerceNumber(value: unknown): number | null {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim().length > 0) {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
        return null;
    }
}
