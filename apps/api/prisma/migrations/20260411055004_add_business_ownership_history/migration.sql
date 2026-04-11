-- CreateEnum
CREATE TYPE "OwnershipRole" AS ENUM ('PRIMARY_OWNER', 'MANAGER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BusinessClaimRequestStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "BusinessClaimRequestStatus" ADD VALUE 'EXPIRED';

-- DropForeignKey
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_ownerId_fkey";

-- AlterTable
ALTER TABLE "business_claim_requests" ADD COLUMN     "adminNotes" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "expiredAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "business_duplicate_cases" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "business_suggestions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "firstPublishedAt" TIMESTAMP(3),
ADD COLUMN     "isDiscoverable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isSearchable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "updatedByUserId" TEXT;

-- CreateTable
CREATE TABLE "business_ownerships" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "claimRequestId" TEXT,
    "role" "OwnershipRole" NOT NULL DEFAULT 'PRIMARY_OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_ownerships_claimRequestId_key" ON "business_ownerships"("claimRequestId");

-- CreateIndex
CREATE INDEX "business_ownerships_businessId_isActive_idx" ON "business_ownerships"("businessId", "isActive");

-- CreateIndex
CREATE INDEX "business_ownerships_organizationId_isActive_idx" ON "business_ownerships"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "business_ownerships_grantedAt_idx" ON "business_ownerships"("grantedAt");

-- CreateIndex
CREATE INDEX "business_ownerships_claimRequestId_idx" ON "business_ownerships"("claimRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "business_ownerships_businessId_active_key"
ON "business_ownerships"("businessId")
WHERE "isActive" = true;

-- CreateIndex
CREATE INDEX "business_claim_requests_status_idx" ON "business_claim_requests"("status");

-- CreateIndex
CREATE INDEX "business_claim_requests_createdAt_idx" ON "business_claim_requests"("createdAt");

-- CreateIndex
CREATE INDEX "businesses_name_idx" ON "businesses"("name");

-- CreateIndex
CREATE INDEX "businesses_createdByUserId_idx" ON "businesses"("createdByUserId");

-- CreateIndex
CREATE INDEX "businesses_updatedByUserId_idx" ON "businesses"("updatedByUserId");

-- CreateIndex
CREATE INDEX "businesses_isPublished_isSearchable_isDiscoverable_publicSt_idx" ON "businesses"("isPublished", "isSearchable", "isDiscoverable", "publicStatus");

-- CreateIndex
CREATE INDEX "businesses_createdAt_idx" ON "businesses"("createdAt");

UPDATE "businesses"
SET
    "isPublished" = CASE
        WHEN "publicStatus" = 'PUBLISHED'::"BusinessPublicStatus" THEN true
        ELSE false
    END,
    "isSearchable" = CASE
        WHEN "publicStatus" = 'PUBLISHED'::"BusinessPublicStatus" AND "deletedAt" IS NULL THEN true
        ELSE false
    END,
    "isDiscoverable" = CASE
        WHEN "publicStatus" = 'PUBLISHED'::"BusinessPublicStatus" AND "deletedAt" IS NULL THEN true
        ELSE false
    END,
    "firstPublishedAt" = CASE
        WHEN "publicStatus" = 'PUBLISHED'::"BusinessPublicStatus" THEN COALESCE("publishedAt", "createdAt")
        ELSE NULL
    END,
    "createdByUserId" = COALESCE("ownerId", "claimedByUserId"),
    "updatedByUserId" = COALESCE("claimedByUserId", "ownerId"),
    "lastReviewedAt" = "verificationReviewedAt";

UPDATE "business_claim_requests"
SET
    "approvedAt" = CASE
        WHEN "status"::text = 'APPROVED' THEN COALESCE("reviewedAt", "updatedAt", "createdAt")
        ELSE NULL
    END,
    "rejectedAt" = CASE
        WHEN "status"::text = 'REJECTED' THEN COALESCE("reviewedAt", "updatedAt", "createdAt")
        ELSE NULL
    END,
    "expiredAt" = CASE
        WHEN "status"::text = 'EXPIRED' THEN COALESCE("reviewedAt", "updatedAt", "createdAt")
        ELSE NULL
    END,
    "canceledAt" = CASE
        WHEN "status"::text = 'CANCELED' THEN COALESCE("reviewedAt", "updatedAt", "createdAt")
        ELSE NULL
    END;

INSERT INTO "business_ownerships" (
    "id",
    "businessId",
    "organizationId",
    "grantedByUserId",
    "role",
    "isActive",
    "grantedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT(b."id", ':ownership'),
    b."id",
    b."organizationId",
    COALESCE(b."claimedByUserId", b."ownerId"),
    'PRIMARY_OWNER'::"OwnershipRole",
    true,
    COALESCE(b."claimedAt", b."createdAt", CURRENT_TIMESTAMP),
    COALESCE(b."createdAt", CURRENT_TIMESTAMP),
    CURRENT_TIMESTAMP
FROM "businesses" AS b
WHERE b."organizationId" IS NOT NULL
  AND b."deletedAt" IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM "business_ownerships" AS bo
      WHERE bo."businessId" = b."id"
        AND bo."isActive" = true
  );

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ownerships" ADD CONSTRAINT "business_ownerships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ownerships" ADD CONSTRAINT "business_ownerships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ownerships" ADD CONSTRAINT "business_ownerships_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ownerships" ADD CONSTRAINT "business_ownerships_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_ownerships" ADD CONSTRAINT "business_ownerships_claimRequestId_fkey" FOREIGN KEY ("claimRequestId") REFERENCES "business_claim_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "business_claim_requests_requesterOrganizationId_status_createdA" RENAME TO "business_claim_requests_requesterOrganizationId_status_crea_idx";
