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
// ADDED: VIP Push Notification Listeners
// ==========================================
self.addEventListener('push', (event) => {
  let data = {
    title: 'MVP ESPORTS',
    body: 'Aapke paas ek naya notification aaya hai!',
    url: '/'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body || 'New notification',
    icon: 'https://mvpesports.online/icon-192.png',
    badge: 'https://mvpesports.online/icon-192-maskable.png',
    image: data.image || undefined,
    vibrate: [300, 100, 300, 100, 300],
    tag: 'mvp-esports-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MVP ESPORTS', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ((client.url === targetUrl || client.url.includes(targetUrl)) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});