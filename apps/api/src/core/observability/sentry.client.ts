type SentryClient = {
    init(options: Record<string, unknown>): void;
    captureException(
        exception: unknown,
        context?: Record<string, unknown>,
    ): string | undefined;
};

let sentryClient: SentryClient | null | undefined;

/**
 * Lazily resolves Sentry client. Returns null when package is not installed.
 */
export function getSentryClient(): SentryClient | null {
    if (sentryClient !== undefined) {
        return sentryClient;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const loaded = require('@sentry/node') as SentryClient;
        sentryClient = loaded;
    } catch {
        sentryClient = null;
    }

    return sentryClient;
}

