// ── HGD Messenger — Service Worker ────────────────────────────
// Version du cache : incrementer à chaque déploiement
const CACHE_VERSION = 'hgd-v1';
const CACHE_STATIC  = `${CACHE_VERSION}-static`;

// Fichiers à mettre en cache au premier chargement
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// ── INSTALLATION ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Activer immédiatement sans attendre la fermeture des onglets
  self.skipWaiting();
});

// ── ACTIVATION ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_STATIC)
          .map(key => caches.delete(key))
      )
    )
  );
  // Prendre le contrôle de tous les onglets ouverts
  self.clients.claim();
});

// ── STRATÉGIE RÉSEAU : Network First avec fallback cache ─────
// Parfait pour une app de messagerie (données toujours fraîches)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne pas intercepter les requêtes Firebase / API externes
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('anthropic.com') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // laisser passer tel quel
  }

  // Pour les ressources locales : Network First
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Mettre en cache une copie fraîche si la réponse est valide
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_STATIC).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Réseau indisponible → servir depuis le cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback ultime : renvoyer index.html pour navigation SPA
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Hors ligne', { status: 503 });
        });
      })
  );
});

// ── NOTIFICATIONS PUSH (optionnel) ───────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'HGD Messenger', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(data.title || 'HGD Messenger', {
      body:  data.body  || 'Nouveau message',
      icon:  './icon-192.png',
      badge: './icon-192.png',
      data:  data.url ? { url: data.url } : {}
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
