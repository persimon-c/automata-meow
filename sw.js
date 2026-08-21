// offline cache for lecture use
// strategy: stale-while-revalidate — the cached copy answers instantly (fast on flaky wifi,
// works offline), and a background network fetch refreshes the cache for the next load.
// this means shipped-file changes self-heal without touching this file.
// bump CACHE only when the ASSETS LIST itself changes (files added or removed).

const CACHE = "automata-meow-v23";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/model.js",
  "./js/viewport.js",
  "./js/renderer.js",
  "./js/tools.js",
  "./js/editor.js",
  "./js/undo.js",
  "./js/jff.js",
  "./js/engine.js",
  "./js/main.js",
  "./manifest.json",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// one cache key per resource path, ignoring query strings, so /?debug and / share entries
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const key = url.origin + url.pathname;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    // kick off the refresh immediately either way, it lands in the cache for next load
    const network = fetch(req).then(res => {
      if (res && res.status === 200) cache.put(key, res.clone());
      return res;
    });
    if (cached) {
      // keep the service worker alive until the background refresh settles
      e.waitUntil(network.catch(() => {}));
      return cached;
    }
    try {
      return await network;
    } catch {
      // offline and never cached
      return new Response("", { status: 504 });
    }
  })());
});
