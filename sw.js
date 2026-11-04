/* Offline support: the game is a handful of static files, so cache them all and serve them first. */
const CACHE = 'limpa-v14';
const FILES = ['./', 'index.html', 'css/style.css', 'js/engine.js', 'js/gamelog.js', 'js/bot-worker.js', 'js/app.js', 'js/net.js', 'js/vendor/peerjs.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, so a new version always shows up as soon as you are online; the saved copy is only for offline use.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const same = new URL(e.request.url).origin === location.origin;
  e.respondWith(fetch(e.request, same ? { cache: 'no-cache' } : undefined).then((res) => {
    if (res.ok && same) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html'))));
});
