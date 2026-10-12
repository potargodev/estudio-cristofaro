// Simulador de tiendas online (§2.q etapa 7) para pruebas y para la demo:
// Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce, VTEX y
// Mercado Pago (ventas con QR o Point) detrás de una misma API. Nunca en
// producción: las APIs reales y lo que falta para usarlas están en
// docs/decisiones.md (§2.q, etapa 7) y docs/pendientes-configuracion.md.
//
//   node mocks/tiendas/server.mjs     → http://localhost:4100
//
// En Faro: TIENDAS_API_URL=http://localhost:4100. Cada tienda es
// /:platform/:shop. Implementa:
// - GET  /:platform/:shop/listings              → publicaciones con su existencia
// - GET  /:platform/:shop/listings/:id          → una publicación
// - PUT  /:platform/:shop/listings/:id/stock    { qty } → publica la existencia
// - GET  /:platform/:shop/orders?since=ISO      → pedidos (para las que se consultan)
// Para las pruebas:
// - POST /__listing { platform, shop, id, sku, title, stock }
// - POST /__order   { platform, shop, webhook?, order } → guarda el pedido y,
//   si viene webhook, lo manda a Faro (también se puede mandar dos veces)
// - POST /__remote_stock { platform, shop, id, qty } → alguien cambió la
//   existencia en la plataforma
// - POST /__fail { platform, shop, times } → las próximas publicaciones fallan
// - POST /__reset · GET /__state

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4100);
let shops = new Map();

const shopOf = (platform, shop) => {
  const k = `${platform}/${shop}`;
  if (!shops.has(k)) shops.set(k, { listings: new Map(), orders: [], fail: 0, puts: [] });
  return shops.get(k);
};

const body = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
  });

const send = (res, code, data) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/__reset") {
    shops = new Map();
    return send(res, 200, { ok: true });
  }
  if (url.pathname === "/__state") return send(res, 200, Object.fromEntries([...shops].map(([k, v]) => [k, { listings: [...v.listings.values()], orders: v.orders, puts: v.puts }])));
  if (req.method === "POST" && url.pathname === "/__listing") {
    const b = await body(req);
    shopOf(b.platform, b.shop).listings.set(String(b.id), { id: String(b.id), sku: b.sku ?? null, title: b.title, stock: Number(b.stock ?? 0) });
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__remote_stock") {
    const b = await body(req);
    const l = shopOf(b.platform, b.shop).listings.get(String(b.id));
    if (!l) return send(res, 404, { error: "not_found" });
    l.stock = Number(b.qty);
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__fail") {
    const b = await body(req);
    shopOf(b.platform, b.shop).fail = Number(b.times ?? 1);
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/__order") {
    const b = await body(req);
    const s = shopOf(b.platform, b.shop);
    const order = { ...b.order, updated_at: new Date().toISOString() };
    s.orders = s.orders.filter((o) => o.id !== order.id).concat(order);
    let delivered = null;
    if (b.webhook) {
      const r = await fetch(b.webhook, { method: "POST", headers: { "Content-Type": "application/json", "X-Faro-Mock-Platform": b.platform }, body: JSON.stringify({ topic: "orders", platform: b.platform, shop: b.shop, order }) });
      delivered = r.status;
    }
    return send(res, 200, { ok: true, delivered });
  }
  const [platform, shop, resource, id, sub] = parts;
  if (!platform || !shop) return send(res, 404, { error: "not_found" });
  const s = shopOf(platform, shop);
  if (resource === "listings" && !id && req.method === "GET") return send(res, 200, { results: [...s.listings.values()] });
  if (resource === "listings" && id && !sub && req.method === "GET") {
    const l = s.listings.get(id);
    return l ? send(res, 200, l) : send(res, 404, { error: "not_found" });
  }
  if (resource === "listings" && id && sub === "stock" && req.method === "PUT") {
    const l = s.listings.get(id);
    if (!l) return send(res, 404, { error: "not_found" });
    if (s.fail > 0) {
      s.fail--;
      return send(res, 503, { error: "temporarily_unavailable" });
    }
    const b = await body(req);
    l.stock = Number(b.qty);
    s.puts.push({ id, qty: l.stock, at: new Date().toISOString() });
    return send(res, 200, l);
  }
  if (resource === "orders" && req.method === "GET") {
    const since = url.searchParams.get("since");
    return send(res, 200, { results: s.orders.filter((o) => !since || o.updated_at > since) });
  }
  send(res, 404, { error: "not_found" });
}).listen(PORT, () => console.log(`Simulador de tiendas en http://localhost:${PORT}`));
