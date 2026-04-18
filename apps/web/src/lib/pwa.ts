let waitingWorker: ServiceWorker | null = null;
let hasTriggeredReload = false;

function emitUpdateAvailable(): void {
    window.dispatchEvent(new CustomEvent('pwa:update-available'));
}

function bindWaitingWorker(worker: ServiceWorker | null | undefined): void {
    waitingWorker = worker ?? null;
    if (waitingWorker) {
        emitUpdateAvailable();
    }
}

export function applyPwaUpdate(): boolean {
    if (!waitingWorker) {
        return false;
    }

    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return true;
}

/**
 * Registers a basic service worker for offline support and static asset caching.
 */
export function registerPwaServiceWorker(): void {
    if (typeof window === 'undefined') {
        return;
    }

    if (!('serviceWorker' in navigator)) {
        return;
    }

    const register = async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            bindWaitingWorker(registration.waiting);

            registration.addEventListener('updatefound', () => {
                const installingWorker = registration.installing;
                if (!installingWorker) {
                    return;
                }

                installingWorker.addEventListener('statechange', () => {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        bindWaitingWorker(registration.waiting ?? installingWorker);
                    }
                });
            });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (hasTriggeredReload) {
                    return;
                }

                hasTriggeredReload = true;
                window.location.reload();
            });
        } catch {
            // Service worker registration should not block the app bootstrap.
        }
    };

    if (document.readyState === 'complete') {
        register();
        return;
    }

    window.addEventListener('load', register, { once: true });
}
