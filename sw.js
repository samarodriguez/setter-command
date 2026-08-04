/* Tidal Field Kit — offline shell.
   Canyon neighbourhoods and dead zones are normal in North County, so the pages
   themselves must not depend on the network. Bump VERSION on every deploy;
   activate() deletes every cache that isn't this one, including any left behind
   by whatever used to live on this domain. */
const VERSION = 'tidal-v1';
const SHELL = ['/', '/shift', '/crm', '/request', '/print',
               '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;          // never cache lead data

  // Network first so a redeploy is picked up, cache as the fallback when offline.
  e.respondWith(
    fetch(req)
      .then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return r;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('/')))
  );
});
