import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
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
        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: USERS_EMAIL_DOMAIN,
                },
            },
        });
    });

    afterAll(async () => {
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
});
