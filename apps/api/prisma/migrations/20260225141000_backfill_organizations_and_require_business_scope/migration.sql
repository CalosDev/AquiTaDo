-- Backfill one organization per owner that already has businesses.
INSERT INTO "organizations" ("id", "name", "slug", "ownerUserId", "createdAt", "updatedAt")
SELECT
    'org_' || SUBSTRING(md5(u."id") FROM 1 FOR 24) AS "id",
    CASE
        WHEN trim(COALESCE(u."name", '')) = '' THEN 'Organization ' || SUBSTRING(u."id" FROM 1 FOR 8)
        ELSE u."name" || ' Organization'
    END AS "name",
    'org-' || SUBSTRING(md5(u."id") FROM 1 FOR 24) AS "slug",
    u."id" AS "ownerUserId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users" u
WHERE EXISTS (
    SELECT 1
    FROM "businesses" b
    WHERE b."ownerId" = u."id"
)
AND NOT EXISTS (
    SELECT 1
    FROM "organizations" o
    WHERE o."ownerUserId" = u."id"
);

-- Ensure every organization owner is also a member with OWNER role.
INSERT INTO "organization_members" ("organizationId", "userId", "role", "createdAt", "updatedAt")
SELECT
    o."id",
    o."ownerUserId",
    'OWNER'::"OrganizationRole",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "organizations" o
ON CONFLICT ("organizationId", "userId")
DO UPDATE
SET
    "role" = 'OWNER'::"OrganizationRole",
    "updatedAt" = CURRENT_TIMESTAMP;

-- Assign an organization to any business still missing it.
WITH owner_organizations AS (
    SELECT
        o."ownerUserId",
        MIN(o."id") AS "organizationId"
    FROM "organizations" o
    GROUP BY o."ownerUserId"
)
UPDATE "businesses" b
SET "organizationId" = oo."organizationId"
FROM owner_organizations oo
WHERE b."organizationId" IS NULL
  AND b."ownerId" = oo."ownerUserId";

-- Abort migration if any business could not be assigned.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "businesses"
        WHERE "organizationId" IS NULL
    ) THEN
        RAISE EXCEPTION 'Backfill failed: one or more businesses still have NULL organizationId';
    END IF;
END $$;

-- Enforce business tenancy.
ALTER TABLE "businesses"
ALTER COLUMN "organizationId" SET NOT NULL;
