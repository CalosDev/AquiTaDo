-- CreateEnum
CREATE TYPE "BusinessTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "ReviewModerationStatus" AS ENUM ('APPROVED', 'FLAGGED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "reputationScore" DECIMAL(6,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reputationTier" "BusinessTier" NOT NULL DEFAULT 'BRONZE',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "isSpam" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "moderationReason" VARCHAR(255),
ADD COLUMN     "moderationStatus" "ReviewModerationStatus" NOT NULL DEFAULT 'APPROVED';

-- CreateIndex
CREATE INDEX "businesses_provinceId_reputationScore_idx" ON "businesses"("provinceId", "reputationScore");

-- CreateIndex
CREATE INDEX "businesses_reputationTier_reputationScore_idx" ON "businesses"("reputationTier", "reputationScore");

-- CreateIndex
CREATE INDEX "reviews_moderationStatus_createdAt_idx" ON "reviews"("moderationStatus", "createdAt");
