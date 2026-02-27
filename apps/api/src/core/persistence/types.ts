import { Prisma } from '../../generated/prisma/client';

export interface PaginationQuery {
    page?: number;
    limit?: number;
}

export interface PaginatedResult<TItem> {
    data: TItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export type DynamicFilters = Record<string, string | number | boolean | null | undefined>;

export interface FindManyQuery<TWhere> extends PaginationQuery {
    where?: TWhere;
    orderBy?: Prisma.Enumerable<Record<string, Prisma.SortOrder>>;
}

