/**
 * KTN Flashcards Scoped Service Worker (Phase 7)
 * Scope: ./ (strictly inside /flashcards/ — never conflicts with root KTN SW or Web Push)
 * Pre-caches core shell + offline stroke data + metadata (~1.8 MB).
 * Progressively caches viewed card WebP images & native audio on demand (bounded cache).
 */

const SHELL_CACHE = 'ktn-flashcards-shell-v3-2';
const MEDIA_CACHE = 'ktn-flashcards-media-v3';
const MAX_MEDIA_ITEMS = 300;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/style.css?v=2',
  './assets/js/hanzi-writer.min.js',
  './assets/js/strokes-data.js',
  './assets/js/cards-lo1.js',
  './assets/js/cards-data.js',
  './assets/js/app.js',
  './assets/js/app.js?v=2',
  './assets/images/chibi/chibi_1.png',
  './assets/images/cards/lo1/card_1_front.webp',
  './assets/images/cards/lo1/card_1_back.webp',
  './assets/images/cards/lo1/thumb_1.webp',
  './assets/audio/cmn-你.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          // Only clean up old ktn-flashcards-* caches; never touch root KTN caches!
          if (key.startsWith('ktn-flashcards-') && key !== SHELL_CACHE && key !== MEDIA_CACHE) {
            return caches.delete(key);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isMedia =
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.mp3');

  if (isMedia) {
    // Cache-first for viewed card images & native audio, without unconditional bulk pre-caching
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.status === 200) {
            cache.put(req, netRes.clone());
            trimCache(MEDIA_CACHE, MAX_MEDIA_ITEMS);
          }
          return netRes;
        } catch (err) {
          return new Response('', { status: 404, statusText: 'Offline media not cached yet' });
        }
      })
    );
    return;
  }

  // Network-first with cache fallback for HTML/CSS/JS shell so updates never break offline study
  event.respondWith(
    fetch(req)
      .then((netRes) => {
        if (netRes && netRes.status === 200) {
          const copy = netRes.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
        }
        return netRes;
      })
      .catch(async () => {
        const cached = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      })
  );
});
