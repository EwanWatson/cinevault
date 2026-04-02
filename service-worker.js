// CineVault Service Worker
// Disable entirely on localhost so Live Server hot-reload keeps working
if (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', () => self.clients.claim());
  // No fetch handler — pass everything straight through
} else {

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `cinevault-shell-${CACHE_VERSION}`;
const DATA_CACHE    = `cinevault-data-${CACHE_VERSION}`;
const IMG_CACHE     = `cinevault-images-${CACHE_VERSION}`;

// App shell — the minimum needed to render the page
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
];

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate: remove stale caches from previous versions ─────────────────────
self.addEventListener('activate', event => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, IMG_CACHE]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: route requests to the appropriate strategy ────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // TMDB poster images — cache-first (images are immutable once fetched)
  if (url.hostname === 'image.tmdb.org') {
    event.respondWith(cacheFirst(request, IMG_CACHE));
    return;
  }

  // CDN assets (Tailwind, PapaParse, Google Fonts) — cache-first (long-lived)
  if (
    url.hostname === 'cdn.tailwindcss.com' ||
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Local CSV data files — cache-first (static data files)
  if (url.pathname.match(/\/films_[\w]+\.csv$/)) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  // TMDB API calls — network-first so data stays fresh, fallback to cache
  if (url.hostname === 'api.themoviedb.org') {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  // Everything else on same origin (index.html etc.) — network-first
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return offlineResponse();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || offlineResponse();
  }
}

function offlineResponse() {
  return new Response(
    JSON.stringify({ error: 'offline' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}

} // end localhost else block
