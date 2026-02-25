import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const E2E_EMAIL_DOMAIN = '@e2e.aquita.local';

function makeRegisterPayload(seed: string) {
    return {
        name: `E2E User ${seed}`,
        email: `user-${seed}${E2E_EMAIL_DOMAIN}`,
        password: 'password123',
        phone: '8095550000',
    };
}

describe('AuthController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

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

        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: E2E_EMAIL_DOMAIN,
                },
            },
        });
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: E2E_EMAIL_DOMAIN,
                },
            },
        });
        await app.close();
    });

    it('registers a new user and returns access token', async () => {
        const seed = `${Date.now()}`;
        const payload = makeRegisterPayload(seed);

        const response = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(201);

        expect(typeof response.body.accessToken).toBe('string');
        expect(response.body.accessToken.length).toBeGreaterThan(20);
        expect(response.body.user).toMatchObject({
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            role: 'USER',
        });
        expect(response.body.user).not.toHaveProperty('password');

        const persisted = await prisma.user.findUnique({
            where: { email: payload.email },
        });

        expect(persisted).not.toBeNull();
        expect(persisted?.password).not.toBe(payload.password);
    });

    it('rejects duplicate email registration', async () => {
        const payload = makeRegisterPayload('duplicate');

        await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(201);

        const response = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(409);

        expect(response.body).toMatchObject({
            statusCode: 409,
            error: 'Conflict',
        });
        expect(String(response.body.message).toLowerCase()).toContain('registr');
    });

    it('logs in with valid credentials', async () => {
        const payload = makeRegisterPayload('login-success');

        await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(201);

        const response = await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({
                email: payload.email,
                password: payload.password,
            })
            .expect(200);

        expect(typeof response.body.accessToken).toBe('string');
        expect(response.body.user).toMatchObject({
            email: payload.email,
            name: payload.name,
            role: 'USER',
        });
    });

    it('rejects login with invalid password', async () => {
        const payload = makeRegisterPayload('login-invalid');

        await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(201);

        const response = await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({
                email: payload.email,
                password: 'wrong-password',
            })
            .expect(401);

        expect(response.body).toMatchObject({
            statusCode: 401,
            error: 'Unauthorized',
        });
    });
});
