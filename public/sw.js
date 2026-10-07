// Plan B service worker: keeps the attendee page usable with no signal.
// Pages + plan bundles: network first, cached copy when offline. Static assets: cache first.
// Triggers (/api/trigger) are never cached — they need a live (even weak) connection.
const CACHE = "planb-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/trigger")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) => hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        }),
      ),
    );
    return;
  }

  if (e.request.mode === "navigate" || url.pathname.startsWith("/api/bundle/") || url.pathname.startsWith("/_next/") || url.searchParams.has("_rsc")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || new Response("Offline and not cached yet", { status: 503 }))),
    );
  }
});
