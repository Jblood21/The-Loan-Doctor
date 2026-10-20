// Basecamp service worker. It makes the app installable as a desktop app and gives it a
// friendly offline page. It deliberately does NOT cache the app itself: page loads are
// always network-first, so an installed app shows the latest deployed version instead of
// stale files. Only a tiny offline shell is stored, and only used when the network fails.
// Bump CACHE when the shell changes so old copies are cleared.
const CACHE = 'basecamp-offline-v1';
const OFFLINE_URL = '/offline.html';
const SHELL = [OFFLINE_URL, '/brand/loan-base-camp.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Page navigations: network first, offline page if the network is unreachable.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((res) => res || Response.error())),
    );
    return;
  }

  // The few files the offline page itself needs (its logo): network first, cached copy
  // as a fallback. API calls, scripts and everything else pass straight through.
  if (SHELL.includes(new URL(req.url).pathname)) {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((res) => res || Response.error())));
  }
});
