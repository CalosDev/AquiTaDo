import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
    assertApprovableClaimReview,
    assertReviewableBusinessClaimRequest,
    buildApprovedClaimBusinessUpdateData,
    buildRejectedClaimBusinessUpdateData,
    buildUnderReviewClaimBusinessUpdateData,
} from './business-claim-review.helpers';

describe('business claim review helpers', () => {
    it('rejects missing or already reviewed claim requests', () => {
        expect(() => assertReviewableBusinessClaimRequest(null)).toThrow(NotFoundException);
        expect(() => assertReviewableBusinessClaimRequest({
            status: 'APPROVED',
        })).toThrow(BadRequestException);
    });

    it('rejects approval when the business already has an active ownership', () => {
        expect(() => assertApprovableClaimReview({
            id: 'ownership-1',
            organizationId: 'org-1',
        })).toThrow(ConflictException);
    });

    it('builds business update data for under review state', () => {
        const reviewedAt = new Date('2026-04-22T17:00:00.000Z');

        expect(
            buildUnderReviewClaimBusinessUpdateData({
                activeOwnershipOrganizationId: null,
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            claimStatus: 'PENDING_CLAIM',
            primaryManagingOrganizationId: null,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });

        expect(
            buildUnderReviewClaimBusinessUpdateData({
                activeOwnershipOrganizationId: 'org-1',
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            claimStatus: 'CLAIMED',
            primaryManagingOrganizationId: 'org-1',
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });
    });

    it('builds business update data for approved claim requests', () => {
        const reviewedAt = new Date('2026-04-22T17:00:00.000Z');

        expect(
            buildApprovedClaimBusinessUpdateData({
                requesterUserId: 'user-1',
                effectiveOrganizationId: 'org-1',
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
            legacyOwnerMode: false,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });
    });

    it('builds business update data for rejected claim requests', () => {
        const reviewedAt = new Date('2026-04-22T17:00:00.000Z');

        expect(
            buildRejectedClaimBusinessUpdateData({
                remainingActiveClaims: 2,
                activeOwnershipOrganizationId: null,
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            claimStatus: 'PENDING_CLAIM',
            primaryManagingOrganizationId: null,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });

        expect(
            buildRejectedClaimBusinessUpdateData({
                remainingActiveClaims: 0,
                activeOwnershipOrganizationId: 'org-1',
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            claimStatus: 'CLAIMED',
            primaryManagingOrganizationId: 'org-1',
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });

        expect(
            buildRejectedClaimBusinessUpdateData({
                remainingActiveClaims: 0,
                activeOwnershipOrganizationId: null,
                reviewedAt,
                adminUserId: 'admin-1',
            }),
        ).toEqual({
            claimStatus: 'UNCLAIMED',
            primaryManagingOrganizationId: null,
            updatedByUserId: 'admin-1',
            lastReviewedAt: reviewedAt,
        });
    });
});
