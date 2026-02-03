/**
 * Service Worker for CCS Workbench PWA
 *
 * Strategy: Network-first with cache fallback
 * - Always try to fetch from network first (ensures fresh content)
 * - Fall back to cache only when offline
 * - Cache static assets and sample .ccs files
 * - Skip caching API routes (need fresh data)
 */

// Cache version - increment this when you want to force cache updates
// Format: ccs-wb-v{major}.{minor}.{patch}
const CACHE_VERSION = '2.20.2';
const CACHE_NAME = `ccs-wb-v${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// Patterns to cache (regex)
const CACHE_PATTERNS = [
  /\/_next\/static\/.*/,           // Next.js static files
  /\/icons\/.*/,                   // PWA icons
  /\/sample-code\/.*\.ccs$/,       // Sample .ccs files
  /\/sample-code\/.*\.md$/,        // README files
];

// Patterns to NEVER cache
const SKIP_CACHE_PATTERNS = [
  /\/api\/.*/,                     // API routes
  /\/__nextjs_.*/,                 // Next.js internal
  /\/.*\.hot-update\.json$/,       // Hot reload
];

/**
 * Check if URL should be cached
 */
function shouldCache(url) {
  const urlPath = new URL(url).pathname;

  // Never cache these patterns
  if (SKIP_CACHE_PATTERNS.some(pattern => pattern.test(urlPath))) {
    return false;
  }

  // Cache these patterns
  if (CACHE_PATTERNS.some(pattern => pattern.test(urlPath))) {
    return true;
  }

  return false;
}

/**
 * Install event - cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );

  // Activate immediately
  self.skipWaiting();
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control of all pages immediately
  self.clients.claim();
});

/**
 * Fetch event - network-first strategy
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Network request succeeded
        // Cache the response if it should be cached
        if (response.ok && shouldCache(url)) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Network request failed - try cache
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // No cache match - return offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }

          // For other requests, return a basic 503 response
          return new Response('Service Unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/plain',
            }),
          });
        });
      })
  );
});

/**
 * Message event - handle messages from the app
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
