// Service worker de Co-Loto : rend l'application installable et garde une copie
// des fichiers statiques. Le jeu se déroule en temps réel : l'API et Socket.IO
// passent toujours par le réseau, jamais par le cache.
const CACHE = 'coloto-v1';
const OFFLINE_PAGE = '/hors-ligne.html';
const PRECACHE = [
  OFFLINE_PAGE,
  '/style.css',
  '/icons/icon.svg',
  '/icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return /\.(?:css|js|png|svg|webmanifest)$/.test(url.pathname);
}

// Réseau d'abord, pour toujours servir la dernière version publiée ;
// la copie en cache ne sert que si le réseau est indisponible.
async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && isStaticAsset(new URL(request.url))) await cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request) ?? (fallback && await cache.match(fallback));
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (['/api/', '/auth/', '/socket.io/'].some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, OFFLINE_PAGE));
  } else if (isStaticAsset(url)) {
    event.respondWith(networkFirst(request));
  }
});
