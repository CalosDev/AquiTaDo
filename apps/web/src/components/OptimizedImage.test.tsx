import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OptimizedImage } from './OptimizedImage';

describe('OptimizedImage', () => {
    it('resolves upload paths to API origin', () => {
        render(
            <OptimizedImage
                src="/uploads/businesses/demo-image.jpg"
                alt="Business image"
                data-testid="business-image-success"
            />,
        );

        const image = screen.getByTestId('business-image-success');
        const imageSrc = image.getAttribute('src') || '';

        expect(imageSrc).toContain('/uploads/businesses/demo-image.jpg');
        expect(imageSrc).toContain('http://localhost:3000');
    });

    it('uses fallback source when main image fails', async () => {
        render(
            <OptimizedImage
                src="/uploads/businesses/missing-image.jpg"
                alt="Missing business image"
                data-testid="business-image-missing"
            />,
        );

        const image = screen.getByTestId('business-image-missing');
        fireEvent.error(image);

        await waitFor(() => {
            const fallbackSrc = screen.getByTestId('business-image-missing').getAttribute('src') || '';
            expect(fallbackSrc).toContain('/business-image-fallback.svg');
        });
    });
});
