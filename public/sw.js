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
    title: '👑 MVP ESPORTS VIP', 
    body: 'Aapke paas ek naya VIP notification aaya hai!', 
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
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192-maskable.png',
    image: data.image || null,
    vibrate: [200, 100, 200, 100, 200],
    tag: 'vip-notification',
    renotify: true,
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '👑 MVP ESPORTS VIP', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
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
