CREATE TYPE "BusinessPriceRange" AS ENUM ('BUDGET', 'MODERATE', 'PREMIUM', 'LUXURY');

CREATE TYPE "BusinessImageType" AS ENUM ('COVER', 'GALLERY', 'MENU', 'INTERIOR', 'EXTERIOR');

ALTER TABLE "businesses"
ADD COLUMN "website" VARCHAR(255),
ADD COLUMN "email" VARCHAR(160),
ADD COLUMN "instagramUrl" VARCHAR(255),
ADD COLUMN "facebookUrl" VARCHAR(255),
ADD COLUMN "tiktokUrl" VARCHAR(255),
ADD COLUMN "priceRange" "BusinessPriceRange",
ADD COLUMN "sectorId" TEXT;

ALTER TABLE "categories"
ADD COLUMN "parentId" TEXT;

ALTER TABLE "business_images"
ADD COLUMN "caption" VARCHAR(160),
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isCover" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "type" "BusinessImageType" NOT NULL DEFAULT 'GALLERY';

ALTER TABLE "cities"
ADD COLUMN "slug" VARCHAR(120);

UPDATE "cities"
SET "slug" = trim(BOTH '-' FROM regexp_replace(
    lower(
        translate(
            "name",
            'ÁÀÂÄáàâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÖóòôöÚÙÛÜúùûüÑñÇç',
            'AAAAaaaaEEEEeeeeIIIIiiiiOOOOooooUUUUuuuuNnCc'
        )
    ),
    '[^a-z0-9]+',
    '-',
    'g'
))
WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "cities"
ALTER COLUMN "slug" SET NOT NULL;

CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "dayOfWeek" SMALLINT NOT NULL,
    "opensAt" VARCHAR(5),
    "closesAt" VARCHAR(5),
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "businessId" TEXT NOT NULL,
    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "businesses"
ADD CONSTRAINT "businesses_sectorId_fkey"
FOREIGN KEY ("sectorId") REFERENCES "sectors"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "categories"
ADD CONSTRAINT "categories_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sectors"
ADD CONSTRAINT "sectors_cityId_fkey"
FOREIGN KEY ("cityId") REFERENCES "cities"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_hours"
ADD CONSTRAINT "business_hours_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "cities_provinceId_slug_key" ON "cities"("provinceId", "slug");
CREATE UNIQUE INDEX "sectors_cityId_name_key" ON "sectors"("cityId", "name");
CREATE UNIQUE INDEX "sectors_cityId_slug_key" ON "sectors"("cityId", "slug");
CREATE UNIQUE INDEX "business_hours_businessId_dayOfWeek_key" ON "business_hours"("businessId", "dayOfWeek");
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");
CREATE INDEX "business_images_businessId_isCover_sortOrder_idx" ON "business_images"("businessId", "isCover", "sortOrder");
CREATE INDEX "sectors_cityId_idx" ON "sectors"("cityId");
CREATE INDEX "business_hours_businessId_dayOfWeek_idx" ON "business_hours"("businessId", "dayOfWeek");
CREATE INDEX "businesses_sectorId_idx" ON "businesses"("sectorId");
CREATE INDEX "businesses_cityId_sectorId_idx" ON "businesses"("cityId", "sectorId");

CREATE INDEX "businesses_public_sector_created_desc_partial_idx"
ON "businesses" ("sectorId", "createdAt" DESC)
WHERE "deletedAt" IS NULL AND "verified" = true AND "sectorId" IS NOT NULL;

WITH ranked_images AS (
    SELECT
        "id",
        row_number() OVER (PARTITION BY "businessId" ORDER BY "id") - 1 AS sort_order
    FROM "business_images"
)
UPDATE "business_images" AS image
SET
    "sortOrder" = ranked_images.sort_order,
    "isCover" = ranked_images.sort_order = 0,
    "type" = CASE WHEN ranked_images.sort_order = 0 THEN 'COVER'::"BusinessImageType" ELSE 'GALLERY'::"BusinessImageType" END
FROM ranked_images
WHERE image."id" = ranked_images."id";
