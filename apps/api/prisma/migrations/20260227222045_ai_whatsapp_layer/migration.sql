-- CreateEnum
CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'INDEXED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "WhatsAppConversationStatus" AS ENUM ('OPEN', 'CLOSED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- Enable pgvector when available on host.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
  ELSE
    RAISE NOTICE 'pgvector extension is not available in this PostgreSQL instance';
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "aiAutoResponderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiAutoResponderPrompt" TEXT,
ADD COLUMN     "aiLastEmbeddedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "business_embeddings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "provider" VARCHAR(40) NOT NULL DEFAULT 'openai',
    "status" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" VARCHAR(500),
    "sourceChecksum" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessId" TEXT,
    "customerPhone" VARCHAR(30) NOT NULL,
    "customerName" VARCHAR(120),
    "customerUserId" TEXT,
    "status" "WhatsAppConversationStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoResponderActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "whatsappMessageId" VARCHAR(191),
    "senderPhone" VARCHAR(30),
    "recipientPhone" VARCHAR(30),
    "messageType" VARCHAR(40) NOT NULL DEFAULT 'text',
    "content" TEXT,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "source" VARCHAR(40) NOT NULL DEFAULT 'meta',
    "externalEventId" VARCHAR(191),
    "payload" JSONB NOT NULL,
    "processingStatus" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" VARCHAR(500),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_click_conversions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "source" VARCHAR(50) NOT NULL DEFAULT 'web',
    "sessionId" VARCHAR(191),
    "targetPhone" VARCHAR(30),
    "metadata" JSONB,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_click_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_sentiment_insights" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sentiment" "ReviewSentiment" NOT NULL,
    "score" DECIMAL(5,4) NOT NULL,
    "summary" VARCHAR(500),
    "model" VARCHAR(80),
    "alertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_sentiment_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "queueJobId" VARCHAR(191),
    "organizationId" TEXT,
    "businessId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "topic" VARCHAR(120) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_embeddings_businessId_key" ON "business_embeddings"("businessId");

-- CreateIndex
CREATE INDEX "business_embeddings_organizationId_status_updatedAt_idx" ON "business_embeddings"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "business_embeddings_businessId_updatedAt_idx" ON "business_embeddings"("businessId", "updatedAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_organizationId_status_lastMessageAt_idx" ON "whatsapp_conversations"("organizationId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_businessId_status_lastMessageAt_idx" ON "whatsapp_conversations"("businessId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_customerPhone_createdAt_idx" ON "whatsapp_conversations"("customerPhone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_organizationId_businessId_customerPh_key" ON "whatsapp_conversations"("organizationId", "businessId", "customerPhone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_whatsappMessageId_key" ON "whatsapp_messages"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_status_createdAt_idx" ON "whatsapp_messages"("status", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_senderPhone_createdAt_idx" ON "whatsapp_messages"("senderPhone", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_source_externalEventId_idx" ON "whatsapp_webhook_events"("source", "externalEventId");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_organizationId_receivedAt_idx" ON "whatsapp_webhook_events"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_processingStatus_receivedAt_idx" ON "whatsapp_webhook_events"("processingStatus", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_click_conversions_businessId_clickedAt_idx" ON "whatsapp_click_conversions"("businessId", "clickedAt");

-- CreateIndex
CREATE INDEX "whatsapp_click_conversions_organizationId_clickedAt_idx" ON "whatsapp_click_conversions"("organizationId", "clickedAt");

-- CreateIndex
CREATE INDEX "whatsapp_click_conversions_userId_clickedAt_idx" ON "whatsapp_click_conversions"("userId", "clickedAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_sentiment_insights_reviewId_key" ON "review_sentiment_insights"("reviewId");

-- CreateIndex
CREATE INDEX "review_sentiment_insights_organizationId_sentiment_createdA_idx" ON "review_sentiment_insights"("organizationId", "sentiment", "createdAt");

-- CreateIndex
CREATE INDEX "review_sentiment_insights_businessId_createdAt_idx" ON "review_sentiment_insights"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_jobs_queueJobId_key" ON "notification_jobs"("queueJobId");

-- CreateIndex
CREATE INDEX "notification_jobs_status_availableAt_idx" ON "notification_jobs"("status", "availableAt");

-- CreateIndex
CREATE INDEX "notification_jobs_organizationId_topic_createdAt_idx" ON "notification_jobs"("organizationId", "topic", "createdAt");

-- CreateIndex
CREATE INDEX "notification_jobs_businessId_topic_createdAt_idx" ON "notification_jobs"("businessId", "topic", "createdAt");

-- AddForeignKey
ALTER TABLE "business_embeddings" ADD CONSTRAINT "business_embeddings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_embeddings" ADD CONSTRAINT "business_embeddings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_click_conversions" ADD CONSTRAINT "whatsapp_click_conversions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_click_conversions" ADD CONSTRAINT "whatsapp_click_conversions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_click_conversions" ADD CONSTRAINT "whatsapp_click_conversions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sentiment_insights" ADD CONSTRAINT "review_sentiment_insights_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sentiment_insights" ADD CONSTRAINT "review_sentiment_insights_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_sentiment_insights" ADD CONSTRAINT "review_sentiment_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Optional vector projection table backed by pgvector.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE '
      CREATE TABLE IF NOT EXISTS business_embedding_vectors (
        business_embedding_id TEXT PRIMARY KEY REFERENCES business_embeddings(id) ON DELETE CASCADE,
        embedding vector(1536) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    ';

    EXECUTE '
      CREATE INDEX IF NOT EXISTS business_embedding_vectors_embedding_cos_idx
      ON business_embedding_vectors
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    ';
  END IF;
END
$$;
