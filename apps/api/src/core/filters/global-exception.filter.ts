import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getSentryClient } from '../observability/sentry.client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);
    private readonly sentryEnabled: boolean;
    private readonly sentryClient = getSentryClient();
    constructor() {
        this.sentryEnabled = Boolean(process.env.SENTRY_DSN?.trim());
    }

    catch(exception: unknown, host: ArgumentsHost): void {
        const httpContext = host.switchToHttp();
        const request = httpContext.getRequest<Request>();
        const response = httpContext.getResponse<Response>();

        const status = exception instanceof HttpException
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const requestIdHeader = response.getHeader('x-request-id');
        const traceIdHeader = response.getHeader('x-trace-id');
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

        const baseErrorBody = exception instanceof HttpException
            ? exception.getResponse()
            : {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: 'Internal server error',
            };

        if (this.sentryEnabled && this.sentryClient) {
            this.sentryClient.captureException(exception, {
                tags: {
                    module: 'api',
                },
                extra: {
                    requestId,
                    traceId,
                    method: request.method,
                    path: request.originalUrl || request.url,
                    status,
                    userId: (request.user as { id?: string } | undefined)?.id ?? null,
                },
            });
        }

        this.logger.error(
            JSON.stringify({
                requestId,
                traceId,
                status,
                method: request.method,
                path: request.originalUrl || request.url,
                error: exception instanceof Error ? exception.message : String(exception),
            }),
        );

        const payload = typeof baseErrorBody === 'string'
            ? { statusCode: status, message: baseErrorBody }
            : baseErrorBody;

        response.status(status).json({
            ...(payload as Record<string, unknown>),
            requestId,
            traceId,
        });
    }
}
