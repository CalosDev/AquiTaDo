import { SetMetadata } from '@nestjs/common';

export type PublicCacheOptions = {
    maxAgeSeconds: number;
    staleWhileRevalidateSeconds: number;
    privateWhenAuthenticated?: boolean;
};

export const PUBLIC_CACHE_METADATA_KEY = 'public_cache_options';

export const PublicCache = (options: PublicCacheOptions) =>
    SetMetadata(PUBLIC_CACHE_METADATA_KEY, options);
