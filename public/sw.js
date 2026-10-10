// Service worker de la app (Estudio Cristofaro y Faro).
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

// Notificaciones push (Mensajes): título, texto y a dónde lleva al tocarla
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Faro", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/mensajes";
  event.waitUntil(
    self.registration.showNotification(data.title || "Faro", {
      body: data.body || "Tenés un mensaje nuevo.",
      icon: "/icons/faro-192.png",
      badge: "/icons/badge-96.png",
      tag: url,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/mensajes";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
