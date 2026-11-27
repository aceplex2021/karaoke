/**
 * Service Worker for Kara PWA
 *
 * Exists for install + share-target only.
 * ZERO caching. Do not intercept API or mutating requests.
 */

const VERSION = 'v4.0.1-phaseb';

self.addEventListener('install', () => {
  console.log('[SW] Installing version:', VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', VERSION);
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('[SW] Claimed all clients');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url || '';
  const method = event.request.method || 'GET';

  // Never touch YouTube / media embeds
  if (
    url.includes('youtube.com') ||
    url.includes('youtube-nocookie.com') ||
    url.includes('ytimg.com')
  ) {
    return;
  }

  // Critical: let browser handle API + non-GET so PWA join/create POSTs are reliable
  try {
    const path = new URL(url).pathname;
    if (path.startsWith('/api/') || method !== 'GET') {
      return;
    }
  } catch {
    return;
  }

  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
});

console.log('[SW] Service Worker loaded:', VERSION);
console.log('[SW] API and non-GET requests are not intercepted');
