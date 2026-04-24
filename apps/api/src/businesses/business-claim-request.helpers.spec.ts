import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
    assertExistingAdminClaimRequest,
    buildClaimRequestSummary,
    clampClaimRequestLimit,
    hydrateClaimRequestSnapshot,
} from './business-claim-request.helpers';

describe('business claim request helpers', () => {
    it('clamps claim request list limits safely', () => {
        expect(clampClaimRequestLimit(undefined)).toBe(25);
        expect(clampClaimRequestLimit(0)).toBe(1);
        expect(clampClaimRequestLimit(101)).toBe(100);
        expect(clampClaimRequestLimit(40)).toBe(40);
    });

    it('builds claim request summaries from grouped counts', () => {
        expect(buildClaimRequestSummary([
            {
                status: 'PENDING',
                _count: { _all: 3 },
            },
            {
                status: 'APPROVED',
                _count: { _all: 1 },
            },
        ])).toEqual({
            PENDING: 3,
            APPROVED: 1,
        });
    });

    it('hydrates claim request snapshots with normalized catalog metadata', () => {
        expect(hydrateClaimRequestSnapshot({
            id: 'claim-1',
            evidenceType: 'BUSINESS_PHONE',
            business: {
                source: null,
                catalogSource: 'import',
                lifecycleStatus: null,
                primaryManagingOrganizationId: undefined,
            },
        })).toEqual({
            id: 'claim-1',
            evidenceType: 'PHONE',
            business: {
                source: 'SYSTEM',
                catalogSource: 'SYSTEM',
                lifecycleStatus: 'PUBLISHED',
                primaryManagingOrganizationId: null,
            },
        });
    });

    it('rejects missing admin claim request detail lookups', () => {
        expect(() => assertExistingAdminClaimRequest(null)).toThrow(NotFoundException);
    });
});
