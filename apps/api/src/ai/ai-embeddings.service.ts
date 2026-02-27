import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from './ai-provider.service';

export type EmbeddingSearchFilters = {
    organizationId?: string;
    categoryId?: string;
    provinceId?: string;
    cityId?: string;
    limit?: number;
};

export type EmbeddingMatch = {
    businessId: string;
    organizationId: string;
    name: string;
    slug: string;
    description: string;
    address: string;
    provinceId: string;
    cityId: string | null;
    phone: string | null;
    whatsapp: string | null;
    latitude: number | null;
    longitude: number | null;
    score: number;
};

type SearchResult = {
    data: EmbeddingMatch[];
    source: 'pgvector' | 'json-fallback';
};

type VectorSearchRow = Omit<EmbeddingMatch, 'score'> & {
    score: number;
};

/**
 * Stores and searches semantic embeddings for businesses.
 * Uses pgvector when available and a JSON cosine fallback otherwise.
 */
@Injectable()
export class AiEmbeddingsService {
    private readonly logger = new Logger(AiEmbeddingsService.name);
    private vectorProjectionAvailable: boolean | null = null;

    constructor(
        @Inject(PrismaService)
        private readonly prisma: PrismaService,
        @Inject(AiProviderService)
        private readonly aiProviderService: AiProviderService,
    ) { }

