-- Add loyalty and check-in counters to users
ALTER TABLE "users"
ADD COLUMN "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "checkinCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "checkinStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastCheckinAt" TIMESTAMP(3);

CREATE INDEX "users_loyaltyPoints_idx" ON "users"("loyaltyPoints");

-- Check-ins table (gamification + social proof)
CREATE TABLE "check_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "verifiedLocation" BOOLEAN NOT NULL DEFAULT false,
    "distanceMeters" INTEGER,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "streakApplied" INTEGER NOT NULL DEFAULT 0,
    "note" VARCHAR(220),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "check_ins_userId_createdAt_idx" ON "check_ins"("userId", "createdAt");
CREATE INDEX "check_ins_businessId_createdAt_idx" ON "check_ins"("businessId", "createdAt");
CREATE INDEX "check_ins_organizationId_createdAt_idx" ON "check_ins"("organizationId", "createdAt");
CREATE INDEX "check_ins_verifiedLocation_createdAt_idx" ON "check_ins"("verifiedLocation", "createdAt");

ALTER TABLE "check_ins"
ADD CONSTRAINT "check_ins_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "check_ins"
ADD CONSTRAINT "check_ins_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "check_ins"
ADD CONSTRAINT "check_ins_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
