import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationAccessService } from './organization-access.service';
import { PrismaService } from '../prisma/prisma.service';

function createOrganizationAccessService() {
    const prisma = {
        organization: {
            findUnique: vi.fn(),
        },
        organizationMember: {
            findUnique: vi.fn(),
        },
    };

    return {
        service: new OrganizationAccessService(prisma as unknown as PrismaService),
        prisma,
    };
}

describe('OrganizationAccessService', () => {
    it('returns the membership role for organization members', async () => {
        const { service, prisma } = createOrganizationAccessService();
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
        prisma.organizationMember.findUnique.mockResolvedValue({ role: 'MANAGER' });

        await expect(service.resolveActorRole('org-1', 'user-1')).resolves.toBe('MANAGER');
    });

    it('throws NotFoundException when the organization does not exist', async () => {
        const { service, prisma } = createOrganizationAccessService();
        prisma.organization.findUnique.mockResolvedValue(null);

        await expect(service.resolveActorRole('missing-org', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when the user is not a member of the organization', async () => {
        const { service, prisma } = createOrganizationAccessService();
        prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
        prisma.organizationMember.findUnique.mockResolvedValue(null);

        await expect(service.resolveActorRole('org-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows organization management for OWNER and MANAGER roles', () => {
        const { service } = createOrganizationAccessService();

        expect(() => service.assertCanManageOrganization('OWNER')).not.toThrow();
        expect(() => service.assertCanManageOrganization('MANAGER')).not.toThrow();
    });

    it('rejects organization management for STAFF members', () => {
        const { service } = createOrganizationAccessService();

        expect(() => service.assertCanManageOrganization('STAFF')).toThrow(ForbiddenException);
    });

    it('requires an organization membership role when scoped access is mandatory', () => {
        const { service } = createOrganizationAccessService();

        expect(() => service.assertOrganizationMember('STAFF', 'scoped-access')).not.toThrow();
        expect(() => service.assertOrganizationMember(null, 'scoped-access')).toThrowError('scoped-access');
    });

    it('allows OWNER invitations except another OWNER', () => {
        const { service } = createOrganizationAccessService();

        expect(() => service.assertInvitePermission('OWNER', 'MANAGER')).not.toThrow();
        expect(() => service.assertInvitePermission('OWNER', 'OWNER')).toThrow(ForbiddenException);
    });

    it('allows MANAGER invitations only for STAFF', () => {
        const { service } = createOrganizationAccessService();

        expect(() => service.assertInvitePermission('MANAGER', 'STAFF')).not.toThrow();
        expect(() => service.assertInvitePermission('MANAGER', 'MANAGER')).toThrow(ForbiddenException);
    });

    it('requires OWNER role when explicitly requested', () => {
        const { service } = createOrganizationAccessService();

        expect(() => service.assertOwner('OWNER', 'owner-only')).not.toThrow();
        expect(() => service.assertOwner('MANAGER', 'owner-only')).toThrowError('owner-only');
    });
});
