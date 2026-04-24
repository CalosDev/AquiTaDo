import { describe, expect, it } from 'vitest';
import {
    DUPLICATE_CASE_LIST_SELECT,
    buildDuplicateCaseSummary,
    clampDuplicateCaseLimit,
} from './business-duplicate.helpers';

describe('business duplicate helpers', () => {
    it('clamps duplicate case listing limits to the supported range', () => {
        expect(clampDuplicateCaseLimit()).toBe(25);
        expect(clampDuplicateCaseLimit(0)).toBe(1);
        expect(clampDuplicateCaseLimit(250)).toBe(100);
        expect(clampDuplicateCaseLimit(40)).toBe(40);
    });

    it('builds duplicate case summary maps from grouped rows', () => {
        expect(buildDuplicateCaseSummary([
            {
                status: 'MERGED',
                _count: { _all: 2 },
            },
            {
                status: 'CONFLICT',
                _count: { _all: 1 },
            },
        ])).toEqual({
            MERGED: 2,
            CONFLICT: 1,
        });
    });

    it('exposes the expected select shape for duplicate case listing', () => {
        expect(DUPLICATE_CASE_LIST_SELECT).toMatchObject({
            id: true,
            clusterKey: true,
            status: true,
            businessIds: true,
            reasons: true,
            primaryBusinessId: true,
            resolutionNotes: true,
            resolutionMeta: true,
            resolvedAt: true,
            createdAt: true,
            updatedAt: true,
        });
    });
});
