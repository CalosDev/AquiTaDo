-- CreateEnum
CREATE TYPE "GrowthEventType" AS ENUM (
    'SEARCH_QUERY',
    'SEARCH_RESULT_CLICK',
    'CONTACT_CLICK',
    'WHATSAPP_CLICK',
    'BOOKING_INTENT'
);

-- CreateTable
CREATE TABLE "growth_events" (
    "id" TEXT NOT NULL,
    "eventType" "GrowthEventType" NOT NULL,
    "businessId" TEXT,
    "organizationId" TEXT,
    "userId" TEXT,
    "categoryId" TEXT,
    "provinceId" TEXT,
    "cityId" TEXT,
    "visitorIdHash" VARCHAR(64),
    "sessionId" VARCHAR(120),
    "variantKey" VARCHAR(80),
    "searchQuery" VARCHAR(255),
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "growth_events_eventType_occurredAt_idx" ON "growth_events"("eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "growth_events_provinceId_categoryId_occurredAt_idx" ON "growth_events"("provinceId", "categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "growth_events_businessId_eventType_occurredAt_idx" ON "growth_events"("businessId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "growth_events_organizationId_eventType_occurredAt_idx" ON "growth_events"("organizationId", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "growth_events_variantKey_eventType_occurredAt_idx" ON "growth_events"("variantKey", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "growth_events_visitorIdHash_occurredAt_idx" ON "growth_events"("visitorIdHash", "occurredAt");

-- CreateIndex
CREATE INDEX "growth_events_searchQuery_idx" ON "growth_events"("searchQuery");

-- AddForeignKey
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
