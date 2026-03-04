-- Remove OpenAI provider defaults now that Gemini + Groq are the supported providers.
ALTER TABLE "business_embeddings"
ALTER COLUMN "provider" SET DEFAULT 'gemini';

UPDATE "business_embeddings"
SET "provider" = 'gemini'
WHERE "provider" = 'openai';
