type ProfileCategory = {
    category?: {
        name?: string | null;
    } | null;
};

type ProfileImage = {
    url?: string | null;
    isCover?: boolean | null;
};

type ProfileCity = {
    name?: string | null;
};

type ProfileSector = {
    name?: string | null;
};

export type BusinessHourProfile = {
    dayOfWeek: number;
    opensAt?: string | null;
    closesAt?: string | null;
    closed?: boolean | null;
};

export type BusinessProfileCandidate = {
    description?: string | null;
    address?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    website?: string | null;
    email?: string | null;
    instagramUrl?: string | null;
    facebookUrl?: string | null;
    tiktokUrl?: string | null;
    priceRange?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    city?: ProfileCity | null;
    sector?: ProfileSector | null;
    categories?: ProfileCategory[];
    images?: ProfileImage[];
    hours?: BusinessHourProfile[];
};

const DOMINICAN_TIMEZONE = 'America/Santo_Domingo';

const WEEKDAY_LABELS_ES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'] as const;

function normalizeText(value: string | null | undefined): string {
    return (value ?? '').trim();
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }

    const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) {
        return null;
    }

    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) {
        return null;
    }

    return (hours * 60) + minutes;
}

function getDominicanTimeContext(referenceDate: Date) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: DOMINICAN_TIMEZONE,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(referenceDate);
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
    const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10);
    const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10);
    const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };

    return {
        dayOfWeek: dayMap[weekday] ?? 0,
        minutesOfDay: ((Number.isFinite(hour) ? hour : 0) * 60) + (Number.isFinite(minute) ? minute : 0),
    };
}

function scoreBusinessProfile(candidate: BusinessProfileCandidate): { points: number; maxPoints: number } {
    let points = 0;
    const maxPoints = 100;

    if (normalizeText(candidate.description)) {
        points += 16;
    }

    if (normalizeText(candidate.address)) {
        points += 14;
    }

    if (normalizeText(candidate.phone)) {
        points += 10;
    }

    if (normalizeText(candidate.whatsapp)) {
        points += 6;
    }

    if (normalizeText(candidate.website)) {
        points += 7;
    }

    if (normalizeText(candidate.email)) {
        points += 6;
    }

    if (
        normalizeText(candidate.instagramUrl)
        || normalizeText(candidate.facebookUrl)
        || normalizeText(candidate.tiktokUrl)
    ) {
        points += 6;
    }

    if (normalizeText(candidate.priceRange)) {
        points += 4;
    }

    if ((candidate.images ?? []).length > 0) {
        points += 8;
    }

    if ((candidate.images ?? []).some((image) => Boolean(image?.isCover))) {
        points += 4;
    }

    if ((candidate.categories ?? []).length > 0) {
        points += 8;
    }

    if (normalizeText(candidate.city?.name)) {
        points += 4;
    }

    if (normalizeText(candidate.sector?.name)) {
        points += 3;
    }

    if (typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number') {
        points += 6;
    }

    const hours = candidate.hours ?? [];
    if (hours.length > 0) {
        points += 4;
        const openDays = hours.filter((entry) => !entry.closed && entry.opensAt && entry.closesAt).length;
        if (openDays >= 5) {
            points += 4;
        }
    }

    return { points, maxPoints };
}

export function calculateBusinessProfileCompletenessScore(candidate: BusinessProfileCandidate): number {
    const { points, maxPoints } = scoreBusinessProfile(candidate);
    return Math.round((Math.min(points, maxPoints) / maxPoints) * 100);
}

export function listMissingBusinessProfileFields(candidate: BusinessProfileCandidate): string[] {
    const missing: string[] = [];

    if (!normalizeText(candidate.description)) {
        missing.push('descripcion');
    }
    if (!normalizeText(candidate.address)) {
        missing.push('direccion');
    }
    if (!normalizeText(candidate.phone)) {
        missing.push('telefono');
    }
    if (!normalizeText(candidate.website)) {
        missing.push('website');
    }
    if (!normalizeText(candidate.email)) {
        missing.push('email');
    }
    if (
        !normalizeText(candidate.instagramUrl)
        && !normalizeText(candidate.facebookUrl)
        && !normalizeText(candidate.tiktokUrl)
    ) {
        missing.push('redes');
    }
    if (!normalizeText(candidate.priceRange)) {
        missing.push('rango_de_precio');
    }
    if ((candidate.images ?? []).length === 0) {
        missing.push('imagenes');
    }
    if (!(candidate.hours ?? []).some((entry) => !entry.closed && entry.opensAt && entry.closesAt)) {
        missing.push('horarios');
    }
    if (!normalizeText(candidate.city?.name)) {
        missing.push('ciudad');
    }
    if (!normalizeText(candidate.sector?.name)) {
        missing.push('sector');
    }
    if (!(candidate.categories ?? []).length) {
        missing.push('categorias');
    }
    if (!(typeof candidate.latitude === 'number' && typeof candidate.longitude === 'number')) {
        missing.push('coordenadas');
    }

    return missing;
}

export function isBusinessOpenNow(
    hours: BusinessHourProfile[] | null | undefined,
    referenceDate: Date = new Date(),
): boolean | null {
    if (!hours || hours.length === 0) {
        return null;
    }

    const { dayOfWeek, minutesOfDay } = getDominicanTimeContext(referenceDate);
    const todayHours = hours.find((entry) => entry.dayOfWeek === dayOfWeek);
    if (!todayHours) {
        return null;
    }

    if (todayHours.closed) {
        return false;
    }

    const opensAt = parseTimeToMinutes(todayHours.opensAt);
    const closesAt = parseTimeToMinutes(todayHours.closesAt);
    if (opensAt === null || closesAt === null) {
        return null;
    }

    if (closesAt >= opensAt) {
        return minutesOfDay >= opensAt && minutesOfDay < closesAt;
    }

    return minutesOfDay >= opensAt || minutesOfDay < closesAt;
}

export function buildTodayBusinessHoursLabel(
    hours: BusinessHourProfile[] | null | undefined,
    referenceDate: Date = new Date(),
): string | null {
    if (!hours || hours.length === 0) {
        return null;
    }

    const { dayOfWeek } = getDominicanTimeContext(referenceDate);
    const todayHours = hours.find((entry) => entry.dayOfWeek === dayOfWeek);
    if (!todayHours) {
        return `${WEEKDAY_LABELS_ES[dayOfWeek]}: horario no disponible`;
    }

    if (todayHours.closed) {
        return `${WEEKDAY_LABELS_ES[dayOfWeek]}: cerrado`;
    }

    if (!todayHours.opensAt || !todayHours.closesAt) {
        return `${WEEKDAY_LABELS_ES[dayOfWeek]}: horario no disponible`;
    }

    return `${WEEKDAY_LABELS_ES[dayOfWeek]}: ${todayHours.opensAt} - ${todayHours.closesAt}`;
}
