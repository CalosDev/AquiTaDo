import { BadRequestException } from '@nestjs/common';
import type { BusinessQueryDto, BusinessHourInputDto } from './dto/business.dto';
import { resolveActiveBusinessOrganizationId } from './business-ownership.helpers';
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
    const businessById = new Map(
        businesses.map((business) => [String(business.id), business]),
    );
    const adjacency = new Map<string, Set<string>>();
    const edgeReasons = new Map<string, Set<string>>();

    for (let leftIndex = 0; leftIndex < businesses.length; leftIndex += 1) {
        const left = businesses[leftIndex];

        for (let rightIndex = leftIndex + 1; rightIndex < businesses.length; rightIndex += 1) {
            const right = businesses[rightIndex];
            const match = scoreDuplicatePair(left, right);

            if (match.score < 60) {
                continue;
            }

            const leftId = String(left.id);
            const rightId = String(right.id);
            const pairKey = [leftId, rightId].sort().join(':');

            const leftNeighbors = adjacency.get(leftId) ?? new Set<string>();
            leftNeighbors.add(rightId);
            adjacency.set(leftId, leftNeighbors);

            const rightNeighbors = adjacency.get(rightId) ?? new Set<string>();
            rightNeighbors.add(leftId);
            adjacency.set(rightId, rightNeighbors);

            const reasons = edgeReasons.get(pairKey) ?? new Set<string>();
            match.reasons.forEach((reason) => reasons.add(reason));
            edgeReasons.set(pairKey, reasons);
        }
    }

    const visited = new Set<string>();
    const clusters: Array<{
        key: string;
        reasons: string[];
        businesses: Array<Record<string, any> & DecoratedBusinessProfile>;
    }> = [];

    for (const business of businesses) {
        const rootId = String(business.id);
        if (visited.has(rootId) || !adjacency.has(rootId)) {
            continue;
        }

        const stack = [rootId];
        const component = new Set<string>();

        while (stack.length > 0) {
            const currentId = stack.pop()!;
            if (visited.has(currentId)) {
                continue;
            }

            visited.add(currentId);
            component.add(currentId);

            const neighbors = adjacency.get(currentId);
            if (!neighbors) {
                continue;
            }

            neighbors.forEach((neighborId) => {
                if (!visited.has(neighborId)) {
                    stack.push(neighborId);
                }
            });
        }

        if (component.size < 2) {
            continue;
        }

        const componentIds = [...component].sort();
        const reasons = new Set<string>();
        for (let index = 0; index < componentIds.length; index += 1) {
            for (let nextIndex = index + 1; nextIndex < componentIds.length; nextIndex += 1) {
                const pairKey = [componentIds[index], componentIds[nextIndex]].sort().join(':');
                edgeReasons.get(pairKey)?.forEach((reason) => reasons.add(reason));
            }
        }

        clusters.push({
            key: componentIds.join(':'),
            reasons: [...reasons].sort((left, right) => left.localeCompare(right)),
            businesses: componentIds
                .map((id) => businessById.get(id))
                .filter((entry): entry is Record<string, any> & DecoratedBusinessProfile => Boolean(entry)),
        });
    }

    return clusters.sort((left, right) => {
        if (right.businesses.length !== left.businesses.length) {
            return right.businesses.length - left.businesses.length;
        }

        return left.key.localeCompare(right.key);
    });
}

