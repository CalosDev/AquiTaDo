export type LegacyCatalogSource = 'ADMIN' | 'OWNER' | 'IMPORT' | 'USER_SUGGESTION' | 'SYSTEM';
export type CanonicalCatalogSource =
    | 'OWNER_CREATED'
    | 'ADMIN_CREATED'
    | 'USER_SUGGESTED'
    | 'IMPORTED'
    | 'SYSTEM_MIGRATED';
export type LegacyPublicStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SUSPENDED';
export type BusinessLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'SOFT_DELETED';
export type SimplifiedClaimEvidenceType = 'PHONE' | 'EMAIL_DOMAIN' | 'DOCUMENT' | 'SOCIAL' | 'MANUAL';
export type CanonicalClaimEvidenceType =
    | 'BUSINESS_EMAIL'
    | 'BUSINESS_PHONE'
    | 'SOCIAL_PROFILE'
    | 'TAX_DOCUMENT'
    | 'BRAND_ASSET'
    | 'MANUAL_REVIEW'
    | 'OTHER';

const CANONICAL_TO_LEGACY_SOURCE: Record<CanonicalCatalogSource, LegacyCatalogSource> = {
    OWNER_CREATED: 'OWNER',
    ADMIN_CREATED: 'ADMIN',
    USER_SUGGESTED: 'USER_SUGGESTION',
    IMPORTED: 'IMPORT',
    SYSTEM_MIGRATED: 'SYSTEM',
};

const LEGACY_TO_CANONICAL_SOURCE: Record<LegacyCatalogSource, CanonicalCatalogSource> = {
    OWNER: 'OWNER_CREATED',
    ADMIN: 'ADMIN_CREATED',
    USER_SUGGESTION: 'USER_SUGGESTED',
    IMPORT: 'IMPORTED',
    SYSTEM: 'SYSTEM_MIGRATED',
};

const CANONICAL_TO_SIMPLIFIED_EVIDENCE: Record<CanonicalClaimEvidenceType, SimplifiedClaimEvidenceType> = {
    BUSINESS_EMAIL: 'EMAIL_DOMAIN',
    BUSINESS_PHONE: 'PHONE',
    SOCIAL_PROFILE: 'SOCIAL',
    TAX_DOCUMENT: 'DOCUMENT',
    BRAND_ASSET: 'DOCUMENT',
    MANUAL_REVIEW: 'MANUAL',
    OTHER: 'MANUAL',
};

const SIMPLIFIED_TO_CANONICAL_EVIDENCE: Record<SimplifiedClaimEvidenceType, CanonicalClaimEvidenceType> = {
    PHONE: 'BUSINESS_PHONE',
    EMAIL_DOMAIN: 'BUSINESS_EMAIL',
    DOCUMENT: 'TAX_DOCUMENT',
    SOCIAL: 'SOCIAL_PROFILE',
    MANUAL: 'MANUAL_REVIEW',
};

export function normalizeCatalogSource(value?: string | null): LegacyCatalogSource | null {
    if (!value) {
        return null;
    }

    if (value in LEGACY_TO_CANONICAL_SOURCE) {
        return value as LegacyCatalogSource;
    }

    if (value in CANONICAL_TO_LEGACY_SOURCE) {
        return CANONICAL_TO_LEGACY_SOURCE[value as CanonicalCatalogSource];
    }

    return 'SYSTEM';
}

export function toCanonicalCatalogSource(value?: string | null): CanonicalCatalogSource {
    if (!value) {
        return 'SYSTEM_MIGRATED';
    }

    if (value in LEGACY_TO_CANONICAL_SOURCE) {
        return LEGACY_TO_CANONICAL_SOURCE[value as LegacyCatalogSource];
    }

    if (value in CANONICAL_TO_LEGACY_SOURCE) {
        return value as CanonicalCatalogSource;
    }

    return 'SYSTEM_MIGRATED';
}

export function toLifecycleStatus(input: {
    lifecycleStatus?: string | null;
    publicStatus?: string | null;
    deletedAt?: Date | string | null;
    isActive?: boolean | null;
}): BusinessLifecycleStatus {
    if (input.lifecycleStatus === 'DRAFT'
        || input.lifecycleStatus === 'PUBLISHED'
        || input.lifecycleStatus === 'ARCHIVED'
        || input.lifecycleStatus === 'SOFT_DELETED') {
        return input.lifecycleStatus;
    }

    if (input.deletedAt || input.isActive === false) {
        return 'SOFT_DELETED';
    }

    if (input.publicStatus === 'DRAFT') {
        return 'DRAFT';
    }

    if (input.publicStatus === 'ARCHIVED' || input.publicStatus === 'SUSPENDED') {
        return 'ARCHIVED';
    }

    return 'PUBLISHED';
}

export function toPublicStatusFromLifecycleStatus(
    lifecycleStatus?: string | null,
    fallback: LegacyPublicStatus = 'PUBLISHED',
): LegacyPublicStatus {
    if (lifecycleStatus === 'DRAFT') {
        return 'DRAFT';
    }

    if (lifecycleStatus === 'PUBLISHED') {
        return 'PUBLISHED';
    }

    if (lifecycleStatus === 'ARCHIVED' || lifecycleStatus === 'SOFT_DELETED') {
        return 'ARCHIVED';
    }

    return fallback;
}

export function normalizeClaimEvidenceType(value?: string | null): SimplifiedClaimEvidenceType | null {
    if (!value) {
        return null;
    }

    if (value in SIMPLIFIED_TO_CANONICAL_EVIDENCE) {
        return value as SimplifiedClaimEvidenceType;
    }

    if (value in CANONICAL_TO_SIMPLIFIED_EVIDENCE) {
        return CANONICAL_TO_SIMPLIFIED_EVIDENCE[value as CanonicalClaimEvidenceType];
    }

    return 'MANUAL';
}

export function toCanonicalClaimEvidenceType(value?: string | null): CanonicalClaimEvidenceType {
    if (!value) {
        return 'MANUAL_REVIEW';
    }

    if (value in SIMPLIFIED_TO_CANONICAL_EVIDENCE) {
        return SIMPLIFIED_TO_CANONICAL_EVIDENCE[value as SimplifiedClaimEvidenceType];
    }

    if (value in CANONICAL_TO_SIMPLIFIED_EVIDENCE) {
        return value as CanonicalClaimEvidenceType;
    }

    return 'MANUAL_REVIEW';
}
