/* eslint-disable no-undef */
const CACHE_VERSION = 'aquita-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.webmanifest',
    '/vite.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)),
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== APP_SHELL_CACHE && name !== RUNTIME_CACHE)
                    .map((name) => caches.delete(name)),
            )),
    );
    self.clients.claim();
});

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);
    const sameOrigin = isSameOrigin(url);
    const isApi = sameOrigin && url.pathname.startsWith('/api/');

    if (isApi) {
        return;
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const cloned = response.clone();
                    void caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, cloned));
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) {
                        return cached;
                    }
                    const shell = await caches.match('/index.html');
                    if (shell) {
                        return shell;
                    }
                    return caches.match('/offline.html');
                }),
        );
        return;
    }

    if (!sameOrigin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const networkFetch = fetch(event.request)
                .then((response) => {
                    const cloned = response.clone();
                    void caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, cloned));
                    return response;
                })
                .catch(() => cached);

            return cached || networkFetch;
        }),
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
