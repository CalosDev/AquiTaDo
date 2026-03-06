import { ImgHTMLAttributes } from 'react';

type OptimizedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
};

const UPLOAD_IMAGE_REGEX = /^(.*\/uploads\/businesses\/.+)\.(jpe?g|png|webp)(\?.*)?$/i;

function resolveApiOrigin(rawApiUrl: string | undefined): string {
    const fallbackOrigin = typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000';

    const rawValue = (rawApiUrl || '').trim();
    if (!rawValue) {
        return 'http://localhost:3000';
    }

    try {
        const parsed = new URL(rawValue, fallbackOrigin);
        const normalizedPath = parsed.pathname.replace(/\/+$/, '');
        if (normalizedPath.endsWith('/api')) {
            parsed.pathname = normalizedPath.slice(0, -4) || '/';
        } else {
            parsed.pathname = normalizedPath || '/';
        }
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/+$/, '');
    } catch {
        return 'http://localhost:3000';
    }
}

const API_ORIGIN = resolveApiOrigin(import.meta.env.VITE_API_URL);

function resolveAssetUrl(src: string): string {
    const normalized = src.trim();
    if (!normalized) {
        return normalized;
    }

    if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('blob:')) {
        return normalized;
    }

    if (normalized.startsWith('/uploads/')) {
        return `${API_ORIGIN}${normalized}`;
    }

    return normalized;
}

export function OptimizedImage({ src, alt, ...rest }: OptimizedImageProps) {
    const resolvedSrc = resolveAssetUrl(src);
    const match = resolvedSrc.match(UPLOAD_IMAGE_REGEX);
    if (!match) {
        return <img src={resolvedSrc} alt={alt} {...rest} />;
    }

    const basePath = match[1];
    const queryString = match[3] || '';
    return (
        <picture>
            <source srcSet={`${basePath}.avif${queryString}`} type="image/avif" />
            <source srcSet={`${basePath}.webp${queryString}`} type="image/webp" />
            <img src={resolvedSrc} alt={alt} {...rest} />
        </picture>
    );
}
