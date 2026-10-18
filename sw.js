importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

if (workbox) {
  // Met en cache le HTML, le CSS et le JS (Stale-While-Revalidate)
  // Sert la version en cache instantanément, et met à jour en arrière-plan si tu as fait des modifications
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'document' || request.destination === 'script' || request.destination === 'style',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'cashboost-assets',
    })
  );

  // Met en cache les images (Logos MonCash, Natcash, icônes)
  workbox.routing.registerRoute(
    ({request}) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'cashboost-images',
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // Garde les images 30 jours
        }),
      ],
    })
  );
}

// --- Ton code d'origine pour les notifications Push (intact) ---
self.addEventListener('push', (event) => {
  let data = { title: 'Cash Boost', body: 'Mise à jour de ta commande.' };
  try { if (event.data) data = event.data.json(); } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Cash Boost', {
      body: data.body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: data.url || './'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(event.notification.data?.url || './');
    })
  );
});

// Permet de forcer la mise à jour quand l'utilisateur clique sur "Mettre à jour"
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
