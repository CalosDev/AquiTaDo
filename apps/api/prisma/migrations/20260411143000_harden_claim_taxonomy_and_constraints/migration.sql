DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'PHONE'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" RENAME VALUE 'PHONE' TO 'BUSINESS_PHONE';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'EMAIL_DOMAIN'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" RENAME VALUE 'EMAIL_DOMAIN' TO 'BUSINESS_EMAIL';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'DOCUMENT'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" RENAME VALUE 'DOCUMENT' TO 'TAX_DOCUMENT';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'SOCIAL'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" RENAME VALUE 'SOCIAL' TO 'SOCIAL_PROFILE';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'MANUAL'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" RENAME VALUE 'MANUAL' TO 'MANUAL_REVIEW';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'BRAND_ASSET'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" ADD VALUE 'BRAND_ASSET';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum enum_value
        JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
        WHERE enum_type.typname = 'BusinessClaimEvidenceType'
          AND enum_value.enumlabel = 'OTHER'
    ) THEN
        ALTER TYPE "BusinessClaimEvidenceType" ADD VALUE 'OTHER';
    END IF;
END $$;

WITH duplicate_active_by_business AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY "businessId"
            ORDER BY "grantedAt" DESC, "createdAt" DESC, id DESC
        ) AS row_rank
    FROM "business_ownerships"
    WHERE "isActive" = true
      AND role = 'PRIMARY_OWNER'
),
duplicate_active_by_org AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY "businessId", "organizationId"
            ORDER BY "grantedAt" DESC, "createdAt" DESC, id DESC
        ) AS row_rank
    FROM "business_ownerships"
    WHERE "isActive" = true
)
UPDATE "business_ownerships" ownership
SET
    "isActive" = false,
    "revokedAt" = COALESCE(ownership."revokedAt", NOW()),
    "revokeReason" = COALESCE(
        ownership."revokeReason",
        'Auto-normalized during ownership constraint alignment.'
    )
WHERE ownership.id IN (
    SELECT id FROM duplicate_active_by_business WHERE row_rank > 1
    UNION
    SELECT id FROM duplicate_active_by_org WHERE row_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_ownerships_active_primary_owner_idx"
ON "business_ownerships" ("businessId")
WHERE "isActive" = true AND role = 'PRIMARY_OWNER';

CREATE UNIQUE INDEX IF NOT EXISTS "business_ownerships_active_business_org_idx"
ON "business_ownerships" ("businessId", "organizationId")
WHERE "isActive" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "business_claim_requests_active_requester_idx"
ON "business_claim_requests" ("businessId", "requesterUserId")
WHERE status IN ('PENDING', 'UNDER_REVIEW');
