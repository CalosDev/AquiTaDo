import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

function createStrategy() {
    const prisma = {
        user: {
            findUnique: vi.fn(),
        },
    };

    const configService = {
        get: vi.fn((key: string) => {
            if (key === 'JWT_SECRET') {
                return 'test-secret';
            }

            return undefined;
        }),
    } as unknown as ConfigService;

    return {
        strategy: new JwtStrategy(
            configService,
            prisma as unknown as PrismaService,
        ),
        prisma,
    };
}

describe('JwtStrategy', () => {
    it('rejects access tokens issued before the current session version', async () => {
        const { strategy, prisma } = createStrategy();

        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            email: 'user@aquita.do',
            name: 'Usuario',
            role: 'USER',
            sessionVersion: 2,
        });

        await expect(strategy.validate({
            sub: 'user-1',
            role: 'USER',
            sessionVersion: 1,
        } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('accepts access tokens that match the current session version', async () => {
        const { strategy, prisma } = createStrategy();

        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            email: 'user@aquita.do',
            name: 'Usuario',
            role: 'USER',
            sessionVersion: 3,
        });

        await expect(strategy.validate({
            sub: 'user-1',
            role: 'USER',
            sessionVersion: 3,
        } as never)).resolves.toEqual({
            id: 'user-1',
            email: 'user@aquita.do',
            name: 'Usuario',
            role: 'USER',
        });
    });
});
