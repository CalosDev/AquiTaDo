ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "twoFactorSecret" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "twoFactorPendingSecret" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "twoFactorEnabledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_twoFactorEnabled_idx" ON "users"("twoFactorEnabled");
