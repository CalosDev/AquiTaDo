export type SeoMetaInput = {
    title: string;
    description: string;
    canonicalPath?: string;
    imageUrl?: string;
    ogType?: 'website' | 'article';
    noindex?: boolean;
};

const DEFAULT_OG_IMAGE = '/vite.svg';

function upsertMetaByName(name: string, content: string): void {
    let element = document.querySelector(`meta[name="${name}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute('name', name);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

function upsertMetaByProperty(property: string, content: string): void {
    let element = document.querySelector(`meta[property="${property}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute('property', property);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}

function upsertCanonical(href: string): void {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', href);
}

function resolveBaseUrl(): string {
    const configured = (import.meta.env.VITE_PUBLIC_WEB_URL || '').trim();
    if (configured.length > 0) {
        return configured.replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined') {
        return window.location.origin.replace(/\/+$/, '');
    }

    return 'http://localhost:5173';
}

function joinUrl(baseUrl: string, pathOrUrl: string): string {
    try {
        return new URL(pathOrUrl, `${baseUrl}/`).toString();
    } catch {
        return `${baseUrl}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
    }
}

export function applySeoMeta(input: SeoMetaInput): void {
    const baseUrl = resolveBaseUrl();
    const canonicalPath = input.canonicalPath || (typeof window !== 'undefined' ? window.location.pathname : '/');
    const canonicalUrl = joinUrl(baseUrl, canonicalPath);
    const imageUrl = joinUrl(baseUrl, input.imageUrl || DEFAULT_OG_IMAGE);
    const robotsValue = input.noindex ? 'noindex, nofollow' : 'index, follow';

    document.title = input.title;
    upsertCanonical(canonicalUrl);
    upsertMetaByName('description', input.description);
    upsertMetaByName('robots', robotsValue);
    upsertMetaByProperty('og:title', input.title);
    upsertMetaByProperty('og:description', input.description);
    upsertMetaByProperty('og:type', input.ogType || 'website');
    upsertMetaByProperty('og:url', canonicalUrl);
    upsertMetaByProperty('og:image', imageUrl);
    upsertMetaByName('twitter:card', 'summary_large_image');
    upsertMetaByName('twitter:title', input.title);
    upsertMetaByName('twitter:description', input.description);
    upsertMetaByName('twitter:image', imageUrl);
}
