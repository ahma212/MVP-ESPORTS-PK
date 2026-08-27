// Service Worker for MVP ESPORTS PWA
const CACHE_NAME = 'mvp-esports-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through fetch strategy to keep dynamic backend requests fresh
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

// ==========================================
// Push Notification Listener
// ==========================================
self.addEventListener('push', (event) => {
  let data = {
    title: 'MVP ESPORTS',
    body: 'You have a new notification!',
    url: '/'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Agar app open / focused hai to system notification mat dikhao
      const isAppOpen = windowClients.some(
        (c) => c.focused || (c.visibilityState && c.visibilityState === 'visible')
      );
      if (isAppOpen) {
        // App ke andar already notification list update ho sakti hai
        return;
      }

      const options = {
        body: data.body || 'New notification',
        icon: 'https://mvpesports.online/icon-192.png',
        badge: 'https://mvpesports.online/icon-192-maskable.png',
        image: data.image || undefined,
        vibrate: [200, 100, 200, 100, 200, 100, 400],
        tag: data.tag || ('mvp-esports-' + (data.match_id || data.title || Date.now())),
        renotify: false,
        requireInteraction: true,
        silent: false,
        data: { url: data.url || '/' },
        actions: [
          { action: 'open', title: 'Open App' },
          { action: 'close', title: 'Close' }
        ]
      };

      return self.registration.showNotification(data.title || 'MVP ESPORTS', options);
    })
  );
});