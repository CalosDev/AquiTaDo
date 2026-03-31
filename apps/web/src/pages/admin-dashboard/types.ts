export interface ModerationQueueItem {
    id: string;
    queueType: 'BUSINESS_VERIFICATION' | 'BUSINESS_PREMODERATION' | 'DOCUMENT_REVIEW' | 'REVIEW_MODERATION';
    entityId: string;
    status: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    createdAt: string;
    organization: {
        id: string;
        name: string;
        slug: string;
    };
    business: {
        id: string;
        name: string;
        slug: string;
        riskScore: number;
    };
    payload?: {
        verificationNotes?: string | null;
        preventiveScore?: number;
        preventiveSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
        preventiveRiskClusters?: string[];
        preventiveReasons?: string[];
        preventiveSuggestedActions?: string[];
        documentType?: string;
        moderationReason?: string | null;
    };
}

export type TrendDirection = 'up' | 'down' | 'flat';

export type TrendMetricSnapshot = {
    current: number;
    previous: number;
    delta: number;
    direction: TrendDirection;
};

export interface GrowthInsightsSnapshot {
    range: {
        days: number;
        from: string;
        to: string;
    };
    topSearchedCategories: Array<{
        categoryId: string | null;
        categoryName: string;
        searches: number;
        supplyBusinesses: number;
        demandSupplyRatio: number;
    }>;
    demandSupplyGaps: Array<{
        provinceId: string | null;
        provinceName: string;
        categoryId: string | null;
        categoryName: string;
        demandSearches: number;
        supplyBusinesses: number;
        demandSupplyRatio: number;
    }>;
    conversionFunnels: {
        searchToWhatsApp: {
            uniqueSearchVisitors: number;
            uniqueWhatsAppVisitors: number;
            conversionRate: number;
        };
    };
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
        topReasons: Array<{
            reason: string;
            count: number;
        }>;
    };
    onboardingMetrics: {
        step1Sessions: number;
        step2Sessions: number;
        step3Sessions: number;
        step4Sessions: number;
        completedSessions: number;
        completionRatePct: number;
    };
    actionableAlerts: Array<{
        level: 'HIGH' | 'MEDIUM';
        title: string;
        description: string;
        metricKey: string;
        owner: string;
        cadence: 'Diario' | 'Semanal';
        slaHours: number;
        playbookSection: string;
        recommendedAction: string;
    }>;
    trendComparisons: {
        comparisonLabel: string;
        activation: {
            recoveryCompletionRatePct: TrendMetricSnapshot;
            passwordResetRequests: TrendMetricSnapshot;
            googleAuthSuccesses: TrendMetricSnapshot;
            shareClicks: TrendMetricSnapshot;
        };
        discovery: {
            mapSelectionRatePct: TrendMetricSnapshot;
            listingResultClicks: TrendMetricSnapshot;
            mapViewChanges: TrendMetricSnapshot;
            listingFilterApplies: TrendMetricSnapshot;
        };
        moderation: {
            releaseRatePct: TrendMetricSnapshot;
            premoderationFlagged: TrendMetricSnapshot;
            uniqueFlaggedBusinesses: TrendMetricSnapshot;
        };
        onboarding: {
            completionRatePct: TrendMetricSnapshot;
            step1Sessions: TrendMetricSnapshot;
            completedSessions: TrendMetricSnapshot;
        };
    };
    abTesting: {
        experiment: string;
        winner?: {
            variantKey: string;
            contactClicks: number;
            whatsappClicks: number;
            conversionRate: number;
        } | null;
        variants: Array<{
            variantKey: string;
            contactClicks: number;
            whatsappClicks: number;
            conversionRate: number;
        }>;
    };
}
