// CaissePro Scanner service worker, registered with scope /scanner only (the rest of CaissePro is not affected).
// Pages always come from the network (prices and stock must be current); without a connection the scanner shows
// a small offline page instead of the browser's error.
const CACHE = 'caissepro-scanner-v1';
const OFFLINE = ['/scanner-offline.html', '/scanner-icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('caissepro-scanner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/scanner-offline.html')));
});
