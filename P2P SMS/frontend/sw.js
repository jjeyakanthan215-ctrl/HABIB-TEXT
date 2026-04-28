const CACHE_NAME = 'habib-text-v1';
const ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/app.js',
    '/static/js/webrtc.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (event) => {
    // Only cache GET requests to our origin
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
    
    // Ignore API calls for caching
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => caches.match('/'));
        })
    );
});
