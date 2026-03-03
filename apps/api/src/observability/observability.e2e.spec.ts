import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';

const OBSERVABILITY_EMAIL_DOMAIN = '@e2e-observability.aquita.local';

function makeSeed(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe('ObservabilityController (e2e)', () => {
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

    async function cleanupFixtures() {
        await prisma.user.deleteMany({
            where: {
                email: {
                    endsWith: OBSERVABILITY_EMAIL_DOMAIN,
                },
            },
        });
    }

    beforeEach(async () => {
        await cleanupFixtures();
    });

    afterAll(async () => {
        await cleanupFixtures();
        await app.close();
    });

    async function createUser(role: 'USER' | 'BUSINESS_OWNER' | 'ADMIN' = 'USER') {
        const seed = makeSeed();
        return prisma.user.create({
            data: {
                name: `E2E Observability ${seed}`,
                email: `user-${seed}${OBSERVABILITY_EMAIL_DOMAIN}`,
                password: 'e2e-not-used-password-hash',
                role,
            },
        });
    }

    function signToken(userId: string, role: string): string {
        return jwtService.sign({ sub: userId, role });
    }

    it('rejects unauthenticated metrics access', async () => {
        await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .expect(401);
    });

    it('rejects authenticated non-admin metrics access', async () => {
        const user = await createUser('USER');
        const token = signToken(user.id, user.role);

        await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .set('Authorization', `Bearer ${token}`)
            .expect(403);
    });

    it('allows admin metrics access', async () => {
        const admin = await createUser('ADMIN');
        const token = signToken(admin.id, admin.role);

        const response = await request(app.getHttpServer())
            .get('/api/observability/metrics')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(response.text).toContain('# HELP');
        expect(response.text).toContain('aquita_');
    });
});

