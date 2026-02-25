-- CreateEnum
CREATE TYPE "AdWalletTopupStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "adWalletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ad_wallet_topups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'stripe',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'DOP',
    "status" "AdWalletTopupStatus" NOT NULL DEFAULT 'PENDING',
    "providerCheckoutSessionId" VARCHAR(191),
    "providerPaymentIntentId" VARCHAR(191),
    "paidAt" TIMESTAMP(3),
    "failureReason" VARCHAR(255),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_wallet_topups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_wallet_topups_providerCheckoutSessionId_key" ON "ad_wallet_topups"("providerCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ad_wallet_topups_providerPaymentIntentId_key" ON "ad_wallet_topups"("providerPaymentIntentId");

-- CreateIndex
CREATE INDEX "ad_wallet_topups_organizationId_createdAt_idx" ON "ad_wallet_topups"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ad_wallet_topups_status_createdAt_idx" ON "ad_wallet_topups"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ad_wallet_topups_requestedByUserId_createdAt_idx" ON "ad_wallet_topups"("requestedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "ad_wallet_topups" ADD CONSTRAINT "ad_wallet_topups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_wallet_topups" ADD CONSTRAINT "ad_wallet_topups_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
