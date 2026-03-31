import { MarketReportType } from '../generated/prisma/client';

export const MS_PER_DAY = 86_400_000;

export type DailyAnalyticsValue = {
    views: number;
    uniqueVisitors: number;
    clicks: number;
    conversions: number;
    reservationRequests: number;
    grossRevenue: number;
};

type MarketInsightsSummaryShape = {
    totals: Record<string, unknown>;
    provinces: unknown[];
    categories: unknown[];
    topBusinesses: unknown[];
};

export function normalizeAnalyticsDays(days: number | string | null | undefined): number {
    const parsedDays = typeof days === 'string'
        ? Number.parseInt(days, 10)
        : days;

    if (!Number.isFinite(parsedDays)) {
        return 30;
    }

    const safeDays = parsedDays as number;
    return Math.min(Math.max(Math.floor(safeDays), 1), 365);
}

export function toDateOnly(date: Date): Date {
    return new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
    ));
}

export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
}

export function buildDailySeries(
    rangeStart: Date,
    days: number,
    dailyMap: Map<string, DailyAnalyticsValue>,
) {
    const series: Array<DailyAnalyticsValue & { date: string }> = [];

    for (let index = 0; index < days; index += 1) {
        const currentDate = new Date(rangeStart.getTime() + index * MS_PER_DAY);
        const key = dateKey(currentDate);
        const item = dailyMap.get(key) ?? {
            views: 0,
            uniqueVisitors: 0,
            clicks: 0,
            conversions: 0,
            reservationRequests: 0,
            grossRevenue: 0,
        };

        series.push({
            date: key,
            views: item.views,
            uniqueVisitors: item.uniqueVisitors,
            clicks: item.clicks,
            conversions: item.conversions,
            reservationRequests: item.reservationRequests,
            grossRevenue: roundMoney(item.grossRevenue),
        });
    }

    return series;
}

export function buildMarketReportSummary(
    reportType: MarketReportType,
    insights: MarketInsightsSummaryShape,
) {
    switch (reportType) {
        case 'PROVINCE_CATEGORY_DEMAND':
            return {
                headline: 'Demanda por provincia y categoria',
                totals: insights.totals,
                topProvinces: insights.provinces.slice(0, 10),
                topCategories: insights.categories.slice(0, 10),
            };
        case 'TRENDING_BUSINESSES':
            return {
                headline: 'Negocios en tendencia',
                totals: insights.totals,
                topBusinesses: insights.topBusinesses.slice(0, 20),
            };
        case 'CONVERSION_BENCHMARK':
            return {
                headline: 'Benchmark de conversion del marketplace',
                totals: insights.totals,
                conversionRate: insights.totals['conversionRate'],
                reservationRequestRate: insights.totals['reservationRequestRate'],
                topBusinesses: insights.topBusinesses.slice(0, 10),
                topCategories: insights.categories.slice(0, 10),
            };
        default:
            return {
                headline: 'Reporte de mercado',
                totals: insights.totals,
            };
    }
}

function dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}
