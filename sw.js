// offline cache for lecture use, cache-first since the app is fully static
// bump the cache version whenever shipped files change, old caches get deleted on activate

const CACHE = "automata-meow-v13";
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

// serve from cache when possible, fall back to network and cache the result
self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
    )
  );
});
