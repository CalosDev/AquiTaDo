const VISITOR_ID_KEY = 'analyticsVisitorId';
const SESSION_ID_KEY = 'analyticsSessionId';
const SESSION_CREATED_AT_KEY = 'analyticsSessionCreatedAt';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function randomHex(bytes: number): string {
    const buffer = new Uint8Array(bytes);
    window.crypto.getRandomValues(buffer);
    return Array.from(buffer)
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
}

function randomUuid(): string {
    if (typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }

    return `${randomHex(4)}-${randomHex(2)}-${randomHex(2)}-${randomHex(2)}-${randomHex(6)}`;
}

export function getOrCreateVisitorId(): string {
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing) {
        return existing;
    }

    const generated = randomUuid();
    localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
}

export function getOrCreateSessionId(): string {
    const existingSessionId = sessionStorage.getItem(SESSION_ID_KEY);
    const existingCreatedAt = Number(sessionStorage.getItem(SESSION_CREATED_AT_KEY));
    const now = Date.now();

    if (
        existingSessionId
        && Number.isFinite(existingCreatedAt)
        && now - existingCreatedAt <= SESSION_TTL_MS
    ) {
        return existingSessionId;
    }

    const generated = randomUuid();
    sessionStorage.setItem(SESSION_ID_KEY, generated);
    sessionStorage.setItem(SESSION_CREATED_AT_KEY, String(now));
    return generated;
}

export function generateTraceparent(): string {
    const traceId = randomHex(16);
    const spanId = randomHex(8);
    return `00-${traceId}-${spanId}-01`;
}
