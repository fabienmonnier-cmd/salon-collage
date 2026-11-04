const CACHE_NAME = 'salon-collage-v2-20261104';
const APP_SHELL = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME && n.startsWith('salon-collage-')).map(n => caches.delete(n)))), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const req = event.request.mode === 'navigate' ? new Request('./index.html') : event.request;
    const saved = await cache.match(req);
    if(saved) return saved;
    try { return await fetch(event.request); }
    catch(e){ if(event.request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error(); throw e; }
  })());
});
