import { describe, expect, it } from 'vitest';
import { buildHeroGallery, findPreferredGalleryIndex } from './helpers';
import type { BusinessImageEntry } from './types';

function makeImage(id: string, overrides: Partial<BusinessImageEntry> = {}): BusinessImageEntry {
    return {
        id,
        url: `/uploads/businesses/${id}.jpg`,
        ...overrides,
    };
}

describe('business detail gallery helpers', () => {
    it('prefers the cover image when choosing the initial hero index', () => {
        const images = [
            makeImage('one'),
            makeImage('two', { isCover: true }),
            makeImage('three'),
        ];

        expect(findPreferredGalleryIndex(images)).toBe(1);
    });

    it('falls back to the first image when there is no explicit cover', () => {
        const images = [makeImage('one'), makeImage('two')];

        expect(findPreferredGalleryIndex(images)).toBe(0);
    });

    it('builds preview tiles without repeating the active hero image', () => {
        const images = [
            makeImage('one'),
            makeImage('two'),
            makeImage('three'),
            makeImage('four'),
            makeImage('five'),
        ];

        const gallery = buildHeroGallery(images, 2, 3);

        expect(gallery.lead?.image.id).toBe('three');
        expect(gallery.previews.map((entry) => entry.image.id)).toEqual(['one', 'two', 'four']);
        expect(gallery.remainingCount).toBe(1);
    });
});
