import { GrowthEventType, Prisma } from '../generated/prisma/client';

export type GrowthSignalEventRow = {
    businessId: string | null;
    eventType: GrowthEventType;
    sessionId: string | null;
    metadata: Prisma.JsonValue | null;
    occurredAt: Date;
};

export type GrowthTrendDirection = 'up' | 'down' | 'flat';

export type GrowthTrendMetric = {
    current: number;
    previous: number;
    delta: number;
    direction: GrowthTrendDirection;
};

export type GrowthActionableAlert = {
    level: 'HIGH' | 'MEDIUM';
    title: string;
    description: string;
    metricKey: string;
    owner: string;
    cadence: 'Diario' | 'Semanal';
    slaHours: number;
    playbookSection: string;
    recommendedAction: string;
};

export type GrowthSignalSummary = {
    activationMetrics: {
        shareClicks: number;
        passwordResetRequests: number;
        passwordResetCompletions: number;
        googleAuthSuccesses: number;
        googleAuthLoginSuccesses: number;
        googleAuthRegistrationSuccesses: number;
        stickyPhoneClicks: number;
        stickyWhatsAppClicks: number;
        totalWhatsAppClicks: number;
    };
    discoveryMetrics: {
        listingFilterApplies: number;
        listingSortChanges: number;
        mapViewChanges: number;
        listViewChanges: number;
        mapSelections: number;
        listingResultClicks: number;
        sponsoredResultClicks: number;
    };
    moderationMetrics: {
        premoderationFlagged: number;
        uniqueFlaggedBusinesses: number;
        premoderationReleased: number;
        premoderationConfirmed: number;
        releaseRatePct: number;
        topReasons: Array<{ reason: string; count: number }>;
    };
    onboardingMetrics: {
        step1Sessions: number;
        step2Sessions: number;
        step3Sessions: number;
        step4Sessions: number;
        completedSessions: number;
        completionRatePct: number;
    };
    derivedMetrics: {
        recoveryCompletionRatePct: number;
        mapSelectionRatePct: number;
    };
};

