// ══════════════════════════════════════════════════════════════
//  HGD MESSENGER — Service Worker v2.0
//  Stratégie : Cache First + Offline fallback
//  Toutes les ressources sont mises en cache pour fonctionner
//  100% hors-ligne après la première installation.
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = 'hgd-messenger-v2';
const OFFLINE_URL = './index.html';

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  // Police Google Fonts (si dispo en ligne)
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap',
];

// ── INSTALL ───────────────────────────────────────────────────
// Lors de l'installation, on précache les ressources essentielles
self.addEventListener('install', (event) => {
  console.log('[HGD SW] Installation...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[HGD SW] Mise en cache des ressources...');
      // On essaie de mettre en cache chaque ressource individuellement
      // pour ne pas bloquer si une ressource distante est indisponible
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[HGD SW] Impossible de mettre en cache:', url, err);
          })
        )
      );
    }).then(() => {
      console.log('[HGD SW] Installation terminée');
      // Forcer l'activation immédiate sans attendre la fermeture des onglets
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────
// Lors de l'activation, on supprime les anciens caches
self.addEventListener('activate', (event) => {
  console.log('[HGD SW] Activation...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[HGD SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[HGD SW] Activé — contrôle de toutes les pages');
      // Prendre le contrôle immédiatement de toutes les pages ouvertes
      return self.clients.claim();
    })
  );
});

// ── FETCH ─────────────────────────────────────────────────────
// Stratégie : Cache First, puis réseau, puis fallback offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne pas intercepter les requêtes non-GET
  if (request.method !== 'GET') return;

  // Ne pas intercepter les requêtes vers des APIs externes
  // (chrome-extension, data:, etc.)
  if (!request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Ressource trouvée dans le cache → on la retourne
        // Et on met à jour le cache en arrière-plan (stale-while-revalidate)
        const fetchPromise = fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => null); // Ignorer les erreurs réseau en arrière-plan
        
        return cachedResponse;
      }

      // Pas dans le cache → on essaie le réseau
      return fetch(request)
        .then(networkResponse => {
          // On met en cache les réponses réussies (ressources locales uniquement)
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === 'basic' || networkResponse.type === 'cors')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Réseau indisponible → fallback sur la page principale
          if (request.destination === 'document') {
            return caches.match(OFFLINE_URL);
          }
          // Pour les autres ressources (images, scripts), retourner une réponse vide
          return new Response('', {
            status: 503,
            statusText: 'Service Unavailable — Hors-ligne',
          });
        });
    })
  );
});

// ── PUSH NOTIFICATIONS (optionnel) ────────────────────────────
// Prêt pour les notifications push futures
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'HGD Messenger', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Nouveau message',
    icon: './icons/icon-192.png',
    badge: './icons/icon-96.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'hgd-notification',
    renotify: true,
    data: {
      url: data.url || './',
      timestamp: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'HGD Messenger', options)
  );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const targetUrl = (event.notification.data && event.notification.data.url) || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Chercher si une fenêtre de l'app est déjà ouverte
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── BACKGROUND SYNC (optionnel) ───────────────────────────────
// Synchronisation en arrière-plan quand la connexion revient
self.addEventListener('sync', (event) => {
  if (event.tag === 'hgd-sync') {
    console.log('[HGD SW] Background sync déclenché');
    // Logique de sync à implémenter si backend ajouté
  }
});

console.log('[HGD SW] Service Worker chargé — HGD Messenger v2.0');
