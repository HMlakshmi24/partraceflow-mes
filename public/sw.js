/*
  Simple offline-capable service worker for MES.
  - Precache app shell (route-level assets)
  - Runtime cache for same-origin GET requests
  - Offline fallback for navigation
*/

const VERSION = 'mes-sw-v1';
const CACHE_SHELL = `mes-shell-${VERSION}`;
const CACHE_RUNTIME = `mes-runtime-${VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/login',
  '/settings',
  '/favicon-32.png',
  '/favicon-192.png',
  '/favicon-512.png',
  '/robots.txt',
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// eslint-disable-next-line no-restricted-globals
self.addEventListener('message', () => {});


self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      await cache.addAll(SHELL_ASSETS.filter(Boolean));
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_SHELL && key !== CACHE_RUNTIME) return caches.delete(key);
          return Promise.resolve();
        })
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isNav = request.mode === 'navigate';
  const sameOrigin = isSameOrigin(url);

  // Navigation requests: cache-first with offline fallback
  if (isNav && sameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_SHELL);
        const cached = await cache.match(request);
        if (cached) return cached;

        try {
          const res = await fetch(request);
          if (res && res.ok) {
            // Cache a best-effort for navigation
            await cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          // Offline fallback to shell
          return (await cache.match('/dashboard')) || (await cache.match('/'));
        }
      })()
    );
    return;
  }

  // Static assets & same-origin GET: stale-while-revalidate
  if (sameOrigin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_RUNTIME);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);

        if (cached) {
          // Return cached quickly, update in background
          fetchPromise;
          return cached;
        }

        const res = await fetchPromise;
        if (res) return res;
        // Final offline fallback for assets
        return (await caches.open(CACHE_SHELL)).match('/');
      })()
    );
  }
});

