import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

describe('Platform Modules (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        app.setGlobalPrefix('api');
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true,
                transformOptions: { enableImplicitConversion: true },
            }),
        );
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('rejects invalid payload for AI concierge queries', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/ai/concierge/query')
            .send({})
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('requires auth for AI business reindex', async () => {
        await request(app.getHttpServer())
            .post('/api/ai/businesses/00000000-0000-0000-0000-000000000000/reindex')
            .expect(401);
    });

    it('rejects missing WhatsApp webhook verification params', async () => {
        const response = await request(app.getHttpServer())
            .get('/api/whatsapp/webhook')
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('rejects invalid payload for click-to-chat conversion tracking', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/whatsapp/click-to-chat')
            .send({})
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('rejects invalid ad campaign id on impression tracking', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/ads/campaigns/not-a-uuid/impression')
            .send({})
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('requires auth for ad campaign creation', async () => {
        await request(app.getHttpServer())
            .post('/api/ads/campaigns')
            .send({})
            .expect(401);
    });

    it('requires auth for listing payments', async () => {
        await request(app.getHttpServer())
            .get('/api/payments/my')
            .expect(401);
    });
});
