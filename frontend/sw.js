const CACHE_NAME = 'esctrix-v8';
const OFFLINE_URL = '/offline.html';
const ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/webrtc.js',
    '/static/logo.png',
    '/static/icon-192.png',
    '/static/icon-512.png'
];

// ── Install: pre-cache all core assets ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        )
    );
    self.clients.claim();
});

// ── Fetch: Network-first with offline fallback ──
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;
    if (event.request.url.includes('/api/') || event.request.url.includes('/ws/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses dynamically
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() =>
                caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // For navigation requests, return the offline page
                    if (event.request.mode === 'navigate') {
                        return caches.match(OFFLINE_URL);
                    }
                })
            )
    );
});

// ── Push Notifications ──
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'ESCTRIX';
    const options = {
        body: data.body || 'You have a new message.',
        icon: '/static/icon-192.png',
        badge: '/static/icon-192.png',
        data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification Click ──
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            if (clientList.length > 0) return clientList[0].focus();
            return clients.openWindow(event.notification.data.url || '/');
        })
    );
});

// ── Background Sync ──
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-offline-messages') {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => client.postMessage({ type: 'sync-messages' }));
            })
        );
    }
});

// ── Periodic Background Sync ──
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'esctrix-periodic-sync') {
        event.waitUntil(
            self.clients.matchAll().then((clients) => {
                clients.forEach((client) => client.postMessage({ type: 'periodic-sync' }));
            })
        );
    }
});
