-- CreateEnum
CREATE TYPE "SalesLeadStage" AS ENUM ('LEAD', 'QUOTED', 'BOOKED', 'PAID', 'LOST');

-- CreateTable
CREATE TABLE "user_favorite_businesses" (
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorite_businesses_pkey" PRIMARY KEY ("userId","businessId")
);

-- CreateTable
CREATE TABLE "user_business_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_business_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_business_list_items" (
    "listId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_business_list_items_pkey" PRIMARY KEY ("listId","businessId")
);

-- CreateTable
CREATE TABLE "sales_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "conversationId" TEXT,
    "bookingId" TEXT,
    "title" VARCHAR(160) NOT NULL,
    "notes" TEXT,
    "stage" "SalesLeadStage" NOT NULL DEFAULT 'LEAD',
    "estimatedValue" DECIMAL(12,2),
    "expectedCloseAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lostReason" VARCHAR(255),
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_favorite_businesses_businessId_createdAt_idx" ON "user_favorite_businesses"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_business_lists_userId_slug_key" ON "user_business_lists"("userId", "slug");

-- CreateIndex
CREATE INDEX "user_business_lists_userId_deletedAt_createdAt_idx" ON "user_business_lists"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "user_business_list_items_businessId_addedAt_idx" ON "user_business_list_items"("businessId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_leads_conversationId_key" ON "sales_leads"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_leads_bookingId_key" ON "sales_leads"("bookingId");

-- CreateIndex
CREATE INDEX "sales_leads_organizationId_deletedAt_stage_createdAt_idx" ON "sales_leads"("organizationId", "deletedAt", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "sales_leads_businessId_stage_createdAt_idx" ON "sales_leads"("businessId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "sales_leads_customerUserId_stage_createdAt_idx" ON "sales_leads"("customerUserId", "stage", "createdAt");

-- AddForeignKey
ALTER TABLE "user_favorite_businesses" ADD CONSTRAINT "user_favorite_businesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_favorite_businesses" ADD CONSTRAINT "user_favorite_businesses_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_lists" ADD CONSTRAINT "user_business_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_list_items" ADD CONSTRAINT "user_business_list_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "user_business_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_business_list_items" ADD CONSTRAINT "user_business_list_items_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_leads" ADD CONSTRAINT "sales_leads_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
