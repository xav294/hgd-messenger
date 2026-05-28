// ── NexChat Service Worker ──────────────────────────────────────────────────
// Version du cache — mettre à jour à chaque déploiement pour forcer le refresh
const CACHE_NAME = 'nexchat-v2';

// Ressources essentielles à mettre en cache pour le fonctionnement hors ligne
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ── Installation : mise en cache des ressources essentielles ─────────────────
self.addEventListener('install', function(event) {
  console.log('[NexChat SW] Installation — cache :', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CORE_ASSETS).catch(function(err) {
        // Ne pas bloquer l'installation si certaines ressources manquent
        console.warn('[NexChat SW] Certaines ressources non mises en cache :', err);
      });
    }).then(function() {
      // Activer immédiatement sans attendre la fermeture des onglets existants
      return self.skipWaiting();
    })
  );
});

// ── Activation : nettoyage des anciens caches ────────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[NexChat SW] Activation — nettoyage des anciens caches');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[NexChat SW] Suppression cache obsolète :', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Prendre le contrôle de tous les clients immédiatement
      return self.clients.claim();
    })
  );
});

// ── Fetch : stratégie Network-First avec fallback cache ─────────────────────
self.addEventListener('fetch', function(event) {
  var request = event.request;

  // Ignorer les requêtes non GET et les requêtes tierces (Firebase, Cloudinary, etc.)
  if (request.method !== 'GET') return;

  var url = new URL(request.url);

  // Laisser passer sans interception les APIs tierces critiques
  var passthroughHosts = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'firebaseio.com',
    'googleapis.com',
    'res.cloudinary.com',
    'api.cloudinary.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];

  if (passthroughHosts.some(function(h) { return url.hostname.includes(h); })) {
    return; // Ne pas intercepter
  }

  event.respondWith(
    // 1. Essayer le réseau en priorité
    fetch(request).then(function(networkResponse) {
      // Mettre en cache une copie de la réponse valide
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        var responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(function() {
      // 2. Réseau indisponible → chercher dans le cache
      return caches.match(request).then(function(cachedResponse) {
        if (cachedResponse) {
          return cachedResponse;
        }
        // 3. Ni réseau ni cache → retourner la page principale (app shell)
        if (request.destination === 'document') {
          return caches.match('./');
        }
        // Pour les autres ressources, erreur silencieuse
        return new Response('', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
