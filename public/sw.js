// Service worker de la app de Estudio Cristofaro.
// - Archivos estáticos con hash (/_next/static), íconos y fotos: caché primero.
// - Páginas: siempre red (datos privados al día); sin conexión, /offline.
// - Nunca se guardan respuestas de /api, /admin, /portal ni nada autenticado.
const VERSION = "v1";
const STATIC = `ec-static-${VERSION}`;
const PAGES = `ec-pages-${VERSION}`;
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll([OFFLINE, "/icons/icon-192.png", "/icons/icon-512.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación: red; si no hay conexión, la página sin conexión
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  const cacheable =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/hero/") || url.pathname.startsWith("/marca/");
  if (!cacheable) return;
  event.respondWith(
    caches.open(STATIC).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    }),
  );
});
