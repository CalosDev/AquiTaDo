-- CreateEnum
CREATE TYPE "BusinessVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VerificationDocumentType" AS ENUM ('ID_CARD', 'TAX_CERTIFICATE', 'BUSINESS_LICENSE', 'ADDRESS_PROOF', 'SELFIE', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdBillingModel" AS ENUM ('CPC');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'CLICK', 'CONVERSION');

-- CreateEnum
CREATE TYPE "MarketReportType" AS ENUM ('PROVINCE_CATEGORY_DEMAND', 'TRENDING_BUSINESSES', 'CONVERSION_BENCHMARK');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "riskScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verificationNotes" VARCHAR(500),
ADD COLUMN     "verificationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "verificationStatus" "BusinessVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "verificationSubmittedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "business_verification_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "documentType" "VerificationDocumentType" NOT NULL,
    "fileUrl" VARCHAR(500) NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "rejectionReason" VARCHAR(500),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" VARCHAR(160) NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "billingModel" "AdBillingModel" NOT NULL DEFAULT 'CPC',
    "targetProvinceId" TEXT,
    "targetCategoryId" TEXT,
    "dailyBudget" DECIMAL(12,2) NOT NULL,
    "totalBudget" DECIMAL(12,2) NOT NULL,
    "bidAmount" DECIMAL(10,2) NOT NULL,
    "spentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_events" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "eventType" "AdEventType" NOT NULL,
    "visitorHash" VARCHAR(64),
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_report_snapshots" (
    "id" TEXT NOT NULL,
    "reportType" "MarketReportType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "filters" JSONB,
    "summary" JSONB NOT NULL,
    "generatedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_report_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_verification_documents_organizationId_status_submi_idx" ON "business_verification_documents"("organizationId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "business_verification_documents_businessId_status_idx" ON "business_verification_documents"("businessId", "status");

-- CreateIndex
CREATE INDEX "business_verification_documents_reviewedByUserId_reviewedAt_idx" ON "business_verification_documents"("reviewedByUserId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ad_campaigns_organizationId_status_startsAt_endsAt_idx" ON "ad_campaigns"("organizationId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ad_campaigns_businessId_status_idx" ON "ad_campaigns"("businessId", "status");

-- CreateIndex
CREATE INDEX "ad_campaigns_targetProvinceId_targetCategoryId_status_idx" ON "ad_campaigns"("targetProvinceId", "targetCategoryId", "status");

-- CreateIndex
CREATE INDEX "ad_events_campaignId_eventType_occurredAt_idx" ON "ad_events"("campaignId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "ad_events_occurredAt_idx" ON "ad_events"("occurredAt");

-- CreateIndex
CREATE INDEX "market_report_snapshots_reportType_generatedAt_idx" ON "market_report_snapshots"("reportType", "generatedAt");

-- CreateIndex
CREATE INDEX "market_report_snapshots_generatedByUserId_generatedAt_idx" ON "market_report_snapshots"("generatedByUserId", "generatedAt");

-- CreateIndex
CREATE INDEX "businesses_verificationStatus_createdAt_idx" ON "businesses"("verificationStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "business_verification_documents" ADD CONSTRAINT "business_verification_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_verification_documents" ADD CONSTRAINT "business_verification_documents_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_verification_documents" ADD CONSTRAINT "business_verification_documents_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_targetProvinceId_fkey" FOREIGN KEY ("targetProvinceId") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_events" ADD CONSTRAINT "ad_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_report_snapshots" ADD CONSTRAINT "market_report_snapshots_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
