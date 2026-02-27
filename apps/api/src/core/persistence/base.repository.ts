import { BadRequestException } from '@nestjs/common';
import { FindManyQuery, PaginatedResult } from './types';

type RepositoryDelegate<TEntity> = {
    findFirst(args?: unknown): Promise<TEntity | null>;
    findMany(args?: unknown): Promise<TEntity[]>;
    count(args?: unknown): Promise<number>;
    create(args?: unknown): Promise<TEntity>;
    update(args?: unknown): Promise<TEntity>;
    updateMany(args?: unknown): Promise<{ count: number }>;
};

/**
 * BaseRepository centralizes common persistence concerns:
 * - CRUD helpers
 * - pagination normalization
 * - soft-delete helper
 */
export class BaseRepository<TEntity> {
    constructor(protected readonly delegate: RepositoryDelegate<TEntity>) { }

    async findById(where: Record<string, unknown>): Promise<TEntity | null> {
        return this.delegate.findFirst({ where });
    }

    async create(data: Record<string, unknown>): Promise<TEntity> {
        return this.delegate.create({ data });
    }

    async update(where: Record<string, unknown>, data: Record<string, unknown>): Promise<TEntity> {
        return this.delegate.update({ where, data });
    }

    async softDelete(where: Record<string, unknown>): Promise<TEntity> {
        return this.delegate.update({
            where,
            data: { deletedAt: new Date() },
        });
    }

    async softDeleteMany(where: Record<string, unknown>): Promise<{ count: number }> {
        return this.delegate.updateMany({
            where,
            data: { deletedAt: new Date() },
        });
    }

    async paginate<TWhere extends Record<string, unknown>>(
        query: FindManyQuery<TWhere>,
        defaults: { defaultLimit: number; maxLimit: number },
    ): Promise<PaginatedResult<TEntity>> {
        const page = this.normalizePage(query.page);
        const limit = this.normalizeLimit(query.limit, defaults.defaultLimit, defaults.maxLimit);
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.delegate.findMany({
                where: query.where ?? {},
                orderBy: query.orderBy ?? { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.delegate.count({
                where: query.where ?? {},
            }),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.max(Math.ceil(total / limit), 1),
        };
    }

    private normalizePage(rawPage: number | undefined): number {
        if (rawPage === undefined) {
            return 1;
        }
        if (!Number.isInteger(rawPage) || rawPage <= 0) {
            throw new BadRequestException('page must be a positive integer');
        }
        return rawPage;
    }

    private normalizeLimit(
        rawLimit: number | undefined,
        defaultLimit: number,
        maxLimit: number,
    ): number {
        if (rawLimit === undefined) {
            return defaultLimit;
        }
        if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
            throw new BadRequestException('limit must be a positive integer');
        }
        return Math.min(rawLimit, maxLimit);
    }
}
