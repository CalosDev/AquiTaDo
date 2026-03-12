export interface BusinessHourEntry {
    dayOfWeek: number;
    opensAt: string;
    closesAt: string;
    closed: boolean;
}

export const BUSINESS_DAY_OPTIONS: Array<{ dayOfWeek: number; label: string; shortLabel: string }> = [
    { dayOfWeek: 0, label: 'Domingo', shortLabel: 'Dom' },
    { dayOfWeek: 1, label: 'Lunes', shortLabel: 'Lun' },
    { dayOfWeek: 2, label: 'Martes', shortLabel: 'Mar' },
    { dayOfWeek: 3, label: 'Miercoles', shortLabel: 'Mie' },
    { dayOfWeek: 4, label: 'Jueves', shortLabel: 'Jue' },
    { dayOfWeek: 5, label: 'Viernes', shortLabel: 'Vie' },
    { dayOfWeek: 6, label: 'Sabado', shortLabel: 'Sab' },
] as const;

export const BUSINESS_PRICE_RANGE_OPTIONS = [
    { value: 'BUDGET', label: '$ Economico' },
    { value: 'MODERATE', label: '$$ Moderado' },
    { value: 'PREMIUM', label: '$$$ Premium' },
    { value: 'LUXURY', label: '$$$$ Alta gama' },
] as const;

export function createDefaultBusinessHours(): BusinessHourEntry[] {
    return BUSINESS_DAY_OPTIONS.map(({ dayOfWeek }) => ({
        dayOfWeek,
        opensAt: '09:00',
        closesAt: '18:00',
        closed: dayOfWeek === 0,
    }));
}

export function mergeBusinessHours(hours?: Array<Partial<BusinessHourEntry> & { dayOfWeek: number }>): BusinessHourEntry[] {
    const byDay = new Map(
        (hours ?? []).map((entry) => [
            entry.dayOfWeek,
            {
                dayOfWeek: entry.dayOfWeek,
                opensAt: entry.opensAt ?? '09:00',
                closesAt: entry.closesAt ?? '18:00',
                closed: Boolean(entry.closed),
            },
        ]),
    );

    return BUSINESS_DAY_OPTIONS.map(({ dayOfWeek }) => byDay.get(dayOfWeek) ?? {
        dayOfWeek,
        opensAt: '09:00',
        closesAt: '18:00',
        closed: dayOfWeek === 0,
    });
}

export function businessPriceRangeLabel(priceRange?: string | null): string | null {
    return BUSINESS_PRICE_RANGE_OPTIONS.find((option) => option.value === priceRange)?.label ?? null;
}

export function formatHoursRange(opensAt?: string | null, closesAt?: string | null): string | null {
    if (!opensAt || !closesAt) {
        return null;
    }

    return `${opensAt} - ${closesAt}`;
}
