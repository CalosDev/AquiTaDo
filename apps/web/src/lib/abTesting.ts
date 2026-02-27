import { getOrCreateVisitorId } from './clientContext';

function hashString(input: string): number {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

export function getOrAssignExperimentVariant(
    experimentKey: string,
    variants: string[],
    subjectKey: string,
): string {
    const normalizedVariants = variants.filter((entry) => entry.trim().length > 0);
    if (normalizedVariants.length === 0) {
        return 'control';
    }

    const storageKey = `ab:${experimentKey}:${subjectKey}`;
    const existing = localStorage.getItem(storageKey);
    if (existing && normalizedVariants.includes(existing)) {
        return existing;
    }

    const visitorId = getOrCreateVisitorId();
    const selectedIndex = hashString(`${visitorId}:${experimentKey}:${subjectKey}`) % normalizedVariants.length;
    const variant = normalizedVariants[selectedIndex]!;
    localStorage.setItem(storageKey, variant);
    return variant;
}
