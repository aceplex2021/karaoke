/**
 * Service Worker for Kara PWA
 *
 * Exists for install + share-target only.
 * ZERO caching. Do not intercept fetches — broken respondWith(fetch)
 * caused /room/* navigation network errors when the proxy blipped.
 */

const VERSION = 'v4.0.2-phaseb-passthrough';

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

// Do not call event.respondWith — let the browser handle all network I/O.
self.addEventListener('fetch', () => {});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: VERSION });
  }
});

console.log('[SW] Service Worker loaded:', VERSION);
console.log('[SW] Passthrough mode — no fetch interception');
