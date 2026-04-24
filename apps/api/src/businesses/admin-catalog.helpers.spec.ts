import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
    assertActiveAdminCatalogBusiness,
    buildAdminPublicationUpdateData,
} from './admin-catalog.helpers';

describe('admin-catalog helpers', () => {
    it('rejects deleted or missing catalog businesses', () => {
        expect(() => assertActiveAdminCatalogBusiness(null)).toThrow(NotFoundException);
        expect(() => assertActiveAdminCatalogBusiness({
            id: 'business-1',
            deletedAt: new Date('2026-01-01T00:00:00.000Z'),
        })).toThrowError('Negocio no encontrado');
    });

    it('returns active catalog businesses unchanged', () => {
        const business = {
            id: 'business-1',
            deletedAt: null,
            firstPublishedAt: null,
        };

        expect(assertActiveAdminCatalogBusiness(business)).toBe(business);
    });

    it('builds publish mutation data preserving the first publication timestamp', () => {
        const reviewedAt = new Date('2026-04-22T12:00:00.000Z');

        const updateData = buildAdminPublicationUpdateData({
            shouldPublish: true,
            reviewedAt,
            firstPublishedAt: null,
            adminUserId: 'admin-1',
        });

        expect(updateData).toMatchObject({
            publicStatus: 'PUBLISHED',
            lifecycleStatus: 'PUBLISHED',
            isPublished: true,
            isSearchable: true,
            isDiscoverable: true,
            publishedAt: reviewedAt,
            firstPublishedAt: reviewedAt,
            lastReviewedAt: reviewedAt,
            updatedByUser: {
                connect: {
                    id: 'admin-1',
                },
            },
        });
    });

    it('builds unpublish mutation data without resetting firstPublishedAt', () => {
        const reviewedAt = new Date('2026-04-22T12:00:00.000Z');
        const firstPublishedAt = new Date('2026-04-01T10:00:00.000Z');

        const updateData = buildAdminPublicationUpdateData({
            shouldPublish: false,
            reviewedAt,
            firstPublishedAt,
            adminUserId: 'admin-1',
        });

        expect(updateData).toMatchObject({
            publicStatus: 'ARCHIVED',
            lifecycleStatus: 'ARCHIVED',
            isPublished: false,
            isSearchable: false,
            isDiscoverable: false,
            publishedAt: null,
            lastReviewedAt: reviewedAt,
            updatedByUser: {
                connect: {
                    id: 'admin-1',
                },
            },
        });
        expect(updateData).not.toHaveProperty('firstPublishedAt');
    });
});