    async upsertBusinessEmbedding(businessId: string): Promise<void> {
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                address: true,
                phone: true,
                whatsapp: true,
                verified: true,
                deletedAt: true,
                organizationId: true,
                province: {
                    select: {
                        name: true,
                        slug: true,
                    },
                },
                city: {
                    select: {
                        name: true,
                    },
                },
                categories: {
                    select: {
                        category: {
                            select: {
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
                features: {
                    select: {
                        feature: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });

        if (!business || !business.verified || business.deletedAt) {
            await this.removeBusinessEmbedding(businessId);
            return;
        }

        const document = this.buildBusinessDocument(business);
        const checksum = createHash('sha256').update(document).digest('hex');
        const existing = await this.prisma.businessEmbedding.findUnique({
            where: { businessId },
            select: {
                id: true,
                sourceChecksum: true,
                status: true,
            },
        });

        if (existing?.sourceChecksum === checksum && existing.status === 'INDEXED') {
            return;
        }

        const vector = await this.aiProviderService.createEmbedding(document);
        const dimensions = vector.length;

        const embedding = await this.prisma.businessEmbedding.upsert({
            where: { businessId },
            update: {
                organizationId: business.organizationId,
                content: document,
                embedding: vector as Prisma.InputJsonValue,
                dimensions,
                provider: this.aiProviderService.getProviderName(),
                status: 'INDEXED',
                errorMessage: null,
                sourceChecksum: checksum,
            },
            create: {
                businessId,
                organizationId: business.organizationId,
                content: document,
                embedding: vector as Prisma.InputJsonValue,
                dimensions,
                provider: this.aiProviderService.getProviderName(),
                status: 'INDEXED',
                sourceChecksum: checksum,
            },
            select: {
                id: true,
                businessId: true,
            },
        });

        await this.prisma.business.update({
            where: { id: businessId },
            data: {
                aiLastEmbeddedAt: new Date(),
            },
            select: { id: true },
        });

        await this.syncPgVectorProjection(embedding.id, vector);
    }

    async removeBusinessEmbedding(businessId: string): Promise<void> {
        const existing = await this.prisma.businessEmbedding.findUnique({
            where: { businessId },
            select: { id: true },
        });
        if (!existing) {
            return;
        }

        if (await this.isPgVectorAvailable()) {
            await this.prisma.$executeRawUnsafe(
                'DELETE FROM business_embedding_vectors WHERE business_embedding_id = $1',
                existing.id,
            );
        }

        await this.prisma.businessEmbedding.delete({
            where: { businessId },
        });
    }

    async searchByText(
        query: string,
        filters: EmbeddingSearchFilters = {},
    ): Promise<SearchResult> {
        const embedding = await this.aiProviderService.createEmbedding(query);
        return this.searchByEmbedding(embedding, filters);
    }

    async searchByEmbedding(
        embedding: number[],
        filters: EmbeddingSearchFilters = {},
    ): Promise<SearchResult> {
        if (embedding.length === 0) {
            return { data: [], source: 'json-fallback' };
        }

        if (await this.isPgVectorAvailable()) {
            const vectorMatches = await this.searchViaPgVector(embedding, filters);
            return { data: vectorMatches, source: 'pgvector' };
        }

        const fallbackMatches = await this.searchViaJsonFallback(embedding, filters);
        return { data: fallbackMatches, source: 'json-fallback' };
    }

    private async searchViaPgVector(
        queryEmbedding: number[],
        filters: EmbeddingSearchFilters,
    ): Promise<EmbeddingMatch[]> {
        const limit = Math.min(Math.max(filters.limit ?? 8, 1), 25);
        const vectorLiteral = `[${queryEmbedding.map((value) => Number(value.toFixed(8))).join(',')}]`;

        let sql = `
            SELECT
                b.id AS "businessId",
                b."organizationId" AS "organizationId",
                b.name,
                b.slug,
                b.description,
                b.address,
                b."provinceId" AS "provinceId",
                b."cityId" AS "cityId",
                b.phone,
                b.whatsapp,
                b.latitude,
                b.longitude,
                (1 - (bev.embedding <=> $1::vector))::double precision AS score
            FROM business_embedding_vectors bev
            INNER JOIN business_embeddings be ON be.id = bev.business_embedding_id
            INNER JOIN businesses b ON b.id = be."businessId"
            WHERE b.verified = true
              AND b."deletedAt" IS NULL
        `;

        const params: unknown[] = [vectorLiteral];
        let nextParamIndex = 2;

        if (filters.organizationId) {
            sql += ` AND b."organizationId" = $${nextParamIndex}`;
            params.push(filters.organizationId);
            nextParamIndex += 1;
        }

        if (filters.provinceId) {
            sql += ` AND b."provinceId" = $${nextParamIndex}`;
            params.push(filters.provinceId);
            nextParamIndex += 1;
        }

        if (filters.cityId) {
            sql += ` AND b."cityId" = $${nextParamIndex}`;
            params.push(filters.cityId);
            nextParamIndex += 1;
        }

        if (filters.categoryId) {
            sql += `
                AND EXISTS (
                    SELECT 1
                    FROM business_categories bc
                    WHERE bc."businessId" = b.id
                      AND bc."categoryId" = $${nextParamIndex}
                )
            `;
            params.push(filters.categoryId);
            nextParamIndex += 1;
        }

        sql += ` ORDER BY bev.embedding <=> $1::vector ASC LIMIT $${nextParamIndex}`;
        params.push(limit);

        const rows = await this.prisma.$queryRawUnsafe<VectorSearchRow[]>(sql, ...params);
        return rows.map((row) => ({
            ...row,
            score: Number(row.score),
        }));
    }

    private async searchViaJsonFallback(
        queryEmbedding: number[],
        filters: EmbeddingSearchFilters,
    ): Promise<EmbeddingMatch[]> {
        const limit = Math.min(Math.max(filters.limit ?? 8, 1), 25);
        const businessWhere: Prisma.BusinessWhereInput = {
            verified: true,
            deletedAt: null,
        };

        if (filters.provinceId) {
            businessWhere.provinceId = filters.provinceId;
        }

        if (filters.cityId) {
            businessWhere.cityId = filters.cityId;
        }

        if (filters.categoryId) {
            businessWhere.categories = {
                some: {
                    categoryId: filters.categoryId,
                },
            };
        }

        const where: Prisma.BusinessEmbeddingWhereInput = {
            status: 'INDEXED',
            business: businessWhere,
        };

        if (filters.organizationId) {
            where.organizationId = filters.organizationId;
        }

        const candidates = await this.prisma.businessEmbedding.findMany({
            where,
            select: {
                embedding: true,
                business: {
                    select: {
                        id: true,
                        organizationId: true,
                        name: true,
                        slug: true,
                        description: true,
                        address: true,
                        provinceId: true,
                        cityId: true,
                        phone: true,
                        whatsapp: true,
                        latitude: true,
                        longitude: true,
                    },
                },
            },
            take: 400,
        });

        const scored = candidates
            .map((candidate) => {
                const business = candidate.business;
                const vector = this.readEmbeddingVector(candidate.embedding);
                const score = this.cosineSimilarity(queryEmbedding, vector);
                return {
                    businessId: business.id,
                    organizationId: business.organizationId,
                    name: business.name,
                    slug: business.slug,
                    description: business.description,
                    address: business.address,
                    provinceId: business.provinceId,
                    cityId: business.cityId,
                    phone: business.phone,
                    whatsapp: business.whatsapp,
                    latitude: business.latitude,
                    longitude: business.longitude,
                    score,
                } satisfies EmbeddingMatch;
            })
            .filter((entry) => Number.isFinite(entry.score))
            .sort((left, right) => right.score - left.score)
            .slice(0, limit);

        return scored;
    }

    private buildBusinessDocument(business: {
        name: string;
        slug: string;
        description: string;
        address: string;
        phone: string | null;
        whatsapp: string | null;
        province: { name: string; slug: string };
        city: { name: string } | null;
        categories: Array<{ category: { name: string; slug: string } }>;
        features: Array<{ feature: { name: string } }>;
    }): string {
        const categories = business.categories.map((entry) => entry.category.name).join(', ');
        const features = business.features.map((entry) => entry.feature.name).join(', ');

        return [
            `name: ${business.name}`,
            `slug: ${business.slug}`,
            `description: ${business.description}`,
            `address: ${business.address}`,
            `province: ${business.province.name}`,
            `city: ${business.city?.name ?? 'n/a'}`,
            `categories: ${categories || 'n/a'}`,
            `features: ${features || 'n/a'}`,
            `phone: ${business.phone ?? 'n/a'}`,
            `whatsapp: ${business.whatsapp ?? 'n/a'}`,
        ].join('\n');
    }

    private readEmbeddingVector(rawEmbedding: unknown): number[] {
        if (!Array.isArray(rawEmbedding)) {
            return [];
        }

        return rawEmbedding
            .map((entry) => Number(entry))
            .filter((entry) => Number.isFinite(entry));
    }

    private cosineSimilarity(left: number[], right: number[]): number {
        if (left.length === 0 || right.length === 0) {
            return -1;
        }

        const size = Math.min(left.length, right.length);
        let dot = 0;
        let leftNorm = 0;
        let rightNorm = 0;

        for (let index = 0; index < size; index += 1) {
            const leftValue = left[index] ?? 0;
            const rightValue = right[index] ?? 0;
            dot += leftValue * rightValue;
            leftNorm += leftValue * leftValue;
            rightNorm += rightValue * rightValue;
        }

        if (leftNorm === 0 || rightNorm === 0) {
            return -1;
        }

        return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
    }

    private async syncPgVectorProjection(
        businessEmbeddingId: string,
        embedding: number[],
    ): Promise<void> {
        if (!(await this.isPgVectorAvailable())) {
            return;
        }

        const vectorLiteral = `[${embedding.map((value) => Number(value.toFixed(8))).join(',')}]`;
        try {
            await this.prisma.$executeRawUnsafe(
                `
                INSERT INTO business_embedding_vectors (business_embedding_id, embedding, updated_at)
                VALUES ($1, $2::vector, CURRENT_TIMESTAMP)
                ON CONFLICT (business_embedding_id)
                DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at = CURRENT_TIMESTAMP
                `,
                businessEmbeddingId,
                vectorLiteral,
            );
        } catch (error) {
            this.logger.warn(
                `Unable to sync pgvector projection (${error instanceof Error ? error.message : String(error)})`,
            );
            this.vectorProjectionAvailable = false;
        }
    }

    private async isPgVectorAvailable(): Promise<boolean> {
        if (this.vectorProjectionAvailable !== null) {
            return this.vectorProjectionAvailable;
        }

        try {
            const rows = await this.prisma.$queryRawUnsafe<Array<{ regclass: string | null }>>(
                `SELECT to_regclass('public.business_embedding_vectors') AS regclass`,
            );
            this.vectorProjectionAvailable = Boolean(rows[0]?.regclass);
        } catch (error) {
            this.logger.warn(
                `Unable to detect pgvector projection (${error instanceof Error ? error.message : String(error)})`,
            );
            this.vectorProjectionAvailable = false;
        }

        return this.vectorProjectionAvailable;
    }
}
