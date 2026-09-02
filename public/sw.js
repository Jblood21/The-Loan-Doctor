// Minimal service worker. Its only job is to make the app installable as a desktop
// app (browsers require a registered service worker with a fetch handler). It does NOT
// cache responses — every request goes to the network — so an installed app always
// shows the latest deployed version instead of stale cached files.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* pass-through: no respondWith(), so the browser fetches from the network as usual */
});
