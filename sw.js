// Service worker: guarda la app para que abra sin internet. Sube VERSION cuando cambie algún archivo.
const VERSION = 'fb-v1';
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/store.js',
  './js/ui/dom.js',
  './js/ui/views.js',
  './js/engine/index.js',
  './js/engine/budget.js',
  './js/engine/cards.js',
  './js/engine/configcode.js',
  './js/engine/dates.js',
  './js/engine/holidays.js',
  './js/engine/ics.js',
  './js/engine/ledger.js',
  './js/engine/money.js',
  './js/engine/periods.js',
  './js/engine/quickadd.js',
  './js/engine/schedule.js',
  './js/engine/state.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Navegaciones (incluye ?add=… de los atajos): siempre la página principal guardada.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
