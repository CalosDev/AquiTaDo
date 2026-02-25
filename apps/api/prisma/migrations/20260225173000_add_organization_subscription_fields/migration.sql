-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('FREE', 'GROWTH', 'SCALE');

-- CreateEnum
CREATE TYPE "OrganizationSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- AlterTable
ALTER TABLE "organizations"
ADD COLUMN "plan" "OrganizationPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN "subscriptionStatus" "OrganizationSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "subscriptionRenewsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "organizations_plan_subscriptionStatus_idx" ON "organizations"("plan", "subscriptionStatus");