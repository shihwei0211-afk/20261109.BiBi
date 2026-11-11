'use strict';
// 只快取離線說明與靜態資源；不攔截 Supabase、CDN 或報修送出。
const CACHE_PREFIX = 'repair-desk-static-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const ASSETS = ['offline.html', 'style.css', 'assets/icon-192.png', 'assets/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('offline.html', self.registration.scope))));
  } else if (ASSETS.some(asset => new URL(asset, self.registration.scope).href === url.href)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
