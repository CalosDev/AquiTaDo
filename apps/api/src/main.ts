import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { ObservabilityService } from './observability/observability.service';
import { getSentryClient } from './core/observability/sentry.client';

type CorsSettings = {
    origin: string | string[] | boolean;
    credentials: boolean;
};

function resolveCorsSettings(): CorsSettings {
    const rawCorsOrigin = process.env.CORS_ORIGIN?.trim();

    if (!rawCorsOrigin) {
        return {
            origin: 'http://localhost:5173',
            credentials: true,
        };
    }

    if (rawCorsOrigin === '*') {
        // Wildcard must not be combined with credentials in browsers.
        return {
            origin: true,
            credentials: false,
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
        };
    }

    return {
        origin: origins.length === 1 ? origins[0] : origins,
        credentials: true,
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

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const httpLogger = new Logger('HTTP');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
    });
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
            crossOriginResourcePolicy: false,
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
        const requestId = resolveRequestId(request.headers['x-request-id']);
        response.setHeader('x-request-id', requestId);

        response.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
            const route = resolveRequestPath(request);
            const status = String(response.statusCode);

            observabilityService.trackHttpRequest(request.method, route, status, durationMs);
            httpLogger.log(
                JSON.stringify({
                    requestId,
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
}

bootstrap();
