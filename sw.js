/*
 * sw.js — Service worker: guarda los archivos de la app para que funcione sin señal en planta.
 * IMPORTANTE: cada vez que cambies un archivo, subí el número de VERSION para que los
 * celulares descarguen la versión nueva.
 */
const VERSION = 'control-linea-v3';
const ARCHIVOS = [
  './',
  './index.html',
  './css/styles.css',
  './js/brand.js',
  './js/store.js',
  './js/report.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para tomar cambios), caché si no hay señal.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copia = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
