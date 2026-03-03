type TrustLevel = 'ALTA' | 'MEDIA' | 'BAJA';

type TrustInput = {
    verified?: boolean;
    averageRating?: number | null;
    reviewsCount?: number;
    reputationScore?: number | string | null;
    hasPhone?: boolean;
    hasWhatsapp?: boolean;
    hasImages?: boolean;
    hasDescription?: boolean;
    hasAddress?: boolean;
};

function toFiniteNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function calculateBusinessTrustScore(input: TrustInput): { score: number; level: TrustLevel } {
    let score = 20;

    if (input.verified) {
        score += 22;
    }

    const reputation = toFiniteNumber(input.reputationScore);
    if (reputation !== null) {
        score += clamp(reputation, 0, 100) * 0.25;
    }

    const rating = toFiniteNumber(input.averageRating);
    if (rating !== null) {
        score += clamp(rating, 0, 5) * 8;
    }

    const reviewsCount = clamp(input.reviewsCount ?? 0, 0, 30);
    score += (reviewsCount / 30) * 16;

    const completenessFlags = [
        Boolean(input.hasPhone),
        Boolean(input.hasWhatsapp),
        Boolean(input.hasImages),
        Boolean(input.hasDescription),
        Boolean(input.hasAddress),
    ];
    const completeness = completenessFlags.filter(Boolean).length;
    score += completeness * 4;

    const normalizedScore = Math.round(clamp(score, 0, 100));
    const level: TrustLevel = normalizedScore >= 80 ? 'ALTA' : normalizedScore >= 60 ? 'MEDIA' : 'BAJA';

    return {
        score: normalizedScore,
        level,
    };
}
