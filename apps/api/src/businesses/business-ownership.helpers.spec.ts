import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
    assertAdminClaimableBusiness,
    assertExistingOwnershipHistoryBusiness,
    assertRevocableBusinessOwnership,
    buildOwnershipRevocationBusinessUpdateData,
    buildAdminMarkClaimedBusinessUpdateData,
    businessBelongsToOrganization,
    clampOwnershipHistoryLimit,
    resolveActiveBusinessOrganizationId,
} from './business-ownership.helpers';

describe('business ownership helpers', () => {
    it('prefers active ownership organization when resolving the active organization id', () => {
        expect(
            resolveActiveBusinessOrganizationId({
                organizationId: 'org-fallback',
                primaryManagingOrganizationId: 'org-primary',
                ownerships: [{ organizationId: 'org-active' }],
            }),
        ).toBe('org-active');
    });

    it('checks whether a business belongs to the provided organization', () => {
        expect(
            businessBelongsToOrganization(
                {
                    organizationId: 'org-fallback',
                    primaryManagingOrganizationId: 'org-primary',
                    ownerships: [{ organizationId: 'org-active' }],
                },
                'org-active',
            ),
        ).toBe(true);

        expect(
            businessBelongsToOrganization(
                {
                    ownerships: [{ organizationId: 'org-active' }],
                },
                'org-other',
            ),
        ).toBe(false);
    });

    it('clamps ownership history limit to the supported range', () => {
        expect(clampOwnershipHistoryLimit(0)).toBe(1);
        expect(clampOwnershipHistoryLimit(42)).toBe(42);
        expect(clampOwnershipHistoryLimit(999)).toBe(100);
    });

    it('rejects missing businesses when loading ownership history', () => {
        expect(() => assertExistingOwnershipHistoryBusiness(null)).toThrow(NotFoundException);
    });

    it('rejects admin mark-claimed requests for missing, deleted or conflicting ownerships', () => {
        expect(() => assertAdminClaimableBusiness(null, 'org-1')).toThrow(NotFoundException);
        expect(() => assertAdminClaimableBusiness({
            deletedAt: new Date(),
            ownerships: [],
        }, 'org-1')).toThrow(NotFoundException);
        expect(() => assertAdminClaimableBusiness({
            deletedAt: null,
            ownerships: [{ organizationId: 'org-2' }],
        }, 'org-1')).toThrow(ConflictException);
    });

    it('returns the current active ownership when admin mark-claimed stays in the same organization', () => {
        const business = {
            deletedAt: null,
            ownerships: [{ organizationId: 'org-1' }],
        };

        expect(assertAdminClaimableBusiness(business, 'org-1')).toEqual({
            business,
            activeOwnership: { organizationId: 'org-1' },
        });
    });

    it('rejects missing or inactive ownership rows before revocation', () => {
        expect(() => assertRevocableBusinessOwnership(null)).toThrow(NotFoundException);
        expect(() => assertRevocableBusinessOwnership({
            id: 'ownership-1',
            isActive: false,
        })).toThrow(BadRequestException);
    });

    it('builds claimed business update data when another active ownership remains', () => {
        const reviewedAt = new Date('2026-04-22T15:10:00.000Z');

        expect(
            buildOwnershipRevocationBusinessUpdateData({
                nextActiveOrganizationId: 'org-next',
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            organizationId: 'org-next',
            primaryManagingOrganizationId: 'org-next',
            claimStatus: 'CLAIMED',
            isClaimable: true,
            legacyOwnerMode: false,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });
    });

    it('builds claimed business update data for admin mark-claimed flow', () => {
        const reviewedAt = new Date('2026-04-22T16:40:00.000Z');

        expect(
            buildAdminMarkClaimedBusinessUpdateData({
                organizationId: 'org-1',
                ownerUserId: 'user-1',
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            ownerId: 'user-1',
            organizationId: 'org-1',
            primaryManagingOrganizationId: 'org-1',
            claimStatus: 'CLAIMED',
            claimedAt: reviewedAt,
            claimedByUserId: 'user-1',
            isClaimable: true,
            legacyOwnerMode: false,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });
    });

    it('builds suspended business update data when no active ownership remains', () => {
        const reviewedAt = new Date('2026-04-22T15:10:00.000Z');

        expect(
            buildOwnershipRevocationBusinessUpdateData({
                nextActiveOrganizationId: null,
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            organizationId: null,
            primaryManagingOrganizationId: null,
            ownerId: null,
            claimStatus: 'SUSPENDED',
            claimedByUserId: null,
            claimedAt: null,
            isClaimable: false,
            legacyOwnerMode: false,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });
    });
});
