// Service worker: la app funciona sin conexión.
// Estrategia "stale-while-revalidate": responde desde caché al instante y actualiza en segundo plano,
// de modo que una nueva versión publicada se usa en el siguiente arranque.
// Sube CACHE al publicar cambios grandes para forzar la limpieza de la caché anterior.
const CACHE = 'fitcoach-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/dates.js', 'js/ui.js', 'js/zip.js', 'js/charts.js', 'js/plans.js',
  'js/store.js', 'js/sync.js', 'js/claude-spec.js', 'js/widgets.js',
  'js/views/dashboard.js', 'js/views/workout.js', 'js/views/session.js', 'js/views/calendar.js',
  'js/views/diet.js', 'js/views/shopping.js', 'js/views/progress.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
