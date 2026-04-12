DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum
        WHERE enumlabel = 'SUSPENDED'
          AND enumtypid = to_regtype('"BusinessClaimStatus"')
    ) THEN
        ALTER TYPE "BusinessClaimStatus" ADD VALUE 'SUSPENDED';
    END IF;
END $$;

CREATE TYPE "BusinessClaimEvidenceType_new" AS ENUM (
    'PHONE',
    'EMAIL_DOMAIN',
    'DOCUMENT',
    'SOCIAL',
    'MANUAL'
);

ALTER TABLE "business_claim_requests"
ALTER COLUMN "evidenceType"
TYPE "BusinessClaimEvidenceType_new"
USING (
    CASE
        WHEN "evidenceType"::text = 'PHONE' THEN 'PHONE'
        WHEN "evidenceType"::text = 'EMAIL' THEN 'EMAIL_DOMAIN'
        WHEN "evidenceType"::text = 'DOCUMENT' THEN 'DOCUMENT'
        WHEN "evidenceType"::text IN ('WEBSITE', 'INSTAGRAM') THEN 'SOCIAL'
        ELSE 'MANUAL'
    END
)::"BusinessClaimEvidenceType_new";

ALTER TYPE "BusinessClaimEvidenceType" RENAME TO "BusinessClaimEvidenceType_old";
ALTER TYPE "BusinessClaimEvidenceType_new" RENAME TO "BusinessClaimEvidenceType";
DROP TYPE "BusinessClaimEvidenceType_old";

ALTER TABLE "businesses"
ADD COLUMN     "catalogSource" "BusinessSource" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "primaryManagingOrganizationId" TEXT,
ADD COLUMN     "legacyOwnerMode" BOOLEAN NOT NULL DEFAULT false;

UPDATE "businesses" b
SET "catalogSource" = b."source",
    "isActive" = CASE WHEN b."deletedAt" IS NULL THEN true ELSE false END,
    "primaryManagingOrganizationId" = COALESCE(
        (
            SELECT bo."organizationId"
            FROM "business_ownerships" bo
            WHERE bo."businessId" = b."id"
              AND bo."isActive" = true
            ORDER BY bo."grantedAt" DESC, bo."createdAt" DESC
            LIMIT 1
        ),
        b."organizationId"
    ),
    "legacyOwnerMode" = CASE
        WHEN b."ownerId" IS NOT NULL OR b."organizationId" IS NOT NULL THEN true
        ELSE false
    END;

ALTER TABLE "businesses"
ALTER COLUMN "publicStatus" SET DEFAULT 'PUBLISHED',
ALTER COLUMN "claimStatus" SET DEFAULT 'UNCLAIMED',
ALTER COLUMN "source" SET DEFAULT 'SYSTEM';

ALTER TABLE "businesses"
ADD CONSTRAINT "businesses_primaryManagingOrganizationId_fkey"
FOREIGN KEY ("primaryManagingOrganizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX "businesses_catalogSource_createdAt_idx" ON "businesses"("catalogSource", "createdAt");
CREATE INDEX "businesses_primaryManagingOrganizationId_idx" ON "businesses"("primaryManagingOrganizationId");
CREATE INDEX "businesses_isActive_publicStatus_claimStatus_idx" ON "businesses"("isActive", "publicStatus", "claimStatus");
