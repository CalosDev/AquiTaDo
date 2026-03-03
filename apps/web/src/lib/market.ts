const RD_LOCALE = 'es-DO';
const RD_CURRENCY = 'DOP';

type NumericInput = string | number | null | undefined;

function toNumber(value: NumericInput): number {
    if (value === null || value === undefined) {
        return 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export const MARKET_CONFIG = {
    locale: RD_LOCALE,
    currency: RD_CURRENCY,
    currencySymbol: 'RD$',
} as const;

export function formatDateTimeDo(
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions,
): string {
    return new Date(value).toLocaleString(RD_LOCALE, options);
}

export function formatDateDo(
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions,
): string {
    return new Date(value).toLocaleDateString(RD_LOCALE, options);
}

export function formatCurrencyDo(
    value: NumericInput,
    currency: string = RD_CURRENCY,
): string {
    return new Intl.NumberFormat(RD_LOCALE, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
    }).format(toNumber(value));
}

export function formatNumberDo(value: NumericInput): string {
    return new Intl.NumberFormat(RD_LOCALE).format(toNumber(value));
}
