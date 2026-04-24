import { Prisma } from '../generated/prisma/client';
import { describe, expect, it } from 'vitest';
import {
    buildMergedDuplicateCaseAuditMetadata,
    buildMergedDuplicateCaseCreateData,
    buildMergedDuplicateCaseResolutionMeta,
    buildMergedDuplicateCaseUpdateData,
    buildNonMergedDuplicateCaseAuditMetadata,
    buildNonMergedDuplicateCaseCreateData,
    buildNonMergedDuplicateCaseUpdateData,
    MERGED_DUPLICATE_CASE_RESOLUTION_SELECT,
    NON_MERGED_DUPLICATE_CASE_RESOLUTION_SELECT,
} from './business-duplicate-resolution.helpers';

describe('business duplicate resolution helpers', () => {
    it('builds update data for non-merged duplicate case resolutions', () => {
        const resolvedAt = new Date('2026-04-23T00:00:00.000Z');

        expect(buildNonMergedDuplicateCaseUpdateData({
            status: 'CONFLICT',
            businessIds: ['business-1', 'business-2'],
            reasons: ['same-address'],
            adminUserId: 'admin-1',
            resolutionNotes: 'Requiere revision manual.',
            resolvedAt,
        })).toEqual({
            status: 'CONFLICT',
            businessIds: ['business-1', 'business-2'],
            reasons: ['same-address'],
            primaryBusinessId: null,
            resolvedByAdminId: 'admin-1',
            resolutionNotes: 'Requiere revision manual.',
            resolutionMeta: Prisma.JsonNull,
            resolvedAt,
        });
    });

    it('builds create data for non-merged duplicate case resolutions and clears empty reasons', () => {
        const resolvedAt = new Date('2026-04-23T00:00:00.000Z');

        expect(buildNonMergedDuplicateCaseCreateData({
            clusterKey: 'business-1:business-2',
            status: 'DISMISSED',
            businessIds: ['business-1', 'business-2'],
            reasons: [],
            adminUserId: 'admin-1',
            resolutionNotes: null,
            resolvedAt,
        })).toEqual({
            clusterKey: 'business-1:business-2',
            status: 'DISMISSED',
            businessIds: ['business-1', 'business-2'],
            reasons: Prisma.JsonNull,
            resolvedByAdminId: 'admin-1',
            resolutionNotes: null,
            resolvedAt,
        });
    });

    it('builds audit metadata for non-merged duplicate case resolutions', () => {
        expect(buildNonMergedDuplicateCaseAuditMetadata({
            status: 'CONFLICT',
            businessIds: ['business-1', 'business-2'],
            reasons: ['same-address'],
        })).toEqual({
            status: 'CONFLICT',
            businessIds: ['business-1', 'business-2'],
            reasons: ['same-address'],
        });
    });

    it('exposes the expected select shape for non-merged duplicate case resolution', () => {
        expect(NON_MERGED_DUPLICATE_CASE_RESOLUTION_SELECT).toMatchObject({
            id: true,
            clusterKey: true,
            status: true,
            businessIds: true,
            reasons: true,
            resolutionNotes: true,
            resolvedAt: true,
        });
    });

    it('builds resolution meta for merged duplicate case resolutions', () => {
        expect(buildMergedDuplicateCaseResolutionMeta({
            primaryBusinessId: 'business-1',
            archivedBusinessIds: ['business-2'],
            transferred: {
                categories: 1,
                features: 2,
                hours: 3,
                images: 4,
                analyticsRows: 5,
                growthEvents: 6,
                checkIns: 7,
                claimRequests: 8,
                reviews: 9,
                favorites: 10,
                listItems: 11,
                notificationJobs: 12,
            },
        })).toEqual({
            mergedIntoBusinessId: 'business-1',
            archivedBusinessIds: ['business-2'],
            transferred: {
                categories: 1,
                features: 2,
                hours: 3,
                images: 4,
                analyticsRows: 5,
                growthEvents: 6,
                checkIns: 7,
                claimRequests: 8,
                reviews: 9,
                favorites: 10,
                listItems: 11,
                notificationJobs: 12,
            },
        });
    });

    it('builds update data for merged duplicate case resolutions', () => {
        const resolvedAt = new Date('2026-04-23T00:00:00.000Z');
        const resolutionMeta = buildMergedDuplicateCaseResolutionMeta({
            primaryBusinessId: 'business-1',
            archivedBusinessIds: ['business-2'],
            transferred: {
                categories: 1,
                features: 0,
                hours: 0,
                images: 0,
                analyticsRows: 0,
                growthEvents: 0,
                checkIns: 0,
                claimRequests: 0,
                reviews: 0,
                favorites: 0,
                listItems: 0,
                notificationJobs: 0,
            },
        });

        expect(buildMergedDuplicateCaseUpdateData({
            businessIds: ['business-1', 'business-2'],
            reasons: ['same-phone'],
            primaryBusinessId: 'business-1',
            adminUserId: 'admin-1',
            resolutionNotes: 'Fusion confirmada.',
            resolutionMeta,
            resolvedAt,
        })).toEqual({
            status: 'MERGED',
            businessIds: ['business-1', 'business-2'],
            reasons: ['same-phone'],
            primaryBusinessId: 'business-1',
            resolvedByAdminId: 'admin-1',
            resolutionNotes: 'Fusion confirmada.',
            resolutionMeta,
            resolvedAt,
        });
    });

    it('builds create data for merged duplicate case resolutions and clears empty reasons', () => {
        const resolvedAt = new Date('2026-04-23T00:00:00.000Z');
        const resolutionMeta = buildMergedDuplicateCaseResolutionMeta({
            primaryBusinessId: 'business-1',
            archivedBusinessIds: ['business-2'],
            transferred: {
                categories: 0,
                features: 0,
                hours: 0,
                images: 0,
                analyticsRows: 0,
                growthEvents: 0,
                checkIns: 0,
                claimRequests: 0,
                reviews: 0,
                favorites: 0,
                listItems: 0,
                notificationJobs: 0,
            },
        });

        expect(buildMergedDuplicateCaseCreateData({
            clusterKey: 'business-1:business-2',
            businessIds: ['business-1', 'business-2'],
            reasons: [],
            primaryBusinessId: 'business-1',
            adminUserId: 'admin-1',
            resolutionNotes: null,
            resolutionMeta,
            resolvedAt,
        })).toEqual({
            clusterKey: 'business-1:business-2',
            status: 'MERGED',
            businessIds: ['business-1', 'business-2'],
            reasons: Prisma.JsonNull,
            primaryBusinessId: 'business-1',
            resolvedByAdminId: 'admin-1',
            resolutionNotes: null,
            resolutionMeta,
            resolvedAt,
        });
    });

    it('builds audit metadata for merged duplicate case resolutions', () => {
        expect(buildMergedDuplicateCaseAuditMetadata({
            clusterKey: 'business-1:business-2',
            primaryBusinessId: 'business-1',
            archivedBusinessIds: ['business-2'],
            transferred: {
                categories: 1,
                features: 2,
                hours: 3,
                images: 4,
                analyticsRows: 5,
                growthEvents: 6,
                checkIns: 7,
                claimRequests: 8,
                reviews: 9,
                favorites: 10,
                listItems: 11,
                notificationJobs: 12,
            },
        })).toEqual({
            status: 'MERGED',
            clusterKey: 'business-1:business-2',
            primaryBusinessId: 'business-1',
            archivedBusinessIds: ['business-2'],
            transferred: {
                categories: 1,
                features: 2,
                hours: 3,
                images: 4,
                analyticsRows: 5,
                growthEvents: 6,
                checkIns: 7,
                claimRequests: 8,
                reviews: 9,
                favorites: 10,
                listItems: 11,
                notificationJobs: 12,
            },
        });
    });

    it('exposes the expected select shape for merged duplicate case resolution', () => {
        expect(MERGED_DUPLICATE_CASE_RESOLUTION_SELECT).toMatchObject({
            id: true,
            clusterKey: true,
            status: true,
            businessIds: true,
            reasons: true,
            primaryBusinessId: true,
            resolutionNotes: true,
            resolutionMeta: true,
            resolvedAt: true,
        });
    });
});
