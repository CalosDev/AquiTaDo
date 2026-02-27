import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContextState } from './request-context.types';

@Injectable()
export class RequestContextService {
    private readonly storage = new AsyncLocalStorage<RequestContextState>();

    /**
     * Runs callback inside a request-scoped async context.
     */
    run<T>(state: RequestContextState, callback: () => T): T {
        return this.storage.run(state, callback);
    }

    /**
     * Returns current request context if available.
     */
    get(): RequestContextState | null {
        return this.storage.getStore() ?? null;
    }
}

