// Service worker de L'Antre.
//
// Chemins relatifs obligatoires : sur GitHub Pages le site est servi depuis
// /<repo>/ et non depuis la racine du domaine.

const CACHE_NAME = 'l-antre-v12';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './scripts/utils.js',
  './scripts/notifications.js',
  './scripts/relay.js',
  './scripts/backend.js',
  './scripts/blocklist.js',
  './scripts/filters.js',
  './scripts/search-engine.js',
  './scripts/geolocation.js',
  './scripts/vision.js',
  './scripts/favorites.js',
  './scripts/render.js',
  './scripts/sources.js',
  './scripts/history.js',
  './scripts/app.js',
  './assets/default-profile.png',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll() est atomique : une seule URL en échec annule toute l'installation.
    // On met donc chaque fichier en cache indépendamment.
    await Promise.all(APP_SHELL.map(url =>
      cache.add(url).catch(error => console.warn('Ressource non mise en cache :', url, error))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('l-antre-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Les appels aux API tierces (Reddit, Nominatim, CDN) ne sont jamais mis en cache.
  if (url.origin !== self.location.origin) return;

  // Navigation : réseau d'abord, pour ne pas rester bloqué sur une version périmée.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', response.clone());
        return response;
      } catch (error) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Ressources statiques : cache d'abord, avec rafraîchissement en arrière-plan.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(response => {
      if (response && response.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      }
      return response;
    }).catch(() => cached);

    return cached || network;
  })());
});
