-- Business list and moderation query optimization indexes
CREATE INDEX "businesses_verified_createdAt_idx"
ON "businesses" ("verified", "createdAt");

CREATE INDEX "businesses_provinceId_verified_createdAt_idx"
ON "businesses" ("provinceId", "verified", "createdAt");

CREATE INDEX "business_categories_categoryId_idx"
ON "business_categories" ("categoryId");

CREATE INDEX "reviews_businessId_moderationStatus_isSpam_createdAt_idx"
ON "reviews" ("businessId", "moderationStatus", "isSpam", "createdAt");
