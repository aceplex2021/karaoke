/**
 * Service Worker for Kara PWA (v4.0)
 * 
 * IMPORTANT: ZERO CACHING POLICY
 * - This service worker exists ONLY for:
 *   1. PWA installation
 *   2. Share target functionality
 *   3. Auto-update mechanism
 * 
 * - NO data caching
 * - NO offline mode
 * - NO fallback content
 * - Always fetch fresh data from network
 * 
 * Why no caching:
 * - Vercel has caching limitations
 * - Real-time queue updates (2.5s polling)
 * - Prevents stale data issues
 * - Approval status must always be current
 */

const VERSION = 'v4.0.0';

// ============================================
// Install Event
// ============================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', VERSION);
  
  // Skip waiting to activate immediately
  // This ensures users always get the latest version
  self.skipWaiting();
});

// ============================================
// Activate Event
// ============================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', VERSION);
  
  // Take control of all clients immediately
  // No need to wait for page reload
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('[SW] Claimed all clients');
    })
  );
});

// ============================================
// Fetch Event - ZERO CACHING
// ============================================
self.addEventListener('fetch', (event) => {
  // Don't intercept YouTube iframe requests - let browser handle directly.
  // SW fetch() can strip/modify Referer/Origin headers; YouTube needs them
  // for embed validation (Error 150 on WiFi when headers are missing).
  const url = event.request.url || '';
  if (url.includes('youtube.com') || url.includes('youtube-nocookie.com') || url.includes('ytimg.com')) {
    return; // Let browser handle YouTube requests (preserves headers)
  }

  // ALWAYS fetch from network for all other requests
  // NO caching, NO fallback
  event.respondWith(fetch(event.request));
});

// ============================================
// Message Event
// ============================================
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Force activation of new service worker
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    // Send version to client
    event.ports[0].postMessage({ version: VERSION });
  }
});

// ============================================
// Push Event (for future notifications)
// ============================================
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event.data?.text());
  
  // For future: Show notifications when host approves/denies
  // Currently not implemented
});

// ============================================
// Logging
// ============================================
console.log('[SW] Service Worker loaded:', VERSION);
console.log('[SW] Zero caching policy active');
console.log('[SW] All requests will fetch from network');
