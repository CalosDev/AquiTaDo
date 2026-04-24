import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
    assertClaimRequestableBusiness,
    assertNoActiveClaimRequestConflict,
    assertNoActiveOwnershipClaimConflict,
    buildClaimRequestSubmittedGrowthMetadata,
    buildCreatedClaimRequestCreateData,
    buildCreatedClaimRequestAuditMetadata,
    buildCreatedClaimBusinessUpdateData,
} from './business-claim-creation.helpers';

describe('business claim creation helpers', () => {
    it('rejects missing or deleted businesses for claim requests', () => {
        expect(() => assertClaimRequestableBusiness(null)).toThrow(NotFoundException);
        expect(() => assertClaimRequestableBusiness({
            deletedAt: new Date(),
            isClaimable: true,
            claimStatus: 'UNCLAIMED',
        })).toThrow(NotFoundException);
    });

    it('rejects non-claimable businesses', () => {
        expect(() => assertClaimRequestableBusiness({
            deletedAt: null,
            isClaimable: false,
            claimStatus: 'UNCLAIMED',
        })).toThrow(BadRequestException);
    });

    it('rejects already claimed businesses', () => {
        expect(() => assertClaimRequestableBusiness({
            deletedAt: null,
            isClaimable: true,
            claimStatus: 'CLAIMED',
        })).toThrow(BadRequestException);
    });

    it('rejects businesses with active ownership already assigned', () => {
        expect(() => assertNoActiveOwnershipClaimConflict({ id: 'ownership-1' })).toThrow(ConflictException);
    });

    it('rejects businesses with another active claim request pending', () => {
        expect(() => assertNoActiveClaimRequestConflict({ id: 'claim-1' })).toThrow(ConflictException);
    });

    it('builds business update data for newly created claim requests', () => {
        expect(buildCreatedClaimBusinessUpdateData({
            requesterUserId: 'user-1',
        })).toEqual({
            claimStatus: 'PENDING_CLAIM',
            updatedByUserId: 'user-1',
        });
    });

    it('builds audit metadata for created claim requests', () => {
        expect(buildCreatedClaimRequestAuditMetadata({
            businessId: 'business-1',
            businessSlug: 'sample-business',
            evidenceType: 'BUSINESS_EMAIL',
        })).toEqual({
            businessId: 'business-1',
            businessSlug: 'sample-business',
            evidenceType: 'BUSINESS_EMAIL',
        });
    });

    it('builds growth metadata for submitted claim requests', () => {
        expect(buildClaimRequestSubmittedGrowthMetadata({
            claimRequestId: 'claim-1',
            evidenceType: 'BUSINESS_PHONE',
        })).toEqual({
            claimRequestId: 'claim-1',
            evidenceType: 'BUSINESS_PHONE',
        });
    });

    it('builds create data for new claim requests', () => {
        expect(buildCreatedClaimRequestCreateData({
            businessId: 'business-1',
            requesterUserId: 'user-1',
            requesterOrganizationId: null,
            evidenceType: 'BUSINESS_EMAIL',
            evidenceValue: 'owner@example.com',
            notes: 'Soy el propietario',
        })).toEqual({
            businessId: 'business-1',
            requesterUserId: 'user-1',
            requesterOrganizationId: null,
            evidenceType: 'BUSINESS_EMAIL',
            evidenceValue: 'owner@example.com',
            notes: 'Soy el propietario',
        });
    });
});
