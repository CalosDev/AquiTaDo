import { BadRequestException } from '@nestjs/common';
import type { BusinessQueryDto, BusinessHourInputDto } from './dto/business.dto';
import {
    buildTodayBusinessHoursLabel,
    calculateBusinessProfileCompletenessScore,
    isBusinessOpenNow,
    listMissingBusinessProfileFields,
} from './business-profile';

export interface DecoratedBusinessProfile {
    profileCompletenessScore: number;
    missingCoreFields: string[];
    openNow: boolean | null;
    todayHoursLabel: string | null;
}

export function decorateBusinessProfile<T extends Record<string, any>>(business: T): T & DecoratedBusinessProfile {
    const profileCompletenessScore = calculateBusinessProfileCompletenessScore(business);

    return {
        ...business,
        profileCompletenessScore,
        missingCoreFields: listMissingBusinessProfileFields(business),
        openNow: isBusinessOpenNow(business.hours),
        todayHoursLabel: buildTodayBusinessHoursLabel(business.hours),
    };
}

export function decorateBusinessProfiles<T extends Record<string, any>>(businesses: T[]) {
    return businesses.map((business) => decorateBusinessProfile(business));
}

export function normalizeOptionalText(value?: string | null): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
}

export function normalizeOptionalEmail(value?: string | null): string | null | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

export function normalizeBusinessHours(
    hours: BusinessHourInputDto[] | undefined,
    normalizeText: (value?: string | null) => string | null | undefined,
) {
    if (!hours) {
        return undefined;
    }

    const normalized = hours
        .map((entry) => ({
            dayOfWeek: entry.dayOfWeek,
            opensAt: normalizeText(entry.opensAt) ?? null,
            closesAt: normalizeText(entry.closesAt) ?? null,
            closed: Boolean(entry.closed),
        }))
        .sort((left, right) => left.dayOfWeek - right.dayOfWeek);

    const uniqueDays = new Set<number>();
    for (const entry of normalized) {
        if (uniqueDays.has(entry.dayOfWeek)) {
            throw new BadRequestException('No puedes enviar horarios duplicados para el mismo dia');
        }

        uniqueDays.add(entry.dayOfWeek);

        if (entry.closed) {
            entry.opensAt = null;
            entry.closesAt = null;
            continue;
        }

        if (!entry.opensAt || !entry.closesAt) {
            throw new BadRequestException('Cada horario abierto debe incluir apertura y cierre');
        }
    }

    return normalized;
}

export function findDuplicateCandidates(
    businesses: Array<Record<string, any> & DecoratedBusinessProfile>,
) {
    const candidates = new Map<string, {
        key: string;
        reasons: Set<string>;
        businesses: Array<Record<string, any>>;
    }>();
    const phoneGroups = new Map<string, Array<Record<string, any>>>();
    const nameLocationGroups = new Map<string, Array<Record<string, any>>>();

    for (const business of businesses) {
        const normalizedPhone = String(business.phone ?? '').replace(/\D/g, '');
        if (normalizedPhone.length >= 7) {
            const group = phoneGroups.get(normalizedPhone) ?? [];
            group.push(business);
            phoneGroups.set(normalizedPhone, group);
        }

        const normalizedName = String(business.name ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();
        const cityKey = String(business.city?.id ?? business.province?.id ?? '');
        if (normalizedName && cityKey) {
            const compositeKey = `${normalizedName}::${cityKey}`;
            const group = nameLocationGroups.get(compositeKey) ?? [];
            group.push(business);
            nameLocationGroups.set(compositeKey, group);
        }
    }

    const registerGroups = (groups: Iterable<Array<Record<string, any>>>, reason: string) => {
        for (const group of groups) {
            if (group.length < 2) {
                continue;
            }

            const key = group
                .map((entry) => String(entry.id))
                .sort()
                .join(':');

            const existing = candidates.get(key) ?? {
                key,
                reasons: new Set<string>(),
                businesses: group,
            };
            existing.reasons.add(reason);
            candidates.set(key, existing);
        }
    };

    registerGroups(phoneGroups.values(), 'telefono_compartido');
    registerGroups(nameLocationGroups.values(), 'nombre_y_ciudad_similares');

    return [...candidates.values()]
        .map((entry) => ({
            key: entry.key,
            reasons: [...entry.reasons],
            businesses: entry.businesses,
        }))
        .sort((left, right) => right.businesses.length - left.businesses.length);
}

export function assertCoordinatePair(latitude?: number, longitude?: number): void {
    const hasLatitude = latitude !== undefined && latitude !== null;
    const hasLongitude = longitude !== undefined && longitude !== null;

    if (hasLatitude !== hasLongitude) {
        throw new BadRequestException('Debes enviar latitud y longitud juntas');
    }
}

export function normalizePublicListQuery(query: BusinessQueryDto): BusinessQueryDto {
    return {
        ...query,
        search: query.search?.trim() || undefined,
        categorySlug: query.categorySlug?.trim() || undefined,
        provinceSlug: query.provinceSlug?.trim() || undefined,
        feature: query.feature?.trim() || undefined,
    };
}

export function resolvePagination(
    rawPage: number | undefined,
    rawLimit: number | undefined,
    defaultLimit: number,
    maxLimit: number,
): { page: number; limit: number; skip: number } {
    const page = rawPage && Number.isFinite(rawPage) && rawPage > 0
        ? Math.floor(rawPage)
        : 1;
    const requestedLimit = rawLimit && Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.floor(rawLimit)
        : defaultLimit;
    const limit = Math.min(requestedLimit, maxLimit);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
}

export function canAccessUnverified(
    ownerId: string,
    businessOrganizationId: string,
    userId?: string,
    userRole?: string,
    currentOrganizationId?: string,
): boolean {
    if (!userId) {
        return false;
    }

    if (ownerId === userId || userRole === 'ADMIN') {
        return true;
    }

    return currentOrganizationId === businessOrganizationId;
}
