import { BaseRepository } from './base.repository';
import { FindManyQuery, PaginatedResult } from './types';

/**
 * Generic service layer abstraction over BaseRepository.
 * Keeps domain services thin and test-friendly.
 */
export abstract class BaseService<TEntity> {
    protected constructor(protected readonly repository: BaseRepository<TEntity>) { }

    findById(where: Record<string, unknown>): Promise<TEntity | null> {
        return this.repository.findById(where);
    }

    create(data: Record<string, unknown>): Promise<TEntity> {
        return this.repository.create(data);
    }

    update(where: Record<string, unknown>, data: Record<string, unknown>): Promise<TEntity> {
        return this.repository.update(where, data);
    }

    softDelete(where: Record<string, unknown>): Promise<TEntity> {
        return this.repository.softDelete(where);
    }

    paginate<TWhere extends Record<string, unknown>>(
        query: FindManyQuery<TWhere>,
        defaults: { defaultLimit: number; maxLimit: number },
    ): Promise<PaginatedResult<TEntity>> {
        return this.repository.paginate(query, defaults);
    }
}

