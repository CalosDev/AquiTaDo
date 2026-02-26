import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

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

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        bodyParser: false,
    });
    const corsSettings = resolveCorsSettings();

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