function scoreDuplicatePair(
    left: Record<string, any>,
    right: Record<string, any>,
): {
    score: number;
    reasons: string[];
} {
    const reasons = new Set<string>();
    let score = 0;

    const leftName = normalizeDuplicateValue(left.name);
    const rightName = normalizeDuplicateValue(right.name);
    const leftSlug = normalizeSlugValue(left.slug);
    const rightSlug = normalizeSlugValue(right.slug);
    const leftPhone = normalizeDigits(left.phone);
    const rightPhone = normalizeDigits(right.phone);
    const leftWhatsapp = normalizeDigits(left.whatsapp);
    const rightWhatsapp = normalizeDigits(right.whatsapp);
    const leftWebsite = normalizeWebsite(left.website);
    const rightWebsite = normalizeWebsite(right.website);
    const leftInstagram = normalizeHandle(left.instagramUrl);
    const rightInstagram = normalizeHandle(right.instagramUrl);
    const leftAddress = normalizeDuplicateValue(left.address);
    const rightAddress = normalizeDuplicateValue(right.address);
    const leftProvinceId = String(left.province?.id ?? '');
    const rightProvinceId = String(right.province?.id ?? '');
    const leftCityId = String(left.city?.id ?? '');
    const rightCityId = String(right.city?.id ?? '');
    const leftSectorId = String(left.sector?.id ?? '');
    const rightSectorId = String(right.sector?.id ?? '');
    const sameProvince = Boolean(leftProvinceId && rightProvinceId && leftProvinceId === rightProvinceId);
    const sameCity = Boolean(leftCityId && rightCityId && leftCityId === rightCityId);
    const sameSector = Boolean(leftSectorId && rightSectorId && leftSectorId === rightSectorId);
    const leftCategoryIds = extractCategoryIds(left);
    const rightCategoryIds = extractCategoryIds(right);
    const sharedCategories = leftCategoryIds.filter((categoryId) => rightCategoryIds.includes(categoryId));
    const coordinateDistanceKm = calculateCoordinateDistanceKm(left, right);
    const tokenOverlap = calculateTokenOverlap(leftName, rightName);

    if (leftPhone && rightPhone && leftPhone === rightPhone) {
        score += 92;
        reasons.add('telefono_compartido');
    }

    if (leftWhatsapp && rightWhatsapp && leftWhatsapp === rightWhatsapp) {
        score += 90;
        reasons.add('whatsapp_compartido');
    }

    if (leftPhone && rightWhatsapp && leftPhone === rightWhatsapp) {
        score += 90;
        reasons.add('telefono_whatsapp_cruzado');
    }

    if (leftWhatsapp && rightPhone && leftWhatsapp === rightPhone) {
        score += 90;
        reasons.add('telefono_whatsapp_cruzado');
    }

    if (leftWebsite && rightWebsite && leftWebsite === rightWebsite) {
        score += 84;
        reasons.add('website_compartido');
    }

    if (leftInstagram && rightInstagram && leftInstagram === rightInstagram) {
        score += 78;
        reasons.add('instagram_compartido');
    }

    if (leftName && rightName && leftName === rightName) {
        score += 64;
        reasons.add('nombre_exacto');
    } else if (leftName && rightName && tokenOverlap >= 0.8) {
        score += 42;
        reasons.add('nombre_similar');
    }

    if (leftSlug && rightSlug && leftSlug === rightSlug) {
        score += 52;
        reasons.add('slug_compartido');
    }

    if (leftAddress && rightAddress && leftAddress === rightAddress) {
        score += 46;
        reasons.add('direccion_exacta');
    } else if (leftAddress && rightAddress && calculateTokenOverlap(leftAddress, rightAddress) >= 0.75) {
        score += 24;
        reasons.add('direccion_similar');
    }

    if (sameProvince) {
        score += 3;
        reasons.add('provincia_compartida');
    }

    if (sameCity) {
        score += 5;
        reasons.add('ciudad_compartida');
    }

    if (sameSector) {
        score += 4;
        reasons.add('sector_compartido');
    }

    if (sharedCategories.length > 0) {
        score += 6;
        reasons.add('categoria_compartida');
    }

    if (coordinateDistanceKm !== null && coordinateDistanceKm <= 0.15) {
        score += 14;
        reasons.add('coordenadas_cercanas');
    } else if (coordinateDistanceKm !== null && coordinateDistanceKm <= 0.5) {
        score += 8;
        reasons.add('coordenadas_cercanas');
    }

    const strongNameMatch = reasons.has('nombre_exacto') || reasons.has('nombre_similar');
    const strongAddressMatch = reasons.has('direccion_exacta') || reasons.has('direccion_similar');
    if (strongNameMatch && sharedCategories.length > 0 && (sameCity || sameProvince)) {
        score += 14;
        reasons.add('nombre_categoria_ubicacion');
    }

    if (strongNameMatch && strongAddressMatch) {
        score += 10;
        reasons.add('nombre_y_direccion');
    }

    return {
        score: Math.min(score, 99),
        reasons: [...reasons],
    };
}

function normalizeDuplicateValue(value?: string | null): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeSlugValue(value?: string | null): string {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}

function normalizeDigits(value?: string | null): string | null {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits.length >= 7 ? digits : null;
}

function normalizeWebsite(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return null;
    }

    return normalized
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/+$/, '')
        .toLowerCase();
}

function normalizeHandle(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return null;
    }

    const withoutProtocol = normalized
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/^instagram\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/+$/, '');

    return withoutProtocol.trim().toLowerCase() || null;
}

function calculateTokenOverlap(left: string, right: string): number {
    if (!left || !right) {
        return 0;
    }

    const leftTokens = new Set(left.split(' ').filter((token) => token.length >= 3));
    const rightTokens = new Set(right.split(' ').filter((token) => token.length >= 3));
    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return 0;
    }

    let shared = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) {
            shared += 1;
        }
    });

    return shared / Math.max(leftTokens.size, rightTokens.size);
}

function extractCategoryIds(business: Record<string, any>): string[] {
    const categoryIds: string[] = (business.categories ?? [])
        .map((entry: { category?: { id?: string } }) => entry.category?.id)
        .filter((value: string | undefined): value is string => Boolean(value));

    return Array.from(new Set(categoryIds));
}

function calculateCoordinateDistanceKm(
    left: Record<string, any>,
    right: Record<string, any>,
): number | null {
    const leftLatitude = typeof left.latitude === 'number' ? left.latitude : null;
    const leftLongitude = typeof left.longitude === 'number' ? left.longitude : null;
    const rightLatitude = typeof right.latitude === 'number' ? right.latitude : null;
    const rightLongitude = typeof right.longitude === 'number' ? right.longitude : null;

    if (leftLatitude === null || leftLongitude === null || rightLatitude === null || rightLongitude === null) {
        return null;
    }

    const earthRadiusKm = 6371;
    const deltaLat = toRadians(rightLatitude - leftLatitude);
    const deltaLng = toRadians(rightLongitude - leftLongitude);
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(toRadians(leftLatitude))
        * Math.cos(toRadians(rightLatitude))
        * Math.sin(deltaLng / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number): number {
    return value * (Math.PI / 180);
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
    ownerId?: string | null,
    businessOrganizationId?: string | null,
    ownerships?: Array<{ organizationId: string }> | null,
    userId?: string,
    userRole?: string,
    currentOrganizationId?: string,
): boolean {
    if (!userId) {
        return false;
    }

    if ((ownerId && ownerId === userId) || userRole === 'ADMIN') {
        return true;
    }

    return Boolean(
        currentOrganizationId
        && currentOrganizationId === resolveActiveBusinessOrganizationId({
            organizationId: businessOrganizationId,
            ownerships,
        }),
    );
}
