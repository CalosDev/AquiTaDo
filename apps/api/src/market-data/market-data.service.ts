import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

type DominicanHoliday = {
    date: string;
    localName: string;
    englishName: string;
    global: boolean;
    counties: string[] | null;
    launchYear: number | null;
    fixed: boolean;
    daysUntil: number;
    isUpcoming: boolean;
};

type CommercialAgendaItem = {
    id: string;
    holidayDate: string;
    holidayName: string;
    daysUntil: number;
    campaignWindow: {
        start: string;
        end: string;
    };
    suggestedCategories: string[];
    recommendation: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
};

type CommercialAgendaResponse = {
    generatedAt: string;
    horizonDays: number;
    items: CommercialAgendaItem[];
};

type CategoryDemandSignal = {
    categoryId: string;
    categoryName: string;
    eventCount: number;
    eventScore: number;
    sharePct: number;
};

type CommercialCalendarResponse = {
    generatedAt: string;
    horizonDays: number;
    appliedFilters: {
        province: { id: string; name: string } | null;
        category: { id: string; name: string } | null;
    };
    demandSignals: CategoryDemandSignal[];
    items: Array<CommercialAgendaItem & {
        dataSource: 'holiday-only' | 'holiday+market-signals' | 'holiday+filters';
    }>;
};

@Injectable()
export class MarketDataService {
    private readonly logger = new Logger(MarketDataService.name);
    private readonly cacheTtlMs: number;
    private readonly requestTimeoutMs: number;
    private readonly openMeteoBaseUrl: string;
    private readonly frankfurterBaseUrl: string;
    private readonly nagerBaseUrl: string;
    private readonly weatherCache = new Map<string, CachedValue<CurrentWeatherResponse>>();
    private readonly fxCache = new Map<string, CachedValue<ExchangeRateResponse>>();
    private readonly holidayCache = new Map<string, CachedValue<DominicanHoliday[]>>();

