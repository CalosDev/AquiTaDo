import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes, randomUUID } from 'crypto';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { ObservabilityService } from './observability/observability.service';
import { getSentryClient } from './core/observability/sentry.client';
import { initializeOpenTelemetry, shutdownOpenTelemetry } from './observability/telemetry.bootstrap';

type CorsSettings = {
    origin: string | string[] | boolean;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
};

initializeOpenTelemetry();

function parseCsvConfig(value: string | undefined, fallback: string[]): string[] {
    const parsed = (value ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

    return parsed.length > 0 ? parsed : fallback;
}

function resolveCorsSettings(): CorsSettings {
    const rawCorsOrigin = process.env.CORS_ORIGIN?.trim();
    const methods = parseCsvConfig(
        process.env.CORS_ALLOWED_METHODS,
        ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    );
    const allowedHeaders = parseCsvConfig(
        process.env.CORS_ALLOWED_HEADERS,
        [
            'Authorization',
            'Content-Type',
            'x-request-id',
            'x-organization-id',
            'x-api-key',
            'x-visitor-id',
            'x-session-id',
            'traceparent',
            'tracestate',
            'baggage',
        ],
    );
    const exposedHeaders = parseCsvConfig(
        process.env.CORS_EXPOSED_HEADERS,
        ['x-request-id', 'x-trace-id', 'traceparent'],
    );

    if (!rawCorsOrigin) {
        return {
            origin: 'http://localhost:5173',
            credentials: true,
            methods,
            allowedHeaders,
            exposedHeaders,
        };
    }

    if (rawCorsOrigin === '*') {
        // Wildcard must not be combined with credentials in browsers.
        return {
            origin: true,
            credentials: false,
            methods,
            allowedHeaders,
            exposedHeaders,
        };
    }

    const origins = rawCorsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length === 0) {
        return {
            origin: 'http://localhost:5173',
            credentials: true,
            methods,
            allowedHeaders,
            exposedHeaders,
        };
    }

    return {
        origin: origins.length === 1 ? origins[0] : origins,
        credentials: true,
        methods,
        allowedHeaders,
        exposedHeaders,
    };
}

function resolveRequestId(headerValue: unknown): string {
    if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
        return headerValue.trim();
    }

    if (Array.isArray(headerValue)) {
        const first = headerValue.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
        if (first) {
            return first.trim();
        }
    }

    return randomUUID();
}

function resolveRequestPath(request: Request): string {
    const candidate = request.originalUrl || request.url || '/';
    const [path] = candidate.split('?');
    return path || '/';
}

function resolveSingleHeader(headerValue: unknown): string | null {
    if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
        return headerValue.trim();
    }

    if (Array.isArray(headerValue)) {
        const first = headerValue.find((entry) => typeof entry === 'string' && entry.trim().length > 0);
        return typeof first === 'string' ? first.trim() : null;
    }

    return null;
}

function generateTraceId(): string {
    return randomBytes(16).toString('hex');
}

function generateSpanId(): string {
    return randomBytes(8).toString('hex');
}

function extractTraceIdFromTraceparent(rawTraceparent: string | null): string | null {
    if (!rawTraceparent) {
        return null;
    }

    const parts = rawTraceparent.trim().split('-');
    if (parts.length !== 4) {
        return null;
    }

    const traceId = parts[1] ?? '';
    if (!/^[a-f0-9]{32}$/i.test(traceId) || /^0{32}$/i.test(traceId)) {
        return null;
    }

    return traceId.toLowerCase();
}

function buildTraceparent(traceId: string): string {
    return `00-${traceId}-${generateSpanId()}-01`;
}

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const httpLogger = new Logger('HTTP');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
    });
    const trustProxy = (process.env.SECURITY_TRUST_PROXY?.trim() || 'true').toLowerCase();
    if (trustProxy === 'true' || trustProxy === '1') {
        app.set('trust proxy', 1);
    }

    const observabilityService = app.get(ObservabilityService);
    const corsSettings = resolveCorsSettings();
    const sentryDsn = process.env.SENTRY_DSN?.trim();
    const sentryClient = getSentryClient();

    if (sentryDsn && sentryClient) {
        const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0');
        const normalizedSampleRate = Number.isFinite(tracesSampleRate) && tracesSampleRate >= 0 && tracesSampleRate <= 1
            ? tracesSampleRate
            : 0;

        sentryClient.init({
            dsn: sentryDsn,
            environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
            tracesSampleRate: normalizedSampleRate,
        });
        logger.log('Sentry initialized');
    }

    const httpAdapter = app.getHttpAdapter().getInstance();
    if (typeof httpAdapter?.disable === 'function') {
        httpAdapter.disable('x-powered-by');
    }

    app.use(
        helmet({
            contentSecurityPolicy: false,
            crossOriginEmbedderPolicy: false,
            crossOriginResourcePolicy: { policy: 'cross-origin' },
            hsts: process.env.NODE_ENV === 'production'
                ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
                : false,
            referrerPolicy: { policy: 'no-referrer' },
        }),
    );
    app.use(compression());

    app.use(
        json({
            verify: (request: any, _response, buffer) => {
                request.rawBody = Buffer.from(buffer);
            },
        }),
    );
    app.use(urlencoded({ extended: true }));

    app.use((request: Request, response: Response, next: NextFunction) => {
        const start = process.hrtime.bigint();
        const incomingTraceparent = resolveSingleHeader(request.headers['traceparent']);
        const traceId = extractTraceIdFromTraceparent(incomingTraceparent) || generateTraceId();
        const traceparent = incomingTraceparent || buildTraceparent(traceId);
        const requestId = resolveRequestId(request.headers['x-request-id']);

        request.headers['traceparent'] = traceparent;
        request.headers['x-trace-id'] = traceId;
        response.setHeader('x-request-id', requestId);
        response.setHeader('x-trace-id', traceId);
        response.setHeader('traceparent', traceparent);

        response.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
            const route = resolveRequestPath(request);
            const status = String(response.statusCode);

            observabilityService.trackHttpRequest(request.method, route, status, durationMs);
            httpLogger.log(
                JSON.stringify({
                    requestId,
                    traceId,
                    traceparent,
                    method: request.method,
                    route,
                    statusCode: response.statusCode,
                    durationMs: Number(durationMs.toFixed(2)),
                    userAgent: request.headers['user-agent'] ?? null,
                    ip: request.ip ?? null,
                }),
            );
        });

        next();
    });

    app.enableCors({
        origin: corsSettings.origin,
        credentials: corsSettings.credentials,
        methods: corsSettings.methods,
        allowedHeaders: corsSettings.allowedHeaders,
        exposedHeaders: corsSettings.exposedHeaders,
        maxAge: 86_400,
    });

    app.useStaticAssets(join(process.cwd(), 'uploads'), {
        prefix: '/uploads/',
    });

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }),
    );

    app.setGlobalPrefix('api');
    app.enableShutdownHooks();

    const port = Number(process.env.PORT) || 3000;
    await app.listen(port);
    logger.log(`AquiTa.do API running on http://localhost:${port}`);

    const shutdown = async () => {
        await shutdownOpenTelemetry();
    };
    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());
}

bootstrap();
