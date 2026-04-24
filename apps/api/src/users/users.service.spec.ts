import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';

function createUsersService() {
    const fullUserRecord = {
        id: 'user-1',
        name: 'Usuario',
        email: 'user@aquita.do',
        phone: '+18095550000',
        avatarUrl: null,
        role: 'USER',
        twoFactorEnabled: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };

    const prisma = {
        user: {
            findUnique: vi.fn(async (args?: { select?: Record<string, boolean> }) => {
                if (!args?.select) {
                    return fullUserRecord;
                }

                return Object.fromEntries(
                    Object.entries(args.select)
                        .filter(([, selected]) => selected)
                        .map(([key]) => [key, fullUserRecord[key as keyof typeof fullUserRecord]]),
                );
            }),
        },
    };

    const integrationsService = {
        validateDominicanPhone: vi.fn(),
    };

    return {
        service: new UsersService(
            prisma as unknown as PrismaService,
            integrationsService as unknown as IntegrationsService,
        ),
        prisma,
    };
}

describe('UsersService', () => {
    it('returns twoFactorEnabled in the current user profile payload', async () => {
        const { service } = createUsersService();

        const profile = await service.findById('user-1');

        expect(profile).toMatchObject({
            id: 'user-1',
            twoFactorEnabled: true,
        });
    });
});