export function buildGrowthSignalSummary(
    rows: GrowthSignalEventRow[],
    limit: number,
): GrowthSignalSummary {
    const activationMetrics = {
        shareClicks: 0,
        passwordResetRequests: 0,
        passwordResetCompletions: 0,
        googleAuthSuccesses: 0,
        googleAuthLoginSuccesses: 0,
        googleAuthRegistrationSuccesses: 0,
        stickyPhoneClicks: 0,
        stickyWhatsAppClicks: 0,
        totalWhatsAppClicks: 0,
    };
    const discoveryMetrics = {
        listingFilterApplies: 0,
        listingSortChanges: 0,
        mapViewChanges: 0,
        listViewChanges: 0,
        mapSelections: 0,
        listingResultClicks: 0,
        sponsoredResultClicks: 0,
    };
    const flaggedBusinessIds = new Set<string>();
    const moderationReasonCounts = new Map<string, number>();
    const moderationMetrics = {
        premoderationFlagged: 0,
        uniqueFlaggedBusinesses: 0,
        premoderationReleased: 0,
        premoderationConfirmed: 0,
        releaseRatePct: 0,
        topReasons: [] as Array<{ reason: string; count: number }>,
    };
    const onboardingStepSessions = {
        1: new Set<string>(),
        2: new Set<string>(),
        3: new Set<string>(),
        4: new Set<string>(),
    };
    const onboardingCompletionSessions = new Set<string>();
    const onboardingMetrics = {
        step1Sessions: 0,
        step2Sessions: 0,
        step3Sessions: 0,
        step4Sessions: 0,
        completedSessions: 0,
        completionRatePct: 0,
    };

    for (const row of rows) {
        switch (row.eventType) {
            case GrowthEventType.SEARCH_RESULT_CLICK: {
                const source = readMetadataString(row.metadata, 'source');
                if (source === 'businesses-list' || source === 'listing-map-selected') {
                    discoveryMetrics.listingResultClicks += 1;
                }
                if (source === 'sponsored-placement') {
                    discoveryMetrics.sponsoredResultClicks += 1;
                }
                break;
            }
            case GrowthEventType.SHARE_CLICK:
                activationMetrics.shareClicks += 1;
                break;
            case GrowthEventType.PASSWORD_RESET_REQUEST:
                activationMetrics.passwordResetRequests += 1;
                break;
            case GrowthEventType.PASSWORD_RESET_COMPLETE:
                activationMetrics.passwordResetCompletions += 1;
                break;
            case GrowthEventType.GOOGLE_AUTH_SUCCESS: {
                activationMetrics.googleAuthSuccesses += 1;
                const intent = readMetadataString(row.metadata, 'intent');
                if (intent === 'login') {
                    activationMetrics.googleAuthLoginSuccesses += 1;
                } else if (intent === 'register') {
                    activationMetrics.googleAuthRegistrationSuccesses += 1;
                }
                break;
            }
            case GrowthEventType.CONTACT_CLICK: {
                const placement = readMetadataString(row.metadata, 'placement');
                const channel = readMetadataString(row.metadata, 'channel');
                if (placement === 'sticky_mobile' && channel === 'phone') {
                    activationMetrics.stickyPhoneClicks += 1;
                }
                break;
            }
            case GrowthEventType.WHATSAPP_CLICK: {
                activationMetrics.totalWhatsAppClicks += 1;
                const placement = readMetadataString(row.metadata, 'placement');
                if (placement === 'sticky_mobile') {
                    activationMetrics.stickyWhatsAppClicks += 1;
                }
                break;
            }
            case GrowthEventType.LISTING_FILTER_APPLY: {
                const filterKey = readMetadataString(row.metadata, 'filterKey');
                if (filterKey === 'sort') {
                    discoveryMetrics.listingSortChanges += 1;
                } else {
                    discoveryMetrics.listingFilterApplies += 1;
                }
                break;
            }
            case GrowthEventType.LISTING_VIEW_CHANGE: {
                const nextView = readMetadataString(row.metadata, 'nextView');
                if (nextView === 'map') {
                    discoveryMetrics.mapViewChanges += 1;
                } else if (nextView === 'list') {
                    discoveryMetrics.listViewChanges += 1;
                }
                break;
            }
            case GrowthEventType.LISTING_MAP_SELECT:
                discoveryMetrics.mapSelections += 1;
                break;
            case GrowthEventType.PREMODERATION_FLAGGED: {
                moderationMetrics.premoderationFlagged += 1;
                if (row.businessId) {
                    flaggedBusinessIds.add(row.businessId);
                }
                readMetadataStringArray(row.metadata, 'reasons').forEach((reason) => {
                    moderationReasonCounts.set(reason, (moderationReasonCounts.get(reason) ?? 0) + 1);
                });
                break;
            }
            case GrowthEventType.PREMODERATION_RELEASED:
                moderationMetrics.premoderationReleased += 1;
                break;
            case GrowthEventType.PREMODERATION_CONFIRMED:
                moderationMetrics.premoderationConfirmed += 1;
                break;
            case GrowthEventType.BUSINESS_ONBOARDING_STEP: {
                const step = readMetadataNumber(row.metadata, 'step');
                if (!row.sessionId || !step || !(step in onboardingStepSessions)) {
                    break;
                }
                onboardingStepSessions[step as 1 | 2 | 3 | 4].add(row.sessionId);
                break;
            }
            case GrowthEventType.BUSINESS_ONBOARDING_COMPLETE:
                if (row.sessionId) {
                    onboardingCompletionSessions.add(row.sessionId);
                }
                break;
            default:
                break;
        }
    }

    moderationMetrics.uniqueFlaggedBusinesses = flaggedBusinessIds.size;
    const reviewedPremoderationCount =
        moderationMetrics.premoderationReleased + moderationMetrics.premoderationConfirmed;
    moderationMetrics.releaseRatePct = reviewedPremoderationCount > 0
        ? Number(((moderationMetrics.premoderationReleased / reviewedPremoderationCount) * 100).toFixed(2))
        : 0;
    moderationMetrics.topReasons = [...moderationReasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, limit);
    onboardingMetrics.step1Sessions = onboardingStepSessions[1].size;
    onboardingMetrics.step2Sessions = onboardingStepSessions[2].size;
    onboardingMetrics.step3Sessions = onboardingStepSessions[3].size;
    onboardingMetrics.step4Sessions = onboardingStepSessions[4].size;
    onboardingMetrics.completedSessions = onboardingCompletionSessions.size;
    onboardingMetrics.completionRatePct = onboardingMetrics.step1Sessions > 0
        ? Number(((onboardingMetrics.completedSessions / onboardingMetrics.step1Sessions) * 100).toFixed(2))
        : 0;

    return {
        activationMetrics,
        discoveryMetrics,
        moderationMetrics,
        onboardingMetrics,
        derivedMetrics: {
            recoveryCompletionRatePct: activationMetrics.passwordResetRequests > 0
                ? Number(((activationMetrics.passwordResetCompletions / activationMetrics.passwordResetRequests) * 100).toFixed(2))
                : 0,
            mapSelectionRatePct: discoveryMetrics.mapViewChanges > 0
                ? Number(((discoveryMetrics.mapSelections / discoveryMetrics.mapViewChanges) * 100).toFixed(2))
                : 0,
        },
    };
}

