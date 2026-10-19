// =====================================================================
// CASH BOOST — Service Worker v4
// v4 : le site est découpé en plusieurs fichiers (.js / .css).
//  - Tous les fichiers du site sont pré-mis en cache (mode hors ligne fiable).
//  - JS et CSS : réseau d'abord, cache en secours (plus de versions mélangées
//    entre un index.html neuf et d'anciens scripts).
//  - Images : cache d'abord, mise à jour en arrière-plan.
// =====================================================================

// ⚠️ À changer quand tu modifies CE fichier ou veux vider le cache de tous les clients.
const CACHE_NAME = 'cashboost-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './404.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './design.css',
  './styles.css',
  './wallet-blue.css',
  './base.js',
  './ui.js',
  './app.js',
  './auth.js',
  './compte.js',
  './commandes.js',
  './portefeuille.js',
  './admin.js',
  './animations.js',
  './freefire.js',
  './notifications.js',
  './usdt.js'
];
const NETWORK_TIMEOUT_MS = 5000; // connexion trop lente : on utilise la dernière version connue

// INSTALL : chaque fichier est ajouté séparément, un échec n'empêche pas les autres
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(CORE_ASSETS.map((asset) => cache.add(asset).catch(() => {})))
    )
  );
});

// ACTIVATE : supprime TOUS les autres caches (anciennes copies) + prend le contrôle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Dernière version connue de la page, uniquement dans NOTRE cache
async function cachedPage(req) {
  const cache = await caches.open(CACHE_NAME);
  return (await cache.match(req, { ignoreSearch: true }))
      || (await cache.match('./index.html'))
      || (await cache.match('./'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore les APIs externes
  if (
    req.method !== 'GET' ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('callmebot.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) return;

  const isHTML = req.mode === 'navigate' ||
                 req.destination === 'document' ||
                 url.pathname.endsWith('.html') ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/');

  const isCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  // PAGE : réseau d'abord (toujours la dernière version), sinon dernière version connue
  if (isHTML) {
    event.respondWith((async () => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy1 = res.clone(), copy2 = res.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, copy1);
            cache.put('./index.html', copy2);   // une seule copie de référence, toujours la plus récente
          });
        }
        return res;
      });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS));
      try {
        return await Promise.race([network, timeout]);
      } catch (_) {
        const cached = await cachedPage(req);
        if (cached) return cached;
        return network.catch(() => new Response('Hors ligne', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }));
      }
    })());
    return;
  }

  // JS / CSS : réseau d'abord (même version que la page), sinon cache
  if (isCode) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS));
      try {
        return await Promise.race([network, timeout]);
      } catch (_) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        return network.catch(() => Response.error());
      }
    })());
    return;
  }

  // IMAGES et autres fichiers : cache d'abord, mis à jour en arrière-plan
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
        return res;
      })
      .catch(async () => cached || (await cache.match(req, { ignoreSearch: true })) || Response.error());
    return cached || fetchPromise;
  })());
});

// PUSH notifications (inchangé)
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
