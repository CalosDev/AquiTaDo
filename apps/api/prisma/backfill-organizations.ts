import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import slugify from 'slugify';

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function resolveOrganizationName(userName: string | null, userId: string): string {
    const normalizedName = userName?.trim();
    if (!normalizedName) {
        return `Organization ${userId.slice(0, 8)}`;
    }

    return `${normalizedName} Organization`;
}

async function resolveUniqueOrganizationSlug(baseName: string, userId: string): Promise<string> {
    const normalizedBase = slugify(baseName, { lower: true, strict: true }) || 'organization';
    const slugPrefix = `${normalizedBase}-${userId.slice(0, 8)}`;
    let slugCandidate = slugPrefix;
    let suffix = 1;

    while (await prisma.organization.findUnique({ where: { slug: slugCandidate }, select: { id: true } })) {
        slugCandidate = `${slugPrefix}-${suffix}`;
        suffix += 1;
    }

    return slugCandidate;
}

async function ensureOrganizationForOwner(userId: string, userName: string | null): Promise<string> {
    const ownerMembership = await prisma.organizationMember.findFirst({
        where: { userId, role: 'OWNER' },
        select: { organizationId: true },
        orderBy: { createdAt: 'asc' },
    });

    if (ownerMembership) {
        return ownerMembership.organizationId;
    }

    const existingOrganization = await prisma.organization.findFirst({
        where: { ownerUserId: userId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
    });

    const organizationId = existingOrganization?.id ?? (
        await prisma.organization.create({
            data: {
                name: resolveOrganizationName(userName, userId),
                slug: await resolveUniqueOrganizationSlug(userName ?? 'organization', userId),
                ownerUserId: userId,
            },
            select: { id: true },
        })
    ).id;

    await prisma.organizationMember.upsert({
        where: {
            organizationId_userId: {
                organizationId,
                userId,
            },
        },
        update: {
            role: 'OWNER',
        },
        create: {
            organizationId,
            userId,
            role: 'OWNER',
        },
    });

    return organizationId;
}

async function main() {
    console.log('🏢 Backfilling organizations for existing businesses...');

    const owners = await prisma.user.findMany({
        where: {
            businesses: {
                some: {},
            },
        },
        select: {
            id: true,
            name: true,
        },
    });

    let createdOrLinkedOrganizations = 0;
    let updatedBusinesses = 0;

    for (const owner of owners) {
        const organizationId = await ensureOrganizationForOwner(owner.id, owner.name);
        createdOrLinkedOrganizations += 1;

        const updatedCount = await prisma.$executeRaw`
            UPDATE "businesses"
            SET "organizationId" = ${organizationId}
            WHERE "ownerId" = ${owner.id}
              AND "organizationId" IS NULL
        `;

        updatedBusinesses += Number(updatedCount);
    }

    const remainingRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "businesses"
        WHERE "organizationId" IS NULL
    `;
    const remainingUnscopedBusinesses = Number(remainingRows[0]?.count ?? 0);

    if (remainingUnscopedBusinesses > 0) {
        throw new Error(
            `Backfill incomplete: ${remainingUnscopedBusinesses} businesses still have null organizationId`,
        );
    }

    console.log(`✅ Owners processed: ${owners.length}`);
    console.log(`✅ Organizations linked/created: ${createdOrLinkedOrganizations}`);
    console.log(`✅ Businesses updated: ${updatedBusinesses}`);
    console.log('🎉 Organization backfill completed successfully.');
}

main()
    .catch((error: unknown) => {
        console.error('❌ Organization backfill failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
