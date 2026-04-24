import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ObservabilityService } from '../observability/observability.service';

function createConfigService(): ConfigService {
    return {
        get: vi.fn((key: string) => {
            if (key === 'JWT_SECRET') {
                return 'jwt-secret';
            }

            return undefined;
        }),
    } as unknown as ConfigService;
}

function createAuthService() {
    const tx = {
        user: {
            update: vi.fn(),
        },
        refreshToken: {
            updateMany: vi.fn(),
        },
        passwordResetToken: {
            update: vi.fn(),
            deleteMany: vi.fn(),
        },
    };

    const prisma = {
        user: {
            findUnique: vi.fn(),
        },
        refreshToken: {
            findUnique: vi.fn(),
            updateMany: vi.fn(),
        },
        passwordResetToken: {
            findUnique: vi.fn(),
        },
        $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };

    const jwtService = {
        sign: vi.fn(),
        verify: vi.fn(),
    };

    const integrationsService = {
        validateDominicanPhone: vi.fn(),
    };

    const observabilityService = {
        trackExternalDependencyCall: vi.fn(),
    };

    return {
        service: new AuthService(
            prisma as unknown as PrismaService,
            jwtService as never,
            createConfigService(),
            integrationsService as unknown as IntegrationsService,
            observabilityService as unknown as ObservabilityService,
        ),
        prisma,
        tx,
    };
}

describe('AuthService session invalidation', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('bumps sessionVersion on logout when a refresh token exists', async () => {
        const { service, prisma, tx } = createAuthService();
        prisma.refreshToken.findUnique.mockResolvedValue({
            userId: 'user-1',
            revokedAt: null,
        });

        const response = {
            clearCookie: vi.fn(),
        };

        await service.logout(
            'refresh-token',
            { headers: {} } as never,
            response as never,
        );

        expect(prisma.refreshToken.findUnique).toHaveBeenCalledTimes(1);
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.user.update).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: {
                sessionVersion: { increment: 1 },
            },
        });
    });

    it('bumps sessionVersion when changing password', async () => {
        const { service, prisma, tx } = createAuthService();
        prisma.user.findUnique.mockResolvedValue({
            id: 'user-1',
            password: await bcrypt.hash('current-password', 4),
        });

        const response = {
            clearCookie: vi.fn(),
        };

        await service.changePassword(
            'user-1',
            {
                currentPassword: 'current-password',
                newPassword: 'new-password-123',
            },
            response as never,
        );

        expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-1' },
            data: expect.objectContaining({
                sessionVersion: { increment: 1 },
            }),
        }));
    });

    it('bumps sessionVersion when resetting password', async () => {
        const { service, prisma, tx } = createAuthService();
        prisma.passwordResetToken.findUnique.mockResolvedValue({
            id: 'reset-token-1',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 60_000),
            usedAt: null,
            user: {
                id: 'user-1',
                password: await bcrypt.hash('current-password', 4),
            },
        });

        await service.resetPassword('raw-reset-token', 'brand-new-password');

        expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'user-1' },
            data: expect.objectContaining({
                sessionVersion: { increment: 1 },
            }),
        }));
    });
});
