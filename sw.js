// Service worker: guarda la app para que abra sin internet. Sube VERSION cuando cambie algún archivo.
const VERSION = 'fb-v8';
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
  './js/ui/editors.js',
  './js/ui/icons.js',
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

// Red primero: con internet siempre se carga la versión más nueva; la caché solo se usa sin conexión.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && req.mode !== 'navigate') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      return (await caches.match(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});