export function buildGrowthActionableAlerts(summary: GrowthSignalSummary): GrowthActionableAlert[] {
    const { activationMetrics, discoveryMetrics, moderationMetrics, onboardingMetrics, derivedMetrics } = summary;
    const actionableAlerts: GrowthActionableAlert[] = [];
    const reviewedPremoderationCount =
        moderationMetrics.premoderationReleased + moderationMetrics.premoderationConfirmed;

    if (activationMetrics.passwordResetRequests >= 5 && derivedMetrics.recoveryCompletionRatePct < 35) {
        actionableAlerts.push({
            level: 'MEDIUM',
            title: 'Recovery con baja finalizacion',
            description: `Solo ${derivedMetrics.recoveryCompletionRatePct}% de los resets solicitados se completaron en la ventana analizada.`,
            metricKey: 'password_reset_completion_rate',
            owner: 'Soporte',
            cadence: 'Diario',
            slaHours: 24,
            playbookSection: 'Recuperacion de contrasena',
            recommendedAction: 'Validar entregabilidad del correo, expiracion del enlace y uso del link mas reciente.',
        });
    }

    if (reviewedPremoderationCount >= 4 && moderationMetrics.releaseRatePct >= 40) {
        actionableAlerts.push({
            level: 'HIGH',
            title: 'Premoderacion con release rate elevado',
            description: `${moderationMetrics.releaseRatePct}% de los casos revisados terminaron liberados a KYC; conviene revisar scoring y razones.`,
            metricKey: 'premoderation_release_rate',
            owner: 'Trust & Safety',
            cadence: 'Diario',
            slaHours: 8,
            playbookSection: 'Premoderacion previa a verificacion',
            recommendedAction: 'Revisar top razones, falsos positivos y recalibrar scoring antes de liberar mas volumen.',
        });
    }

    if (discoveryMetrics.mapViewChanges >= 8 && derivedMetrics.mapSelectionRatePct < 25) {
        actionableAlerts.push({
            level: 'MEDIUM',
            title: 'Mapa abierto con poca seleccion',
            description: `La vista mapa tuvo ${discoveryMetrics.mapViewChanges} aperturas pero solo ${discoveryMetrics.mapSelections} selecciones (${derivedMetrics.mapSelectionRatePct}%).`,
            metricKey: 'listing_map_selection_rate',
            owner: 'Growth',
            cadence: 'Semanal',
            slaHours: 72,
            playbookSection: 'Discovery lista/mapa',
            recommendedAction: 'Revisar markers, viewport inicial y contraste de las cards destacadas en el mapa.',
        });
    }

    if (onboardingMetrics.step1Sessions >= 5 && onboardingMetrics.completionRatePct < 45) {
        actionableAlerts.push({
            level: 'HIGH',
            title: 'Onboarding de negocios con friccion',
            description: `Solo ${onboardingMetrics.completionRatePct}% de las sesiones que iniciaron el flujo llegaron a publicacion.`,
            metricKey: 'business_onboarding_completion_rate',
            owner: 'Producto',
            cadence: 'Semanal',
            slaHours: 48,
            playbookSection: 'Onboarding de negocios',
            recommendedAction: 'Revisar salto entre pasos, campos abandonados y simplificar copy o microinteracciones en el paso con mayor caida.',
        });
    }

    return actionableAlerts;
}

export function buildTrendMetric(
    current: number,
    previous: number,
    precision = 2,
): GrowthTrendMetric {
    const normalize = (value: number) => (
        precision === 0
            ? Math.round(value)
            : Number(value.toFixed(precision))
    );
    const normalizedCurrent = normalize(current);
    const normalizedPrevious = normalize(previous);
    const delta = normalize(normalizedCurrent - normalizedPrevious);

    return {
        current: normalizedCurrent,
        previous: normalizedPrevious,
        delta,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    };
}

function readMetadataString(metadata: Prisma.JsonValue | null, key: string): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }

    const candidate = (metadata as Record<string, Prisma.JsonValue>)[key];
    return typeof candidate === 'string' ? candidate : null;
}

function readMetadataStringArray(metadata: Prisma.JsonValue | null, key: string): string[] {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return [];
    }

    const candidate = (metadata as Record<string, Prisma.JsonValue>)[key];
    if (!Array.isArray(candidate)) {
        return [];
    }

    return candidate.filter((value): value is string => typeof value === 'string');
}

function readMetadataNumber(metadata: Prisma.JsonValue | null, key: string): number | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }

    const candidate = (metadata as Record<string, Prisma.JsonValue>)[key];
    return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}
