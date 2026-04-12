CREATE TYPE "BusinessCatalogSource" AS ENUM (
    'OWNER_CREATED',
    'ADMIN_CREATED',
    'USER_SUGGESTED',
    'IMPORTED',
    'SYSTEM_MIGRATED'
);

CREATE TYPE "BusinessLifecycleStatus" AS ENUM (
    'DRAFT',
    'PUBLISHED',
    'ARCHIVED',
    'SOFT_DELETED'
);

ALTER TABLE "businesses"
ADD COLUMN "lifecycleStatus" "BusinessLifecycleStatus" NOT NULL DEFAULT 'PUBLISHED';

UPDATE "businesses"
SET "lifecycleStatus" = CASE
    WHEN "deletedAt" IS NOT NULL THEN 'SOFT_DELETED'::"BusinessLifecycleStatus"
    WHEN "publicStatus"::text = 'DRAFT' THEN 'DRAFT'::"BusinessLifecycleStatus"
    WHEN "publicStatus"::text IN ('ARCHIVED', 'SUSPENDED') THEN 'ARCHIVED'::"BusinessLifecycleStatus"
    ELSE 'PUBLISHED'::"BusinessLifecycleStatus"
END;

ALTER TABLE "businesses"
ALTER COLUMN "catalogSource" DROP DEFAULT;

ALTER TABLE "businesses"
ALTER COLUMN "catalogSource" TYPE "BusinessCatalogSource"
USING CASE
    WHEN "catalogSource"::text = 'ADMIN' THEN 'ADMIN_CREATED'
    WHEN "catalogSource"::text = 'OWNER' THEN 'OWNER_CREATED'
    WHEN "catalogSource"::text = 'IMPORT' THEN 'IMPORTED'
    WHEN "catalogSource"::text = 'USER_SUGGESTION' THEN 'USER_SUGGESTED'
    ELSE 'SYSTEM_MIGRATED'
END::"BusinessCatalogSource";

ALTER TABLE "businesses"
ALTER COLUMN "catalogSource" SET DEFAULT 'OWNER_CREATED';

CREATE INDEX "businesses_lifecycleStatus_createdAt_idx" ON "businesses"("lifecycleStatus", "createdAt");
