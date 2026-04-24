import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const E2E_EMAIL_DOMAIN = '@e2e.aquita.local';
const GOOGLE_TEST_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
let registerRequestIpOctet = 0;

function makeRegisterPayload(seed: string) {
    return {
        name: `E2E User ${seed}`,
        email: `user-${seed}${E2E_EMAIL_DOMAIN}`,
        password: 'password123',
        phone: '8095550000',
    };
}

function mockJsonResponse(payload: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
    } as unknown as Response;
}

function nextRegisterRequestIp(): string {
    registerRequestIpOctet = (registerRequestIpOctet % 250) + 1;
    return `198.51.100.${registerRequestIpOctet}`;
}

function registerUser(app: INestApplication, payload: ReturnType<typeof makeRegisterPayload>) {
    return request(app.getHttpServer())
        .post('/api/auth/register')
        .set('x-forwarded-for', nextRegisterRequestIp())
        .send(payload);
}

describe('AuthController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        process.env.AUTH_DEBUG_RESET_TOKENS = 'true';
        process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_TEST_CLIENT_ID;

        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication();
        app.getHttpAdapter().getInstance().set('trust proxy', 1);
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

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
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

        const response = await registerUser(app, payload).expect(201);

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

        await registerUser(app, payload).expect(201);

        const response = await registerUser(app, payload).expect(409);

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

        const response = await registerUser(app, payload).expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });

    it('logs in with valid credentials', async () => {
        const payload = makeRegisterPayload('login-success');

        await registerUser(app, payload).expect(201);

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

        await registerUser(app, payload).expect(201);

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

        const registerResponse = await registerUser(app, payload).expect(201);

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

        const registerResponse = await registerUser(app, payload).expect(201);

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

        expect(String(changePasswordResponse.body.message)).toContain('Contrasena');
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

    it('invalidates the current access token after logout', async () => {
        const payload = makeRegisterPayload('logout-access-token');

        const registerResponse = await registerUser(app, payload).expect(201);

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

        await request(app.getHttpServer())
            .post('/api/auth/logout')
            .set('Cookie', [refreshCookie as string])
            .send({})
            .expect(200);

        await request(app.getHttpServer())
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(401);
    });

    it('invalidates the current access token after password change', async () => {
        const payload = makeRegisterPayload('change-password-access-token');

        const registerResponse = await registerUser(app, payload).expect(201);

        const accessToken = String(registerResponse.body.accessToken);

        await request(app.getHttpServer())
            .post('/api/auth/change-password')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                currentPassword: payload.password,
                newPassword: 'Password456',
            })
            .expect(200);

        await request(app.getHttpServer())
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(401);
    });

    it('returns a generic response for forgot password and exposes debug data for known users', async () => {
        const payload = makeRegisterPayload('forgot-password');

        await registerUser(app, payload).expect(201);

        const existingUserResponse = await request(app.getHttpServer())
            .post('/api/auth/forgot-password')
            .send({ email: payload.email })
            .expect(200);

        expect(existingUserResponse.body).toMatchObject({
            message: expect.stringContaining('Si el correo existe'),
        });
        expect(typeof existingUserResponse.body.debugResetToken).toBe('string');
        expect(existingUserResponse.body.debugResetToken.length).toBeGreaterThan(20);
        expect(String(existingUserResponse.body.debugResetUrl)).toContain('/reset-password?token=');

        const unknownUserResponse = await request(app.getHttpServer())
            .post('/api/auth/forgot-password')
            .send({ email: 'missing-user@e2e.aquita.local' })
            .expect(200);

        expect(unknownUserResponse.body).toEqual({
            message: existingUserResponse.body.message,
        });
    });

    it('resets the password, rejects the old password, and invalidates the token after one use', async () => {
        const payload = makeRegisterPayload('reset-password');

        await registerUser(app, payload).expect(201);

        const forgotPasswordResponse = await request(app.getHttpServer())
            .post('/api/auth/forgot-password')
            .send({ email: payload.email })
            .expect(200);

        const resetToken = String(forgotPasswordResponse.body.debugResetToken || '');
        expect(resetToken.length).toBeGreaterThan(20);

        const resetResponse = await request(app.getHttpServer())
            .post('/api/auth/reset-password')
            .send({
                token: resetToken,
                newPassword: 'Reset4567',
            })
            .expect(200);

        expect(String(resetResponse.body.message)).toContain('Contrasena restablecida');

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
                password: 'Reset4567',
            })
            .expect(200);

        await request(app.getHttpServer())
            .post('/api/auth/reset-password')
            .send({
                token: resetToken,
                newPassword: 'Reset5678',
            })
            .expect(400);
    });

    it('invalidates the current access token after password reset', async () => {
        const payload = makeRegisterPayload('reset-password-access-token');

        const registerResponse = await registerUser(app, payload).expect(201);

        const accessToken = String(registerResponse.body.accessToken);

        const forgotPasswordResponse = await request(app.getHttpServer())
            .post('/api/auth/forgot-password')
            .send({ email: payload.email })
            .expect(200);

        const resetToken = String(forgotPasswordResponse.body.debugResetToken || '');
        expect(resetToken.length).toBeGreaterThan(20);

        await request(app.getHttpServer())
            .post('/api/auth/reset-password')
            .send({
                token: resetToken,
                newPassword: 'Reset4567',
            })
            .expect(200);

        await request(app.getHttpServer())
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(401);
    });

    it('creates a new account from a valid Google identity token', async () => {
        const googleFetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({
                aud: GOOGLE_TEST_CLIENT_ID,
                email: 'google-user@e2e.aquita.local',
                email_verified: 'true',
                iss: 'https://accounts.google.com',
                name: 'Google User',
                picture: 'https://example.com/google-user.png',
                sub: 'google-sub-new-user',
            }),
        );
        vi.stubGlobal('fetch', googleFetchMock);

        const response = await request(app.getHttpServer())
            .post('/api/auth/google')
            .send({
                idToken: 'google-id-token-valid-for-tests-12345',
            })
            .expect(200);

        expect(typeof response.body.accessToken).toBe('string');
        expect(response.body.user).toMatchObject({
            email: 'google-user@e2e.aquita.local',
            name: 'Google User',
            avatarUrl: 'https://example.com/google-user.png',
            role: 'USER',
        });

        const persisted = await prisma.user.findUnique({
            where: { email: 'google-user@e2e.aquita.local' },
            select: {
                googleSubject: true,
                avatarUrl: true,
            },
        });

        expect(persisted).toMatchObject({
            googleSubject: 'google-sub-new-user',
            avatarUrl: 'https://example.com/google-user.png',
        });
        expect(googleFetchMock).toHaveBeenCalledTimes(1);
    });

    it('links Google identity to an existing email account and preserves its role', async () => {
        const seed = `google-link-${Date.now()}`;
        const existingUser = await prisma.user.create({
            data: {
                name: 'Existing Google Link',
                email: `user-${seed}${E2E_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role: 'BUSINESS_OWNER',
            },
        });

        const googleFetchMock = vi.fn().mockResolvedValue(
            mockJsonResponse({
                aud: GOOGLE_TEST_CLIENT_ID,
                email: existingUser.email,
                email_verified: 'true',
                iss: 'accounts.google.com',
                name: 'Google Link Existing',
                picture: 'https://example.com/google-link-existing.png',
                sub: 'google-sub-existing-user',
            }),
        );
        vi.stubGlobal('fetch', googleFetchMock);

        const response = await request(app.getHttpServer())
            .post('/api/auth/google')
            .send({
                idToken: 'google-id-token-existing-user-12345',
            })
            .expect(200);

        expect(response.body.user).toMatchObject({
            id: existingUser.id,
            email: existingUser.email,
            role: 'BUSINESS_OWNER',
            avatarUrl: 'https://example.com/google-link-existing.png',
        });

        const persisted = await prisma.user.findUnique({
            where: { id: existingUser.id },
            select: {
                googleSubject: true,
                role: true,
                avatarUrl: true,
            },
        });

        expect(persisted).toMatchObject({
            googleSubject: 'google-sub-existing-user',
            role: 'BUSINESS_OWNER',
            avatarUrl: 'https://example.com/google-link-existing.png',
        });
    });
});
