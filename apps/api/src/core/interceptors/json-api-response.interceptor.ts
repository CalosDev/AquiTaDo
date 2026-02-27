import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type JsonApiEnvelope<T> = {
    jsonapi: { version: '1.0' };
    meta: {
        requestId: string | null;
        timestamp: string;
    };
    data: T;
};

@Injectable()
export class JsonApiResponseInterceptor implements NestInterceptor {
    private readonly enabled: boolean;

    constructor() {
        const raw = (process.env.JSON_API_RESPONSE_ENABLED ?? 'false')
            .trim()
            .toLowerCase();
        this.enabled = raw === '1' || raw === 'true';
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (!this.enabled || context.getType() !== 'http') {
            return next.handle();
        }

        const response = context.switchToHttp().getResponse<{
            getHeader(name: string): string | number | string[] | undefined;
        }>();

        return next.handle().pipe(
            map((payload) => {
                if (payload && typeof payload === 'object' && 'jsonapi' in (payload as object)) {
                    return payload;
                }

                const requestIdHeader = response.getHeader('x-request-id');
                const requestId = typeof requestIdHeader === 'string'
                    ? requestIdHeader
                    : Array.isArray(requestIdHeader) && requestIdHeader.length > 0
                        ? requestIdHeader[0] ?? null
                        : null;

                const envelope: JsonApiEnvelope<unknown> = {
                    jsonapi: { version: '1.0' },
                    meta: {
                        requestId,
                        timestamp: new Date().toISOString(),
                    },
                    data: payload,
                };

                return envelope;
            }),
        );
    }
}
