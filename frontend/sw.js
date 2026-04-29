const CACHE_NAME = 'esctrix-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/webrtc.js',
    '/static/logo.png',
    '/static/icon-192.png',
    '/static/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('SW: Pre-caching assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Clearing old cache', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests from our origin
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
    
    // Ignore API calls and socket connections
    if (event.request.url.includes('/api/') || event.request.url.includes('/ws/')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((response) => {
                // Don't cache non-successful responses or non-static/page requests
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                // Dynamically cache other assets
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                // Fallback for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('/');
                }
            });
        })
    );
});

