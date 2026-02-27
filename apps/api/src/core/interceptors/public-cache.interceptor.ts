import {
    CallHandler,
    ExecutionContext,
    Inject,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { PUBLIC_CACHE_METADATA_KEY, PublicCacheOptions } from './public-cache.decorator';

@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
    constructor(
        @Inject(Reflector)
        private readonly reflector: Reflector,
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle();
        }

        const options = this.reflector.getAllAndOverride<PublicCacheOptions>(
            PUBLIC_CACHE_METADATA_KEY,
            [context.getHandler(), context.getClass()],
        );
        if (!options) {
            return next.handle();
        }

        const request = context.switchToHttp().getRequest<{
            method?: string;
            user?: unknown;
        }>();
        const response = context.switchToHttp().getResponse<{
            getHeader(name: string): string | number | string[] | undefined;
            setHeader(name: string, value: string): void;
        }>();

        const method = (request.method ?? 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD') {
            return next.handle();
        }

        const shouldPrivate = (options.privateWhenAuthenticated ?? true) && Boolean(request.user);
        if (shouldPrivate) {
            response.setHeader('Cache-Control', 'private, no-store');
            this.mergeVary(response, ['Authorization', 'x-organization-id']);
            return next.handle();
        }

        const maxAge = Math.max(0, Math.floor(options.maxAgeSeconds));
        const stale = Math.max(0, Math.floor(options.staleWhileRevalidateSeconds));
        response.setHeader(
            'Cache-Control',
            `public, max-age=${maxAge}, stale-while-revalidate=${stale}`,
        );
        this.mergeVary(response, ['Origin', 'Accept-Encoding']);
        return next.handle();
    }

    private mergeVary(
        response: {
            getHeader(name: string): string | number | string[] | undefined;
            setHeader(name: string, value: string): void;
        },
        values: string[],
    ): void {
        const existing = response.getHeader('Vary');
        const merged = new Set<string>();

        if (typeof existing === 'string') {
            existing.split(',').map((entry) => entry.trim()).filter(Boolean).forEach((entry) => merged.add(entry));
        } else if (Array.isArray(existing)) {
            existing.map((entry) => String(entry).trim()).filter(Boolean).forEach((entry) => merged.add(entry));
        }

        for (const value of values) {
            merged.add(value);
        }

        response.setHeader('Vary', [...merged].join(', '));
    }
}
