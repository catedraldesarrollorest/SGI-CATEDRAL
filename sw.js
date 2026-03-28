// Service Worker — SGI-La Catedral
// Solo necesario para habilitar la instalación como PWA
const CACHE_NAME = 'sgi-catedral-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

// Pass-through: no interceptamos requests, todo va a la red
self.addEventListener('fetch', function(e) {
  e.respondWith(fetch(e.request).catch(function() {
    return caches.match(e.request);
  }));
});
