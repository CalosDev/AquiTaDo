const INTERNAL_CATEGORY_PREFIX_RE = /^([A-Z]{2})\s+(.+)$/;
const INTERNAL_CATEGORY_ICON_RE = /^[A-Z0-9]{1,4}$/;

function normalizeWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
}

export function formatPublicCategoryName(value?: string | null): string {
    if (!value) {
        return '';
    }

    const normalized = normalizeWhitespace(value);
    const match = normalized.match(INTERNAL_CATEGORY_PREFIX_RE);
    if (!match) {
        return normalized;
    }

    const [, prefix, rest] = match;
    if (!prefix || !rest) {
        return normalized;
    }

    return normalizeWhitespace(rest);
}

export function formatPublicCategoryIcon(value?: string | null): string {
    if (!value) {
        return '';
    }

    const normalized = normalizeWhitespace(value);
    if (INTERNAL_CATEGORY_ICON_RE.test(normalized)) {
        return '';
    }

    return normalized;
}

export function formatPublicCategoryPath(parentName?: string | null, categoryName?: string | null): string {
    const parts = [
        formatPublicCategoryName(parentName),
        formatPublicCategoryName(categoryName),
    ].filter(Boolean);

    return parts.join(' / ');
}
