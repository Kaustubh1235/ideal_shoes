/* Stock Room service worker: cache the app shell so the app opens offline; API is always network-first. */
const VERSION = "sr-v1";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/scanner.js", "/charts.js", "/vendor/jsQR.js", "/vendor/qrcode.js", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  if (e.request.method !== "GET") return; // writes go straight through; the page queues them when offline
  if (url.pathname.startsWith("/api/") || url.pathname === "/healthz" || url.pathname === "/metrics") {
    // network-first, fall back to the last bootstrap so the stock list still opens offline
    e.respondWith(fetch(e.request).then((res) => { if (res.ok && url.pathname === "/api/v1/bootstrap") caches.open(VERSION).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request).then((r) => r || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } }))));
    return;
  }
  // shell: cache-first, refresh in the background
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((cached) => {
    const net = fetch(e.request).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => cached);
    return cached || net;
  }));
});
