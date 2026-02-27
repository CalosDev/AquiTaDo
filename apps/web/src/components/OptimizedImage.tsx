import { ImgHTMLAttributes } from 'react';

type OptimizedImageProps = ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
};

const UPLOAD_IMAGE_REGEX = /^(\/uploads\/businesses\/.+)\.(jpe?g|png|webp)$/i;

export function OptimizedImage({ src, alt, ...rest }: OptimizedImageProps) {
    const match = src.match(UPLOAD_IMAGE_REGEX);
    if (!match) {
        return <img src={src} alt={alt} {...rest} />;
    }

    const basePath = match[1];
    return (
        <picture>
            <source srcSet={`${basePath}.avif`} type="image/avif" />
            <source srcSet={`${basePath}.webp`} type="image/webp" />
            <img src={src} alt={alt} {...rest} />
        </picture>
    );
}
