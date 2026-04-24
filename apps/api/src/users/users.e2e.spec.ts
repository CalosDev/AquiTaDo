import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { existsSync, promises as fs } from 'fs';
import * as path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const USERS_EMAIL_DOMAIN = '@e2e-users.aquita.local';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('UsersController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let jwtService: JwtService;

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
        jwtService = app.get(JwtService);
    });

    beforeEach(async () => {
        const existingUsers = await prisma.user.findMany({
            where: {
                email: {
                    endsWith: USERS_EMAIL_DOMAIN,
                },
            },
            select: {
                id: true,
            },
        });

        await Promise.all(existingUsers.map(async (user) => {
            await fs.rm(path.resolve(process.cwd(), 'uploads', 'avatars', user.id), {
                recursive: true,
                force: true,
            });
        }));

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: USERS_EMAIL_DOMAIN,
                },
            },
        });
    });

    afterAll(async () => {
        const existingUsers = await prisma.user.findMany({
            where: {
                email: {
                    endsWith: USERS_EMAIL_DOMAIN,
                },
            },
            select: {
                id: true,
            },
        });

        await Promise.all(existingUsers.map(async (user) => {
            await fs.rm(path.resolve(process.cwd(), 'uploads', 'avatars', user.id), {
                recursive: true,
                force: true,
            });
        }));

        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: USERS_EMAIL_DOMAIN,
                },
            },
        });
        await app.close();
    });

    async function createUser() {
        const seed = makeSeed();
        return prisma.user.create({
            data: {
                name: `E2E User ${seed}`,
                email: `user-${seed}${USERS_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
            },
        });
    }

    it('rejects unauthenticated access to GET /api/users/me', async () => {
        await request(app.getHttpServer())
            .get('/api/users/me')
            .expect(401);
    });

    it('returns current user profile with a valid JWT', async () => {
        const user = await createUser();
        const accessToken = jwtService.sign({ sub: user.id, role: user.role });

        const response = await request(app.getHttpServer())
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(response.body).toMatchObject({
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
        });
        expect(response.body).not.toHaveProperty('password');
        expect(typeof response.body.createdAt).toBe('string');
        expect(typeof response.body.updatedAt).toBe('string');
    });

    it('returns twoFactorEnabled in GET /api/users/me', async () => {
        const user = await prisma.user.create({
            data: {
                name: `E2E 2FA User ${makeSeed()}`,
                email: `user-2fa-${makeSeed()}${USERS_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                twoFactorEnabled: true,
            },
        });
        const accessToken = jwtService.sign({ sub: user.id, role: user.role });

        const response = await request(app.getHttpServer())
            .get('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(response.body).toMatchObject({
            id: user.id,
            twoFactorEnabled: true,
        });
    });

    it('uploads, replaces, and deletes a managed avatar for the current user', async () => {
        const user = await createUser();
        const accessToken = jwtService.sign({ sub: user.id, role: user.role });

        const firstUpload = await request(app.getHttpServer())
            .post('/api/upload/avatar')
            .set('Authorization', `Bearer ${accessToken}`)
            .attach('file', Buffer.from('first-avatar-binary'), {
                filename: 'avatar-1.png',
                contentType: 'image/png',
            })
            .expect(201);

        const firstAvatarUrl = String(firstUpload.body.avatarUrl);
        const firstAvatarPath = path.resolve(process.cwd(), firstAvatarUrl.replace(/^\/+/, ''));

        expect(firstAvatarUrl).toContain(`/avatars/${user.id}/`);
        if (firstAvatarUrl.startsWith('/uploads/')) {
            expect(existsSync(firstAvatarPath)).toBe(true);
        }

        const secondUpload = await request(app.getHttpServer())
            .post('/api/upload/avatar')
            .set('Authorization', `Bearer ${accessToken}`)
            .attach('file', Buffer.from('second-avatar-binary'), {
                filename: 'avatar-2.png',
                contentType: 'image/png',
            })
            .expect(201);

        const secondAvatarUrl = String(secondUpload.body.avatarUrl);
        const secondAvatarPath = path.resolve(process.cwd(), secondAvatarUrl.replace(/^\/+/, ''));

        expect(secondAvatarUrl).toContain(`/avatars/${user.id}/`);
        expect(secondAvatarUrl).not.toBe(firstAvatarUrl);
        if (secondAvatarUrl.startsWith('/uploads/')) {
            expect(existsSync(secondAvatarPath)).toBe(true);
        }
        if (firstAvatarUrl.startsWith('/uploads/')) {
            expect(existsSync(firstAvatarPath)).toBe(false);
        }

        const persistedAfterReplace = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                avatarUrl: true,
            },
        });

        expect(persistedAfterReplace?.avatarUrl).toBe(secondAvatarUrl);

        const deleted = await request(app.getHttpServer())
            .delete('/api/upload/avatar')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(deleted.body).toEqual({
            avatarUrl: null,
        });
        if (secondAvatarUrl.startsWith('/uploads/')) {
            expect(existsSync(secondAvatarPath)).toBe(false);
        }

        const persistedAfterDelete = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                avatarUrl: true,
            },
        });

        expect(persistedAfterDelete?.avatarUrl).toBeNull();
    });

    it('rejects manual avatarUrl updates through PATCH /api/users/me', async () => {
        const user = await createUser();
        const accessToken = jwtService.sign({ sub: user.id, role: user.role });

        const response = await request(app.getHttpServer())
            .patch('/api/users/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                avatarUrl: 'https://example.com/avatar.png',
            })
            .expect(400);

        expect(response.body).toMatchObject({
            statusCode: 400,
            error: 'Bad Request',
        });
    });
});
