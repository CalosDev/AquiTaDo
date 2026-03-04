-- Performance tuning for public discovery/search endpoints.
-- Focus: reduce p50/p95 on /api/businesses and /api/search/businesses.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Public feed listing indexes (verified + not deleted path).
CREATE INDEX IF NOT EXISTS "businesses_public_created_desc_partial_idx"
ON "businesses" ("createdAt" DESC)
WHERE "deletedAt" IS NULL AND "verified" = true;

CREATE INDEX IF NOT EXISTS "businesses_public_province_created_desc_partial_idx"
ON "businesses" ("provinceId", "createdAt" DESC)
WHERE "deletedAt" IS NULL AND "verified" = true;

CREATE INDEX IF NOT EXISTS "businesses_public_city_created_desc_partial_idx"
ON "businesses" ("cityId", "createdAt" DESC)
WHERE "deletedAt" IS NULL AND "verified" = true AND "cityId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "businesses_public_reputation_created_desc_partial_idx"
ON "businesses" ("reputationScore" DESC, "createdAt" DESC)
WHERE "deletedAt" IS NULL AND "verified" = true;

-- Trigram indexes for contains/ILIKE search path.
CREATE INDEX IF NOT EXISTS "businesses_public_name_trgm_idx"
ON "businesses" USING GIN ("name" gin_trgm_ops)
WHERE "deletedAt" IS NULL AND "verified" = true;

CREATE INDEX IF NOT EXISTS "businesses_public_description_trgm_idx"
ON "businesses" USING GIN ("description" gin_trgm_ops)
WHERE "deletedAt" IS NULL AND "verified" = true;

CREATE INDEX IF NOT EXISTS "businesses_public_address_trgm_idx"
ON "businesses" USING GIN ("address" gin_trgm_ops)
WHERE "deletedAt" IS NULL AND "verified" = true;

CREATE INDEX IF NOT EXISTS "features_name_trgm_idx"
ON "features" USING GIN ("name" gin_trgm_ops);

-- Relation indexes for category/feature filtering.
CREATE INDEX IF NOT EXISTS "business_categories_categoryId_businessId_idx"
ON "business_categories" ("categoryId", "businessId");

CREATE INDEX IF NOT EXISTS "business_features_featureId_idx"
ON "business_features" ("featureId");

CREATE INDEX IF NOT EXISTS "business_features_featureId_businessId_idx"
ON "business_features" ("featureId", "businessId");
