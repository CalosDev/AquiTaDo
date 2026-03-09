import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObservabilityService } from '../observability/observability.service';
import { CircuitBreakerService } from '../resilience/circuit-breaker.service';
import { IntegrationsService } from './integrations.service';

type EnvValues = Record<string, string | undefined>;

type MockedCircuitBreaker = {
    execute: ReturnType<typeof vi.fn>;
};

type MockedObservability = {
    trackExternalDependencyCall: ReturnType<typeof vi.fn>;
};

function createService(env: EnvValues = {}): {
    service: IntegrationsService;
    circuitBreaker: MockedCircuitBreaker;
    observability: MockedObservability;
} {
    const configService = {
        get: vi.fn((key: string) => env[key]),
    } as unknown as ConfigService;

    const circuitBreaker = {
        execute: vi.fn(async (_key: string, operation: () => Promise<unknown>) => operation()),
    } satisfies MockedCircuitBreaker;

    const observability = {
        trackExternalDependencyCall: vi.fn(),
    } satisfies MockedObservability;

    return {
        service: new IntegrationsService(
            configService,
            circuitBreaker as unknown as CircuitBreakerService,
            observability as unknown as ObservabilityService,
        ),
        circuitBreaker,
        observability,
    };
}

function mockJsonResponse(payload: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    } as unknown as Response;
}

describe('IntegrationsService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('uses Geoapify when API key is configured', async () => {
        const { service, circuitBreaker } = createService({
            GEOAPIFY_API_KEY: 'geo-key',
            GEOAPIFY_BASE_URL: 'https://geoapify.test',
            NOMINATIM_ENABLED: 'true',
        });

        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({
                features: [
                    {
                        geometry: { coordinates: [-69.9312, 18.4861] },
                        properties: {
                            formatted: 'Av. Abraham Lincoln, Santo Domingo',
                            rank: { confidence: 0.94 },
                        },
                    },
                ],
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await service.geocodeDominicanAddress({
            address: 'Av. Abraham Lincoln 100',
            city: 'Santo Domingo',
            province: 'Distrito Nacional',
        });

        expect(result).toEqual({
            latitude: 18.4861,
            longitude: -69.9312,
            formattedAddress: 'Av. Abraham Lincoln, Santo Domingo',
            confidence: 0.94,
            provider: 'geoapify',
        });
        expect(circuitBreaker.execute).toHaveBeenCalledTimes(1);
        expect(circuitBreaker.execute).toHaveBeenCalledWith(
            'geoapify.geocode',
            expect.any(Function),
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/geocode/search');
    });

    it('falls back to Nominatim when Geoapify fails', async () => {
        const { service, circuitBreaker } = createService({
            GEOAPIFY_API_KEY: 'geo-key',
            GEOAPIFY_BASE_URL: 'https://geoapify.test',
            NOMINATIM_ENABLED: 'true',
            NOMINATIM_BASE_URL: 'https://nominatim.test',
            NOMINATIM_USER_AGENT: 'AquiTaDo-Geocoder/1.0 (+https://aquitado.vercel.app)',
            NOMINATIM_MIN_INTERVAL_MS: '1100',
        });

        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(mockJsonResponse({ error: 'downstream' }, 503))
            .mockResolvedValueOnce(
                mockJsonResponse([
                    {
                        lat: '18.4719',
                        lon: '-69.8923',
                        display_name: 'Santo Domingo, Distrito Nacional, República Dominicana',
                    },
                ]),
            );
        vi.stubGlobal('fetch', fetchMock);

        const result = await service.geocodeDominicanAddress({
            address: 'Zona Colonial',
            city: 'Santo Domingo',
        });

        expect(result).toEqual({
            latitude: 18.4719,
            longitude: -69.8923,
            formattedAddress: 'Santo Domingo, Distrito Nacional, República Dominicana',
            confidence: null,
            provider: 'nominatim',
        });
        expect(circuitBreaker.execute).toHaveBeenCalledTimes(2);
        expect(circuitBreaker.execute).toHaveBeenNthCalledWith(
            1,
            'geoapify.geocode',
            expect.any(Function),
        );
        expect(circuitBreaker.execute).toHaveBeenNthCalledWith(
            2,
            'nominatim.geocode',
            expect.any(Function),
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/search');
        expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
            headers: expect.objectContaining({
                'User-Agent': 'AquiTaDo-Geocoder/1.0 (+https://aquitado.vercel.app)',
            }),
        });
    });

    it('caches geocode results for repeated queries', async () => {
        const { service, circuitBreaker } = createService({
            GEOAPIFY_API_KEY: 'geo-key',
            GEOAPIFY_BASE_URL: 'https://geoapify.test',
        });

        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({
                features: [
                    {
                        geometry: { coordinates: [-70.0, 18.5] },
                        properties: {
                            formatted: 'Santiago, República Dominicana',
                            rank: { confidence: 0.91 },
                        },
                    },
                ],
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const first = await service.geocodeDominicanAddress({
            address: 'Calle del Sol',
            city: 'Santiago',
        });
        const second = await service.geocodeDominicanAddress({
            address: 'Calle del Sol',
            city: 'Santiago',
        });

        expect(first).toEqual(second);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(circuitBreaker.execute).toHaveBeenCalledTimes(1);
    });

    it('respects Nominatim min interval between different queries', async () => {
        const { service, circuitBreaker, observability } = createService({
            NOMINATIM_ENABLED: 'true',
            NOMINATIM_BASE_URL: 'https://nominatim.test',
            NOMINATIM_USER_AGENT: 'AquiTaDo-Geocoder/1.0 (+https://aquitado.vercel.app)',
            NOMINATIM_MIN_INTERVAL_MS: '60000',
        });

        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse([
                {
                    lat: '18.4700',
                    lon: '-69.9000',
                    display_name: 'Santo Domingo, República Dominicana',
                },
            ]),
        );
        vi.stubGlobal('fetch', fetchMock);

        const first = await service.geocodeDominicanAddress({
            address: 'Dirección Uno',
            city: 'Santo Domingo',
        });
        const second = await service.geocodeDominicanAddress({
            address: 'Dirección Dos',
            city: 'Santo Domingo',
        });

        expect(first?.provider).toBe('nominatim');
        expect(second).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(circuitBreaker.execute).toHaveBeenCalledTimes(2);
        expect(observability.trackExternalDependencyCall).toHaveBeenCalledTimes(1);
    });

    it('caches veriphone validation results for repeated phone numbers', async () => {
        const { service, circuitBreaker } = createService({
            VERIPHONE_API_KEY: 'veri-key',
            VERIPHONE_BASE_URL: 'https://veriphone.test',
        });

        const fetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({
                phone: '+18095551234',
                phone_valid: true,
                country_code: 'DO',
                carrier: 'Carrier X',
                phone_type: 'mobile',
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const first = await service.validateDominicanPhone('809-555-1234');
        const second = await service.validateDominicanPhone('8095551234');

        expect(first).toEqual(second);
        expect(first).toMatchObject({
            isValid: true,
            normalizedPhone: '+18095551234',
            provider: 'veriphone',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(circuitBreaker.execute).toHaveBeenCalledTimes(1);
    });
});
