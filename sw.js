// Offline support. Everything the game fetches is kept in a cache and refreshed in the background
// (stale-while-revalidate), so a second visit starts instantly and works without a connection.
const CACHE = 'push-in-boots-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'src/main.js', 'assets/atlas.json', 'assets/stages.json',
  'assets/ui/logo.webp', 'assets/ui/keyart.jpg', 'assets/font/baloo-2-latin-800-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/legacy-unity/')) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: url.pathname.endsWith('/') || url.pathname.endsWith('index.html') });
    const fresh = fetch(req).then((res) => { if (res && res.ok && res.type === 'basic') cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    return (await fresh) || new Response('Offline', { status: 503, statusText: 'Offline' });
  }));
});
