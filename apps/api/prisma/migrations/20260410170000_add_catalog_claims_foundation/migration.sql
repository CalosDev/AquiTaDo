CREATE TYPE "BusinessPublicStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'SUSPENDED');
CREATE TYPE "BusinessClaimStatus" AS ENUM ('UNCLAIMED', 'PENDING_CLAIM', 'CLAIMED');
CREATE TYPE "BusinessSource" AS ENUM ('ADMIN', 'OWNER', 'IMPORT', 'USER_SUGGESTION', 'SYSTEM');
CREATE TYPE "BusinessClaimRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
CREATE TYPE "BusinessClaimEvidenceType" AS ENUM ('PHONE', 'EMAIL', 'WEBSITE', 'INSTAGRAM', 'DOCUMENT', 'NOTE', 'OTHER');

ALTER TABLE "businesses"
ADD COLUMN "publicStatus" "BusinessPublicStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "claimStatus" "BusinessClaimStatus" NOT NULL DEFAULT 'CLAIMED',
ADD COLUMN "source" "BusinessSource" NOT NULL DEFAULT 'OWNER',
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "claimedAt" TIMESTAMP(3),
ADD COLUMN "claimedByUserId" TEXT,
ADD COLUMN "catalogManagedByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "isClaimable" BOOLEAN NOT NULL DEFAULT true;

UPDATE "businesses"
SET
    "publicStatus" = CASE
        WHEN "deletedAt" IS NULL THEN 'PUBLISHED'::"BusinessPublicStatus"
        ELSE 'ARCHIVED'::"BusinessPublicStatus"
    END,
    "claimStatus" = 'CLAIMED'::"BusinessClaimStatus",
    "source" = 'OWNER'::"BusinessSource",
    "publishedAt" = CASE
        WHEN "deletedAt" IS NULL THEN COALESCE("createdAt", CURRENT_TIMESTAMP)
        ELSE NULL
    END,
    "claimedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
    "claimedByUserId" = "ownerId",
    "catalogManagedByAdmin" = false,
    "isClaimable" = true;

ALTER TABLE "businesses"
ADD CONSTRAINT "businesses_claimedByUserId_fkey"
FOREIGN KEY ("claimedByUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "business_claim_requests" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "requesterOrganizationId" TEXT,
    "status" "BusinessClaimRequestStatus" NOT NULL DEFAULT 'PENDING',
    "evidenceType" "BusinessClaimEvidenceType" NOT NULL,
    "evidenceValue" VARCHAR(255),
    "notes" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_claim_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "business_claim_requests"
ADD CONSTRAINT "business_claim_requests_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_claim_requests"
ADD CONSTRAINT "business_claim_requests_requesterUserId_fkey"
FOREIGN KEY ("requesterUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_claim_requests"
ADD CONSTRAINT "business_claim_requests_requesterOrganizationId_fkey"
FOREIGN KEY ("requesterOrganizationId") REFERENCES "organizations"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "business_claim_requests"
ADD CONSTRAINT "business_claim_requests_reviewedByAdminId_fkey"
FOREIGN KEY ("reviewedByAdminId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "businesses_publicStatus_createdAt_idx" ON "businesses"("publicStatus", "createdAt");
CREATE INDEX "businesses_claimStatus_createdAt_idx" ON "businesses"("claimStatus", "createdAt");
CREATE INDEX "businesses_source_createdAt_idx" ON "businesses"("source", "createdAt");
CREATE INDEX "businesses_claimedByUserId_idx" ON "businesses"("claimedByUserId");

CREATE INDEX "business_claim_requests_businessId_status_createdAt_idx"
ON "business_claim_requests"("businessId", "status", "createdAt");

CREATE INDEX "business_claim_requests_requesterUserId_status_createdAt_idx"
ON "business_claim_requests"("requesterUserId", "status", "createdAt");

CREATE INDEX "business_claim_requests_requesterOrganizationId_status_createdAt_idx"
ON "business_claim_requests"("requesterOrganizationId", "status", "createdAt");

CREATE INDEX "business_claim_requests_reviewedByAdminId_reviewedAt_idx"
ON "business_claim_requests"("reviewedByAdminId", "reviewedAt");

CREATE UNIQUE INDEX "business_claim_requests_businessId_pending_key"
ON "business_claim_requests"("businessId")
WHERE "status" = 'PENDING';
