import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
    assertApprovableBusinessSuggestion,
    assertReviewableBusinessSuggestion,
    buildApprovedBusinessSuggestionCatalogBusinessInput,
    buildReviewedBusinessSuggestionAuditMetadata,
    buildBusinessSuggestionSummary,
    buildReviewedBusinessSuggestionUpdateData,
    clampBusinessSuggestionLimit,
} from './business-suggestion.helpers';

describe('business suggestion helpers', () => {
    it('clamps business suggestion listing limits to the supported range', () => {
        expect(clampBusinessSuggestionLimit()).toBe(25);
        expect(clampBusinessSuggestionLimit(0)).toBe(1);
        expect(clampBusinessSuggestionLimit(250)).toBe(100);
        expect(clampBusinessSuggestionLimit(40)).toBe(40);
    });

    it('builds business suggestion summary maps from grouped rows', () => {
        expect(buildBusinessSuggestionSummary([
            {
                status: 'PENDING',
                _count: { _all: 2 },
            },
            {
                status: 'APPROVED',
                _count: { _all: 1 },
            },
        ])).toEqual({
            PENDING: 2,
            APPROVED: 1,
        });
    });

    it('rejects missing or already reviewed business suggestions', () => {
        expect(() => assertReviewableBusinessSuggestion(null)).toThrow(NotFoundException);
        expect(() => assertReviewableBusinessSuggestion({
            status: 'APPROVED',
        })).toThrow(BadRequestException);
    });

    it('rejects approved reviews when the suggestion lacks public record data', () => {
        expect(() => assertApprovableBusinessSuggestion({
            address: null,
            provinceId: 'province-1',
        })).toThrow(BadRequestException);

        expect(() => assertApprovableBusinessSuggestion({
            address: 'Calle 123',
            provinceId: null,
        })).toThrow(BadRequestException);
    });

    it('builds approved review update data', () => {
        const reviewedAt = new Date('2026-04-23T00:00:00.000Z');

        expect(buildReviewedBusinessSuggestionUpdateData({
            status: 'APPROVED',
            reviewNotes: 'Aprobada por el equipo',
            existingNotes: 'Nota original',
            adminUserId: 'admin-1',
            reviewedAt,
            createdBusinessId: 'business-1',
        })).toEqual({
            status: 'APPROVED',
            notes: 'Aprobada por el equipo',
            reviewedByAdminId: 'admin-1',
            reviewedAt,
            createdBusinessId: 'business-1',
        });
    });

    it('builds rejected review update data preserving previous notes when no new note is provided', () => {
        const reviewedAt = new Date('2026-04-23T00:00:00.000Z');

        expect(buildReviewedBusinessSuggestionUpdateData({
            status: 'REJECTED',
            reviewNotes: null,
            existingNotes: 'Nota previa',
            adminUserId: 'admin-1',
            reviewedAt,
        })).toEqual({
            status: 'REJECTED',
            notes: 'Nota previa',
            reviewedByAdminId: 'admin-1',
            reviewedAt,
        });
    });

    it('builds audit metadata for reviewed business suggestions', () => {
        expect(buildReviewedBusinessSuggestionAuditMetadata({
            status: 'APPROVED',
            createdBusinessId: 'business-1',
        })).toEqual({
            status: 'APPROVED',
            createdBusinessId: 'business-1',
        });

        expect(buildReviewedBusinessSuggestionAuditMetadata({
            status: 'REJECTED',
        })).toEqual({
            status: 'REJECTED',
        });
    });

    it('builds the catalog business payload for approved business suggestions', () => {
        expect(buildApprovedBusinessSuggestionCatalogBusinessInput({
            suggestion: {
                name: 'Sugerido SRL',
                description: null,
                notes: 'Descripcion sugerida',
                address: 'Calle 123',
                provinceId: 'province-1',
                cityId: null,
                phone: null,
                whatsapp: '8095550000',
                website: 'https://suggested.example.com',
                email: 'owner@example.com',
                categoryId: 'category-1',
            },
            publicStatus: undefined,
            ignorePotentialDuplicates: true,
        })).toEqual({
            name: 'Sugerido SRL',
            description: 'Descripcion sugerida',
            address: 'Calle 123',
            provinceId: 'province-1',
            cityId: null,
            phone: undefined,
            whatsapp: '8095550000',
            website: 'https://suggested.example.com',
            email: 'owner@example.com',
            categoryIds: ['category-1'],
            publicStatus: 'PUBLISHED',
            catalogManagedByAdmin: true,
            isClaimable: true,
            ignorePotentialDuplicates: true,
            source: 'USER_SUGGESTION',
        });
    });
});