    constructor(
        @Inject(ConfigService)
        private readonly configService: ConfigService,
        @Inject(PrismaService)
        private readonly prismaService: PrismaService,
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
        this.nagerBaseUrl = this.configService.get<string>('NAGER_BASE_URL')?.trim()
            || 'https://date.nager.at';
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

    async getDominicanHolidays(
        year: number,
        options?: {
            limit?: number;
            upcomingOnly?: boolean;
            referenceDate?: Date;
        },
    ): Promise<DominicanHoliday[]> {
        const cacheKey = `do:${year}`;
        const cached = this.getValidCache(this.holidayCache, cacheKey);
        const referenceDate = options?.referenceDate ?? new Date();
        const referenceDay = this.startOfDay(referenceDate);

        let holidays = cached;
        if (!holidays) {
            holidays = await this.fetchDominicanHolidays(year);
            this.holidayCache.set(cacheKey, {
                value: holidays,
                expiresAt: Date.now() + this.cacheTtlMs,
            });
        }

        const normalized = holidays.map((holiday) => {
            const holidayDay = this.parseIsoDate(holiday.date);
            const daysUntil = this.diffInDays(referenceDay, holidayDay);
            return {
                ...holiday,
                daysUntil,
                isUpcoming: daysUntil >= 0,
            };
        });

        const filtered = options?.upcomingOnly
            ? normalized.filter((holiday) => holiday.isUpcoming)
            : normalized;
        const limited = typeof options?.limit === 'number'
            ? filtered.slice(0, options.limit)
            : filtered;

        return limited;
    }

    async getDominicanCommercialAgenda(options?: {
        limit?: number;
        horizonDays?: number;
    }): Promise<CommercialAgendaResponse> {
        const limit = options?.limit && options.limit > 0 ? options.limit : 4;
        const horizonDays = options?.horizonDays && options.horizonDays > 0
            ? options.horizonDays
            : 60;

        const today = new Date();
        const currentYear = today.getUTCFullYear();
        const nextYear = currentYear + 1;
        const [currentYearHolidays, nextYearHolidays] = await Promise.all([
            this.getDominicanHolidays(currentYear, {
                upcomingOnly: true,
                referenceDate: today,
            }),
            this.getDominicanHolidays(nextYear, {
                upcomingOnly: true,
                referenceDate: today,
            }),
        ]);

        const merged = [...currentYearHolidays, ...nextYearHolidays]
            .filter((holiday) => holiday.daysUntil >= 0 && holiday.daysUntil <= horizonDays)
            .sort((left, right) => left.daysUntil - right.daysUntil);

        const items = merged.slice(0, limit).map((holiday, index) => {
            const campaignStart = this.addDaysIso(holiday.date, -7);
            const campaignEnd = this.addDaysIso(holiday.date, 1);
            const suggestion = this.resolveCommercialSuggestion(holiday.localName);
            const urgency: 'HIGH' | 'MEDIUM' | 'LOW' = holiday.daysUntil <= 7
                ? 'HIGH'
                : holiday.daysUntil <= 21
                    ? 'MEDIUM'
                    : 'LOW';

            return {
                id: `${holiday.date}-${index}`,
                holidayDate: holiday.date,
                holidayName: holiday.localName || holiday.englishName,
                daysUntil: holiday.daysUntil,
                campaignWindow: {
                    start: campaignStart,
                    end: campaignEnd,
                },
                suggestedCategories: suggestion.categories,
                recommendation: suggestion.recommendation,
                urgency,
            };
        });

        return {
            generatedAt: new Date().toISOString(),
            horizonDays,
            items,
        };
    }

    async getDominicanCommercialCalendar(options?: {
        limit?: number;
        horizonDays?: number;
        provinceId?: string;
        categoryId?: string;
    }): Promise<CommercialCalendarResponse> {
        const provinceId = options?.provinceId;
        const categoryId = options?.categoryId;

        const [province, category] = await Promise.all([
            provinceId
                ? this.prismaService.province.findUnique({
                    where: { id: provinceId },
                    select: { id: true, name: true },
                })
                : Promise.resolve(null),
            categoryId
                ? this.prismaService.category.findUnique({
                    where: { id: categoryId },
                    select: { id: true, name: true },
                })
                : Promise.resolve(null),
        ]);

        if (provinceId && !province) {
            throw new BadRequestException('provinceId no corresponde a una provincia valida');
        }
        if (categoryId && !category) {
            throw new BadRequestException('categoryId no corresponde a una categoria valida');
        }

        const baseAgenda = await this.getDominicanCommercialAgenda({
            limit: options?.limit,
            horizonDays: options?.horizonDays,
        });
        const demandSignals = await this.getCategoryDemandSignals({
            provinceId,
            categoryId,
        });

        const topDemandNames = demandSignals.slice(0, 3).map((signal) => signal.categoryName);
        const items = baseAgenda.items.map((item) => {
            const mergedCategories = this.mergeCategorySuggestions(
                item.suggestedCategories,
                topDemandNames,
                category?.name,
            );

            const enrichedRecommendation = this.enrichRecommendationWithContext(
                item.recommendation,
                province?.name ?? null,
                category?.name ?? null,
            );

            let dataSource: 'holiday-only' | 'holiday+market-signals' | 'holiday+filters' = 'holiday-only';
            if (province || category) {
                dataSource = 'holiday+filters';
            } else if (topDemandNames.length > 0) {
                dataSource = 'holiday+market-signals';
            }

            return {
                ...item,
                suggestedCategories: mergedCategories,
                recommendation: enrichedRecommendation,
                dataSource,
            };
        });

        return {
            generatedAt: baseAgenda.generatedAt,
            horizonDays: baseAgenda.horizonDays,
            appliedFilters: {
                province: province ?? null,
                category: category ?? null,
            },
            demandSignals,
            items,
        };
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

    private async fetchDominicanHolidays(year: number): Promise<DominicanHoliday[]> {
        const startedAt = Date.now();
        let success = true;

        try {
            const url = new URL(`/api/v3/PublicHolidays/${year}/DO`, this.nagerBaseUrl);
            const payload = await this.getJsonWithTimeout(url.toString());

            if (!Array.isArray(payload)) {
                throw new Error('Invalid holidays payload');
            }

            const normalized = payload
                .map((row) => this.normalizeHolidayRow(row))
                .filter((row): row is DominicanHoliday => row !== null)
                .sort((left, right) => left.date.localeCompare(right.date));

            if (normalized.length === 0) {
                return this.getLocalFallbackHolidays(year);
            }

            return normalized;
        } catch (error) {
            success = false;
            this.logger.warn(
                `Nager holidays request failed (${error instanceof Error ? error.message : String(error)}), using local fallback`,
            );
            return this.getLocalFallbackHolidays(year);
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'nager',
                'holidays-rd',
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

    private normalizeHolidayRow(value: unknown): DominicanHoliday | null {
        if (!value || typeof value !== 'object') {
            return null;
        }

        const entry = value as Record<string, unknown>;
        const date = typeof entry.date === 'string' ? entry.date : null;
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return null;
        }

        return {
            date,
            localName: typeof entry.localName === 'string' ? entry.localName : 'Feriado nacional',
            englishName: typeof entry.name === 'string' ? entry.name : 'Public holiday',
            global: typeof entry.global === 'boolean' ? entry.global : true,
            counties: Array.isArray(entry.counties)
                ? entry.counties.filter((county): county is string => typeof county === 'string')
                : null,
            launchYear: typeof entry.launchYear === 'number' ? entry.launchYear : null,
            fixed: typeof entry.fixed === 'boolean' ? entry.fixed : false,
            daysUntil: 0,
            isUpcoming: false,
        };
    }

    private getLocalFallbackHolidays(year: number): DominicanHoliday[] {
        const rows = [
            { month: 1, day: 1, localName: 'Ano Nuevo', englishName: 'New Year\'s Day' },
            { month: 1, day: 6, localName: 'Dia de Reyes', englishName: 'Epiphany' },
            { month: 1, day: 21, localName: 'Nuestra Senora de la Altagracia', englishName: 'Our Lady of Altagracia' },
            { month: 1, day: 26, localName: 'Dia de Duarte', englishName: 'Duarte Day' },
            { month: 2, day: 27, localName: 'Independencia Nacional', englishName: 'Independence Day' },
            { month: 5, day: 1, localName: 'Dia del Trabajo', englishName: 'Labour Day' },
            { month: 8, day: 16, localName: 'Restauracion', englishName: 'Restoration Day' },
            { month: 9, day: 24, localName: 'Nuestra Senora de las Mercedes', englishName: 'Our Lady of Mercedes' },
            { month: 11, day: 6, localName: 'Dia de la Constitucion', englishName: 'Constitution Day' },
            { month: 12, day: 25, localName: 'Navidad', englishName: 'Christmas Day' },
        ];

        return rows.map((row) => ({
            date: `${year}-${String(row.month).padStart(2, '0')}-${String(row.day).padStart(2, '0')}`,
            localName: row.localName,
            englishName: row.englishName,
            global: true,
            counties: null,
            launchYear: null,
            fixed: true,
            daysUntil: 0,
            isUpcoming: false,
        }));
    }

    private resolveCommercialSuggestion(holidayName: string): {
        categories: string[];
        recommendation: string;
    } {
        const normalized = holidayName.toLowerCase();
        if (normalized.includes('navidad') || normalized.includes('reyes')) {
            return {
                categories: ['Tiendas y moda', 'Tecnologia', 'Restaurantes'],
                recommendation: 'Activa combos de regalo, extiende horario y usa cupos limitados por WhatsApp.',
            };
        }

        if (normalized.includes('madre') || normalized.includes('mercedes')) {
            return {
                categories: ['Salones y barberias', 'Restaurantes', 'Tiendas y moda'],
                recommendation: 'Prepara paquetes especiales y reservas anticipadas con recordatorio 24h antes.',
            };
        }

        if (normalized.includes('trabajo')) {
            return {
                categories: ['Ferreterias y construccion', 'Automotriz y talleres', 'Colmados y mini markets'],
                recommendation: 'Empuja ofertas de ticket medio alto y crea una promo flash de 48 horas.',
            };
        }

        return {
            categories: ['Restaurantes', 'Colmados y mini markets', 'Farmacias y salud'],
            recommendation: 'Lanza una campaña local por barrio, prioriza conversion por WhatsApp y promo corta.',
        };
    }

    private async getCategoryDemandSignals(filters?: {
        provinceId?: string;
        categoryId?: string;
    }): Promise<CategoryDemandSignal[]> {
        const startedAt = Date.now();
        let success = true;

        try {
            const fromDate = new Date();
            fromDate.setUTCDate(fromDate.getUTCDate() - 60);

            const whereConditions: Prisma.Sql[] = [
                Prisma.sql`"occurredAt" >= ${fromDate}`,
                Prisma.sql`"categoryId" IS NOT NULL`,
            ];
            if (filters?.provinceId) {
                whereConditions.push(Prisma.sql`"provinceId" = ${filters.provinceId}`);
            }
            if (filters?.categoryId) {
                whereConditions.push(Prisma.sql`"categoryId" = ${filters.categoryId}`);
            }

            const rows = await this.prismaService.$queryRaw<Array<{
                categoryId: string;
                eventType: string;
                count: number | bigint | string;
            }>>(Prisma.sql`
                SELECT
                    "categoryId" AS "categoryId",
                    "eventType" AS "eventType",
                    COUNT(*) AS "count"
                FROM "growth_events"
                WHERE ${Prisma.join(whereConditions, ' AND ')}
                GROUP BY "categoryId", "eventType"
            `);

            if (!rows.length) {
                return [];
            }

            const weights: Record<string, number> = {
                SEARCH_QUERY: 1,
                SEARCH_RESULT_CLICK: 1.5,
                CONTACT_CLICK: 2.5,
                WHATSAPP_CLICK: 2.2,
                BOOKING_INTENT: 3,
            };

            const summaryByCategory = new Map<string, { eventCount: number; eventScore: number }>();
            for (const row of rows) {
                const eventCount = this.coerceNumber(row.count) ?? 0;
                if (!row.categoryId || eventCount <= 0) {
                    continue;
                }

                const weight = weights[row.eventType] ?? 1;
                const current = summaryByCategory.get(row.categoryId) ?? {
                    eventCount: 0,
                    eventScore: 0,
                };
                current.eventCount += eventCount;
                current.eventScore += eventCount * weight;
                summaryByCategory.set(row.categoryId, current);
            }

            if (!summaryByCategory.size) {
                return [];
            }

            const categoryIds = [...summaryByCategory.keys()];
            const categories = await this.prismaService.category.findMany({
                where: { id: { in: categoryIds } },
                select: { id: true, name: true },
            });
            const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
            const totalScore = [...summaryByCategory.values()].reduce(
                (accumulator, current) => accumulator + current.eventScore,
                0,
            ) || 1;

            const signals = categoryIds
                .map((categoryId) => {
                    const metrics = summaryByCategory.get(categoryId);
                    if (!metrics) {
                        return null;
                    }
                    return {
                        categoryId,
                        categoryName: categoryNameById.get(categoryId) || 'Categoria',
                        eventCount: metrics.eventCount,
                        eventScore: Number(metrics.eventScore.toFixed(2)),
                        sharePct: Number(((metrics.eventScore / totalScore) * 100).toFixed(1)),
                    } satisfies CategoryDemandSignal;
                })
                .filter((signal): signal is CategoryDemandSignal => signal !== null)
                .sort((left, right) => right.eventScore - left.eventScore);

            return signals.slice(0, 6);
        } catch (error) {
            success = false;
            this.logger.warn(
                `Demand signal calculation failed (${error instanceof Error ? error.message : String(error)})`,
            );
            return [];
        } finally {
            this.observabilityService.trackExternalDependencyCall(
                'internal-analytics',
                'category-demand-signals',
                Date.now() - startedAt,
                success,
            );
        }
    }

    private mergeCategorySuggestions(
        baseCategories: string[],
        demandCategories: string[],
        forcedCategory: string | null | undefined,
    ): string[] {
        const merged = new Set<string>();

        if (forcedCategory && forcedCategory.trim().length > 0) {
            merged.add(forcedCategory.trim());
        }
        for (const category of demandCategories) {
            const normalized = category.trim();
            if (normalized.length > 0) {
                merged.add(normalized);
            }
            if (merged.size >= 3) {
                break;
            }
        }
        for (const category of baseCategories) {
            const normalized = category.trim();
            if (normalized.length > 0) {
                merged.add(normalized);
            }
            if (merged.size >= 3) {
                break;
            }
        }

        return [...merged].slice(0, 3);
    }

    private enrichRecommendationWithContext(
        baseRecommendation: string,
        provinceName: string | null,
        categoryName: string | null,
    ): string {
        const contextParts: string[] = [];
        if (provinceName) {
            contextParts.push(`en ${provinceName}`);
        }
        if (categoryName) {
            contextParts.push(`para ${categoryName}`);
        }

        if (contextParts.length === 0) {
            return baseRecommendation;
        }

        return `${baseRecommendation} Ajuste recomendado ${contextParts.join(' ')}.`;
    }

    private parseIsoDate(value: string): Date {
        return new Date(`${value}T00:00:00.000Z`);
    }

    private startOfDay(value: Date): Date {
        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }

    private diffInDays(from: Date, to: Date): number {
        const diffMs = to.getTime() - from.getTime();
        return Math.floor(diffMs / 86_400_000);
    }

    private addDaysIso(isoDate: string, delta: number): string {
        const date = this.parseIsoDate(isoDate);
        date.setUTCDate(date.getUTCDate() + delta);
        return date.toISOString().slice(0, 10);
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
