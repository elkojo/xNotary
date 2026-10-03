/*
 * Retires the service worker xNotary registered here before 0.5.0.
 *
 * Until then xNotary was served from `/` and registered `/sw.js` with scope
 * `/`: a cache-first worker for the whole origin. A returning visitor who has
 * it is shown that old app at `/` from cache. When the browser next checks
 * this file for an update — on its own schedule, typically once the old worker
 * has gone idle, not the moment the page opens — it finds this one instead.
 *
 * This worker unregisters at once, so the visitor's *next* load comes from the
 * network: the front page, which forwards old `#/…` addresses to /xnotary/.
 * It deliberately does not reload open pages, and it keeps answering them from
 * the old cache: someone halfway through timestamping a document must not have
 * the page pulled away, or find the old app's lazily-loaded chunks gone. The
 * old caches are deleted by the /xnotary/ worker, once the visitor is there.
 *
 * This file must stay, permanently. If it 404s, the update check fails and
 * the old worker stays installed rather than going away.
 */
const LEGACY = /^xnotary-[a-z0-9]+$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      for (const key of await caches.keys()) {
        if (!LEGACY.test(key)) continue;
        const hit = await (await caches.open(key)).match(request);
        if (hit) return hit;
      }
      return fetch(request);
    })(),
  );
});
