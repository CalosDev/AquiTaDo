import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

function resolveCorsOrigin(): string | string[] | boolean {
    const rawCorsOrigin = process.env.CORS_ORIGIN?.trim();

    if (!rawCorsOrigin) {
        return 'http://localhost:5173';
    }

    if (rawCorsOrigin === '*') {
        return true;
    }

    const origins = rawCorsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length === 0) {
        return 'http://localhost:5173';
    }

    return origins.length === 1 ? origins[0] : origins;
}

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);

    const httpAdapter = app.getHttpAdapter().getInstance();
    if (typeof httpAdapter?.disable === 'function') {
        httpAdapter.disable('x-powered-by');
    }

    app.enableCors({
        origin: resolveCorsOrigin(),
        credentials: true,
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

    const port = Number(process.env.PORT) || 3000;
    await app.listen(port);
    console.log(`AquiTa.do API running on http://localhost:${port}`);
}

bootstrap();
