-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organizationId","userId")
);

-- CreateTable
CREATE TABLE "organization_invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'STAFF',
    "tokenHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "organizationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_ownerUserId_idx" ON "organizations"("ownerUserId");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_invites_tokenHash_key" ON "organization_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "organization_invites_organizationId_idx" ON "organization_invites"("organizationId");

-- CreateIndex
CREATE INDEX "organization_invites_email_idx" ON "organization_invites"("email");

-- CreateIndex
CREATE INDEX "organization_invites_expiresAt_idx" ON "organization_invites"("expiresAt");

-- CreateIndex
CREATE INDEX "businesses_organizationId_idx" ON "businesses"("organizationId");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
