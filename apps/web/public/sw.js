// Hand-written service worker: runtime caching only, no generated precache list.
// Bun emits hashed asset names, so a precache manifest would need a post-build
// generation step; hashed assets are immutable by construction, which makes plain
// cache-first correct without one.
const CACHE = 'gc-v1';
const SHELL = '/';

// Bun's output is index-<hash>.js / index-<hash>.css. The hash IS the version, so a hit
// can never be stale.
const isImmutableAsset = (pathname) => /^\/index-[a-z0-9]+\.(js|css)$/.test(pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(SHELL)));
  // Deliberately no skipWaiting() here: the app prompts the user first and only then
  // sends SKIP_WAITING. Activating immediately would swap the app under their feet.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // The API lives on another origin (PUBLIC_API_URL), so this excludes every API call.
  // ponytail: if Fase 6 ever puts web and api on the same domain, add an explicit
  // exclusion for /utente, /andamento, /tipo-spesa and /statistiche.
  if (url.origin !== self.location.origin) return;

  if (isImmutableAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only a successful navigation may replace the shell. A proxy's 502 page
          // resolves the fetch normally, so without this check it would be cached as the
          // app shell and then served to every later offline visit.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(() => caches.match(SHELL).then((hit) => hit ?? Response.error())),
    );
  }
});
