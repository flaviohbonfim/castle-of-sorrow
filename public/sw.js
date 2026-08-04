/* Minimal offline cache for Castle of Sorrow (Phase 9 PWA). */
const CACHE = "castle-of-sorrow-v1";

const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

const sameOrigin = (url) => new URL(url).origin === self.location.origin;

function store(req, res) {
  if (res.ok && sameOrigin(req.url)) {
    const clone = res.clone();
    void caches.open(CACHE).then((c) => c.put(req, clone));
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Art and music are network-first: cache-first would pin whatever art a
  // player installed with, so a manifest or spritesheet update would never
  // reach them. It also silently serves stale sprites while iterating on the
  // asset pipeline. The cache is still the offline fallback.
  if (sameOrigin(req.url) && new URL(req.url).pathname.startsWith("/assets/")) {
    event.respondWith(
      fetch(req)
        .then((res) => store(req, res))
        .catch(() => caches.match(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => store(req, res))
        .catch(() => caches.match("./index.html"));
    }),
  );
});
