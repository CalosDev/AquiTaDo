import {
    CallHandler,
    ExecutionContext,
    Inject,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestContextService } from '../request-context/request-context.service';
import { RequestContextState } from '../request-context/request-context.types';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
    constructor(
        @Inject(RequestContextService)
        private readonly requestContextService: RequestContextService,
    ) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (context.getType() !== 'http') {
            return next.handle();
        }

        const request = context.switchToHttp().getRequest<{
            method?: string;
            path?: string;
            originalUrl?: string;
            user?: { id?: string; role?: string };
            organizationContext?: { organizationId?: string; organizationRole?: string };
            headers?: Record<string, string | string[] | undefined>;
        }>();

        const response = context.switchToHttp().getResponse<{
            getHeader(name: string): string | number | string[] | undefined;
        }>();

        const requestIdHeader = response.getHeader('x-request-id');
        const traceIdHeader = response.getHeader('x-trace-id');
        const traceparentHeader = response.getHeader('traceparent');
        const requestId = typeof requestIdHeader === 'string'
            ? requestIdHeader
            : Array.isArray(requestIdHeader) && requestIdHeader.length > 0
                ? requestIdHeader[0] ?? null
                : null;
        const traceId = typeof traceIdHeader === 'string'
            ? traceIdHeader
            : Array.isArray(traceIdHeader) && traceIdHeader.length > 0
                ? traceIdHeader[0] ?? null
                : null;
        const traceparent = typeof traceparentHeader === 'string'
            ? traceparentHeader
            : Array.isArray(traceparentHeader) && traceparentHeader.length > 0
                ? traceparentHeader[0] ?? null
                : null;

        const state: RequestContextState = {
            requestId,
            traceId,
            traceparent,
            method: request.method ?? null,
            path: request.originalUrl ?? request.path ?? null,
            userId: request.user?.id ?? null,
            userRole: request.user?.role ?? null,
            organizationId: request.organizationContext?.organizationId ?? null,
            organizationRole: request.organizationContext?.organizationRole ?? null,
        };

        return this.requestContextService.run(state, () => next.handle());
    }
}
