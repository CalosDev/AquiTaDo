-- Deduplicate reviews by (userId, businessId), keeping the most recent row.
WITH ranked_reviews AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY "userId", "businessId"
            ORDER BY "createdAt" DESC, ctid DESC
        ) AS rn
    FROM "reviews"
)
DELETE FROM "reviews" r
USING ranked_reviews rr
WHERE r.ctid = rr.ctid
  AND rr.rn > 1;

-- Deduplicate cities by (provinceId, name), keeping one row.
WITH ranked_cities AS (
    SELECT
        ctid,
        ROW_NUMBER() OVER (
            PARTITION BY "provinceId", "name"
            ORDER BY ctid DESC
        ) AS rn
    FROM "cities"
)
DELETE FROM "cities" c
USING ranked_cities rc
WHERE c.ctid = rc.ctid
  AND rc.rn > 1;

-- Enforce one review per user per business.
CREATE UNIQUE INDEX "reviews_userId_businessId_key" ON "reviews"("userId", "businessId");

-- Enforce unique city name per province.
CREATE UNIQUE INDEX "cities_provinceId_name_key" ON "cities"("provinceId", "name");
