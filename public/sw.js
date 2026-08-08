/*
 * PocketVerse service worker.
 *
 * The app was offline-first long before it had a web build — SQLite is the
 * server, and nothing is designed as if a network might exist. The job here is
 * only to make the *shell* match that promise: once you have loaded the game
 * once, it should start with the plane in flight mode.
 *
 * Strategy, deliberately boring:
 *   · navigations  → network first, fall back to the cached shell
 *   · hashed build output and icons → cache first, they are immutable
 *   · everything else same-origin → stale-while-revalidate
 *   · cross-origin → not our business, pass straight through
 *
 * Bump CACHE_VERSION on any change to this file.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `pocketverse-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `pocketverse-runtime-${CACHE_VERSION}`;
const SHELL_URL = '/index.html';

/** Content-hashed or otherwise immutable — safe to serve from cache forever. */
const IMMUTABLE = [/^\/_expo\/static\//, /^\/assets\//, /^\/icons\//];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL, '/manifest.webmanifest']))
      // A failed precache must not wedge the install; runtime caching recovers.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never let a stale shell outlive a deploy: try the network, keep a copy.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(SHELL_URL, copy));
          return response;
        })
        .catch(() =>
          caches.match(SHELL_URL).then((cached) => cached ?? Response.error()),
        ),
    );
    return;
  }

  if (IMMUTABLE.some((re) => re.test(url.pathname))) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok && response.type === 'basic') {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
