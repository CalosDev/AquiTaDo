-- Remove AI-specific persistence now that advanced AI features are no longer part of the product.
ALTER TABLE "businesses"
RENAME COLUMN "aiAutoResponderEnabled" TO "autoResponderEnabled";

ALTER TABLE "businesses"
DROP COLUMN IF EXISTS "aiAutoResponderPrompt";

ALTER TABLE "businesses"
DROP COLUMN IF EXISTS "aiLastEmbeddedAt";

DROP TABLE IF EXISTS "business_embeddings" CASCADE;
DROP TABLE IF EXISTS "review_sentiment_insights" CASCADE;
