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

    const register = () => {
        void navigator.serviceWorker.register('/service-worker.js');
    };

    if (document.readyState === 'complete') {
        register();
        return;
    }

    window.addEventListener('load', register, { once: true });
}
