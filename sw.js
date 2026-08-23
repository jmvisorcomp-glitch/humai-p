// HUMAi P service worker -- caches the app shell so it keeps working with
// no signal at all once it's been opened at least once with data on.
//
// v2 fix: the page itself (index.html) now uses NETWORK-FIRST instead of
// cache-first. The old version checked the cache before the network for
// everything, which meant updates never showed up until the cache was
// manually cleared -- the exact problem that was reported. Static assets
// (icons, manifest) that rarely change still use cache-first, since
// there's no real benefit to re-fetching those every time.
const CACHE_NAME = 'humaip-cache-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isPageRequest(request) {
  return request.mode === 'navigate' || request.url.endsWith('index.html') || request.url.endsWith('/');
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (isPageRequest(event.request)) {
    // Network-first: always try to get the latest page when online.
    // Only fall back to the cached copy if there's genuinely no signal.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (icons, manifest): cache-first is fine, these rarely change.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
