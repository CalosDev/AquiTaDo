import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NearbyBusinessesQueryDto } from './dto/discovery.dto';

type NearbyBusinessRow = {
    id: string;
    name: string;
    slug: string;
    address: string;
    verified: boolean;
    organizationId: string;
    provinceId: string;
    cityId: string | null;
    distanceMeters: number;
};

@Injectable()
export class DiscoveryService {
    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
    ) { }

    /**
     * Returns nearby businesses using native PostGIS operators for speed and accuracy.
     */
    async findNearbyBusinesses(query: NearbyBusinessesQueryDto) {
        const radiusKm = query.radiusKm ?? 5;
        const radiusMeters = radiusKm * 1000;
        const limit = query.limit ?? 25;
        const origin = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography`;

        const categoryClause = query.categoryId
            ? Prisma.sql`
                AND EXISTS (
                    SELECT 1
                    FROM business_categories bc
                    WHERE bc."businessId" = b.id
                      AND bc."categoryId" = ${query.categoryId}
                )
            `
            : Prisma.empty;

        const organizationClause = query.organizationId
            ? Prisma.sql`AND b."organizationId" = ${query.organizationId}`
            : Prisma.empty;

        const rows = await this.prisma.$queryRaw<NearbyBusinessRow[]>(Prisma.sql`
            SELECT
                b.id,
                b.name,
                b.slug,
                b.address,
                b.verified,
                b."organizationId",
                b."provinceId",
                b."cityId",
                ST_Distance(b.location::geography, ${origin}) AS "distanceMeters"
            FROM businesses b
            WHERE b."deletedAt" IS NULL
              AND b.verified = true
              AND b.location IS NOT NULL
              AND ST_DWithin(
                    b.location::geography,
                    ${origin},
                    ${radiusMeters}
              )
              ${organizationClause}
              ${categoryClause}
            ORDER BY "distanceMeters" ASC
            LIMIT ${limit}
        `);

        return {
            data: rows.map((row) => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                address: row.address,
                verified: row.verified,
                organizationId: row.organizationId,
                provinceId: row.provinceId,
                cityId: row.cityId,
                distanceMeters: Number(row.distanceMeters),
            })),
            count: rows.length,
            radiusKm,
            limit,
        };
    }
}

