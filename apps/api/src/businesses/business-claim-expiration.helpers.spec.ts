import { describe, expect, it } from 'vitest';
import { buildExpiredClaimBusinessUpdateData } from './business-claim-expiration.helpers';

describe('business claim expiration helpers', () => {
    it('builds business update data for expired claims with active ownership', () => {
        const referenceDate = new Date('2026-04-22T18:00:00.000Z');

        expect(buildExpiredClaimBusinessUpdateData({
            activeOwnershipOrganizationId: 'org-1',
            remainingActiveClaims: 0,
            referenceDate,
        })).toEqual({
            claimStatus: 'CLAIMED',
            primaryManagingOrganizationId: 'org-1',
            lastReviewedAt: referenceDate,
        });
    });

    it('builds business update data for expired claims with other pending requests', () => {
        const referenceDate = new Date('2026-04-22T18:00:00.000Z');

        expect(buildExpiredClaimBusinessUpdateData({
            activeOwnershipOrganizationId: null,
            remainingActiveClaims: 2,
            referenceDate,
        })).toEqual({
            claimStatus: 'PENDING_CLAIM',
            primaryManagingOrganizationId: null,
            lastReviewedAt: referenceDate,
        });
    });

    it('builds business update data for expired claims with no ownership and no pending requests', () => {
        const referenceDate = new Date('2026-04-22T18:00:00.000Z');

        expect(buildExpiredClaimBusinessUpdateData({
            activeOwnershipOrganizationId: null,
            remainingActiveClaims: 0,
            referenceDate,
        })).toEqual({
            claimStatus: 'UNCLAIMED',
            primaryManagingOrganizationId: null,
            lastReviewedAt: referenceDate,
        });
    });
});
