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
        expect(response.body.refreshToken).toBeUndefined();
        expect(response.headers['set-cookie']).toBeDefined();
        expect(String(response.headers['set-cookie']?.[0] ?? '')).toContain('aquita_refresh_token=');
        expect(response.body.user).toMatchObject({
            name: payload.name,
            email: payload.email,
            phone: '+18095550000',
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

    it('rejects ADMIN role assignment from public registration', async () => {
        const payload = {
            ...makeRegisterPayload('role-admin'),
            role: 'ADMIN',
        };

        const response = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
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
        expect(response.body.refreshToken).toBeUndefined();
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

    it('rotates refresh token via HttpOnly cookie flow', async () => {
        const payload = makeRegisterPayload('refresh-cookie');

        const registerResponse = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(201);

        const rawCookieHeader = registerResponse.headers['set-cookie'];
        const cookieHeader = Array.isArray(rawCookieHeader)
            ? rawCookieHeader
            : rawCookieHeader
                ? [String(rawCookieHeader)]
                : [];

        expect(cookieHeader.length).toBeGreaterThan(0);
        const refreshCookie = cookieHeader.find((cookie) =>
            cookie.startsWith('aquita_refresh_token='),
        );
        expect(refreshCookie).toBeDefined();

        const refreshResponse = await request(app.getHttpServer())
            .post('/api/auth/refresh')
            .set('Cookie', [refreshCookie as string])
            .send({})
            .expect(200);

        expect(typeof refreshResponse.body.accessToken).toBe('string');
        expect(refreshResponse.body.refreshToken).toBeUndefined();
        expect(refreshResponse.headers['set-cookie']).toBeDefined();
        expect(String(refreshResponse.headers['set-cookie']?.[0] ?? '')).toContain('aquita_refresh_token=');
    });

    it('changes password, revokes refresh token, and rejects the previous password', async () => {
        const payload = makeRegisterPayload('change-password');

        const registerResponse = await request(app.getHttpServer())
            .post('/api/auth/register')
            .send(payload)
            .expect(201);

        const accessToken = String(registerResponse.body.accessToken);
        const rawCookieHeader = registerResponse.headers['set-cookie'];
        const cookieHeader = Array.isArray(rawCookieHeader)
            ? rawCookieHeader
            : rawCookieHeader
                ? [String(rawCookieHeader)]
                : [];
        const refreshCookie = cookieHeader.find((cookie) =>
            cookie.startsWith('aquita_refresh_token='),
        );

        expect(refreshCookie).toBeDefined();

        const changePasswordResponse = await request(app.getHttpServer())
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                currentPassword: payload.password,
                newPassword: 'Password456',
            })
            .expect(200);

        expect(String(changePasswordResponse.body.message)).toContain('Contraseña');
        expect(String(changePasswordResponse.headers['set-cookie']?.[0] ?? '')).toContain('aquita_refresh_token=');

        await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({
                email: payload.email,
                password: payload.password,
            })
            .expect(401);

        await request(app.getHttpServer())
            .post('/api/auth/login')
            .send({
                email: payload.email,
                password: 'Password456',
            })
            .expect(200);

        await request(app.getHttpServer())
            .post('/api/auth/refresh')
            .set('Cookie', [refreshCookie as string])
            .send({})
            .expect(401);
    });
});
