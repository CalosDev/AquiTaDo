-- Core engine migration: PostGIS location + soft delete columns + tenant indexes
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "businesses"
    ADD COLUMN IF NOT EXISTS "location" geometry(Point, 4326),
    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "promotions"
    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "bookings"
    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "conversations"
    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "businesses"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)
WHERE "location" IS NULL
  AND "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "businesses_location_gist_idx"
    ON "businesses" USING GIST ("location");

CREATE INDEX IF NOT EXISTS "businesses_org_location_gist_idx"
    ON "businesses" USING GIST ("organizationId", "location")
    WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "businesses_organizationId_deletedAt_verified_createdAt_idx"
    ON "businesses" ("organizationId", "deletedAt", "verified", "createdAt");

CREATE INDEX IF NOT EXISTS "businesses_deletedAt_idx"
    ON "businesses" ("deletedAt");

CREATE INDEX IF NOT EXISTS "promotions_organizationId_deletedAt_isActive_endsAt_idx"
    ON "promotions" ("organizationId", "deletedAt", "isActive", "endsAt");

CREATE INDEX IF NOT EXISTS "bookings_organizationId_deletedAt_status_scheduledFor_idx"
    ON "bookings" ("organizationId", "deletedAt", "status", "scheduledFor");

CREATE INDEX IF NOT EXISTS "conversations_organizationId_deletedAt_status_lastMessageAt_idx"
    ON "conversations" ("organizationId", "deletedAt", "status", "lastMessageAt");

CREATE INDEX IF NOT EXISTS "audit_logs_targetType_targetId_createdAt_idx"
    ON "audit_logs" ("targetType", "targetId", "createdAt");

