CREATE TYPE "BusinessSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "BusinessDuplicateCaseStatus" AS ENUM ('DISMISSED', 'CONFLICT', 'MERGED');

ALTER TYPE "GrowthEventType" ADD VALUE IF NOT EXISTS 'CLAIM_CTA_CLICK';
ALTER TYPE "GrowthEventType" ADD VALUE IF NOT EXISTS 'CLAIM_REQUEST_SUBMITTED';
ALTER TYPE "GrowthEventType" ADD VALUE IF NOT EXISTS 'USER_SUGGESTION_SUBMITTED';

ALTER TABLE "businesses"
ALTER COLUMN "ownerId" DROP NOT NULL,
ALTER COLUMN "organizationId" DROP NOT NULL;

UPDATE "businesses" AS b
SET
    "ownerId" = NULL,
    "organizationId" = NULL,
    "claimedAt" = NULL,
    "claimedByUserId" = NULL
FROM "organizations" AS o
WHERE b."organizationId" = o."id"
  AND o."slug" = 'aquita-catalog-system'
  AND b."claimStatus" <> 'CLAIMED';

UPDATE "businesses" AS b
SET
    "ownerId" = NULL,
    "claimedAt" = NULL,
    "claimedByUserId" = NULL
FROM "users" AS u
WHERE b."ownerId" = u."id"
  AND u."email" = 'catalog@internal.aquita.do'
  AND b."claimStatus" <> 'CLAIMED';

CREATE TABLE "business_suggestions" (
    "id" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "address" VARCHAR(500),
    "provinceId" TEXT,
    "cityId" TEXT,
    "phone" VARCHAR(20),
    "whatsapp" VARCHAR(20),
    "website" VARCHAR(255),
    "email" VARCHAR(160),
    "notes" TEXT,
    "status" "BusinessSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdBusinessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_duplicate_cases" (
    "id" TEXT NOT NULL,
    "clusterKey" VARCHAR(255) NOT NULL,
    "status" "BusinessDuplicateCaseStatus" NOT NULL,
    "businessIds" JSONB NOT NULL,
    "reasons" JSONB,
    "primaryBusinessId" TEXT,
    "resolvedByAdminId" TEXT,
    "resolutionNotes" TEXT,
    "resolutionMeta" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_duplicate_cases_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "business_suggestions"
ADD CONSTRAINT "business_suggestions_submittedByUserId_fkey"
FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_suggestions"
ADD CONSTRAINT "business_suggestions_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_suggestions"
ADD CONSTRAINT "business_suggestions_provinceId_fkey"
FOREIGN KEY ("provinceId") REFERENCES "provinces"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_suggestions"
ADD CONSTRAINT "business_suggestions_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "cities"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_suggestions"
ADD CONSTRAINT "business_suggestions_reviewedByAdminId_fkey"
FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_suggestions"
ADD CONSTRAINT "business_suggestions_createdBusinessId_fkey"
FOREIGN KEY ("createdBusinessId") REFERENCES "businesses"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_duplicate_cases"
ADD CONSTRAINT "business_duplicate_cases_primaryBusinessId_fkey"
FOREIGN KEY ("primaryBusinessId") REFERENCES "businesses"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_duplicate_cases"
ADD CONSTRAINT "business_duplicate_cases_resolvedByAdminId_fkey"
FOREIGN KEY ("resolvedByAdminId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "business_duplicate_cases_clusterKey_key"
ON "business_duplicate_cases"("clusterKey");

CREATE INDEX "business_suggestions_submittedByUserId_status_createdAt_idx"
ON "business_suggestions"("submittedByUserId", "status", "createdAt");

CREATE INDEX "business_suggestions_status_createdAt_idx"
ON "business_suggestions"("status", "createdAt");

CREATE INDEX "business_suggestions_reviewedByAdminId_reviewedAt_idx"
ON "business_suggestions"("reviewedByAdminId", "reviewedAt");

CREATE INDEX "business_suggestions_createdBusinessId_idx"
ON "business_suggestions"("createdBusinessId");

CREATE INDEX "business_duplicate_cases_status_createdAt_idx"
ON "business_duplicate_cases"("status", "createdAt");

CREATE INDEX "business_duplicate_cases_resolvedByAdminId_resolvedAt_idx"
ON "business_duplicate_cases"("resolvedByAdminId", "resolvedAt");

CREATE INDEX "business_duplicate_cases_primaryBusinessId_idx"
ON "business_duplicate_cases"("primaryBusinessId");
