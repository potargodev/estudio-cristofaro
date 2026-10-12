import "server-only";

// Adaptadores de tiendas (§2.q etapa 7, principios §22): un núcleo propio con
// adaptadores intercambiables, y escritura solo según las capacidades que
// declara cada plataforma. Hoy todos hablan con el simulador de mocks/tiendas
// (TIENDAS_API_URL); lo que falta para las APIs reales está en `missing` y en
// docs/pendientes-configuracion.md. Faro es la fuente de verdad del stock.

export type Platform = "mercadolibre" | "tiendanube" | "empretienda" | "shopify" | "woocommerce" | "vtex" | "mercadopago" | "fisica";

interface PlatformInfo {
  label: string;
  /** Cómo llegan las ventas: aviso (webhook), consulta periódica o importación de archivo */
  orders: "webhook" | "consulta" | "importacion";
  /** Se puede publicar la existencia */
  publish: boolean;
  /** Lo que falta para la API real */
  missing: string;
}

export const PLATFORMS: Record<Platform, PlatformInfo> = {
  mercadolibre: { label: "Mercado Libre", orders: "webhook", publish: true, missing: "App en developers.mercadolibre.com.ar (client id y secret), OAuth del vendedor, notificaciones del tópico orders_v2 y PUT /items/{id} con available_quantity (o user_products para variantes)." },
  tiendanube: { label: "Tiendanube", orders: "webhook", publish: true, missing: "App en el Partners de Tiendanube, OAuth de la tienda, webhooks order/paid, order/cancelled y PUT /products/{id}/variants/{id} con stock." },
  empretienda: { label: "Empretienda", orders: "consulta", publish: true, missing: "API key de la tienda y confirmar con Empretienda los endpoints de pedidos y de stock (la API pública es acotada)." },
  shopify: { label: "Shopify", orders: "webhook", publish: true, missing: "App personalizada con los permisos read_orders y write_inventory, webhooks orders/paid y orders/cancelled e inventory_levels/set con la ubicación." },
  woocommerce: { label: "WooCommerce", orders: "webhook", publish: true, missing: "Claves de la REST API de WooCommerce (consumer key y secret) de cada sitio, webhooks order.updated y PUT /products/{id} con stock_quantity." },
  vtex: { label: "VTEX", orders: "consulta", publish: true, missing: "App key y token de la cuenta VTEX, feed de pedidos (OMS) y la API de Logistics para el inventario por depósito." },
  mercadopago: { label: "Mercado Pago (QR y Point)", orders: "webhook", publish: false, missing: "Webhook de pagos de la cuenta (ya conectada en Cobros) y la referencia del producto en el pago (external_reference) para saber qué se vendió." },
  fisica: { label: "Tienda física (importación)", orders: "importacion", publish: false, missing: "Nada: las ventas del local se importan por archivo (CSV o Excel del sistema de caja)." },
};

export const isPlatform = (p: string): p is Platform => p in PLATFORMS;

interface RemoteListing {
  externalId: string;
  sku: string | null;
  title: string;
  qty: number;
}

export interface RemoteOrder {
  externalId: string;
  status: "pagada" | "cancelada" | "devuelta";
  at: string;
  lines: { listingId: string; sku: string | null; title: string; qty: number; price: number }[];
  raw: unknown;
}

const base = () => (process.env.TIENDAS_API_URL ?? "").replace(/\/$/, "");

export class StoreError extends Error {
  constructor(message: string, readonly retry = false) {
    super(message);
  }
}

async function call(path: string, init?: RequestInit) {
  if (!base()) throw new StoreError("Las tiendas todavía no están conectadas a sus APIs reales (falta configurar TIENDAS_API_URL o la integración de la plataforma).");
  let r: Response;
  try {
    r = await fetch(`${base()}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new StoreError("No pudimos comunicarnos con la tienda.", true);
  }
  if (r.status >= 500 || r.status === 429) throw new StoreError(`La tienda respondió ${r.status}.`, true);
  if (!r.ok) throw new StoreError(`La tienda respondió ${r.status}.`);
  return r.json();
}

const STATUS: Record<string, RemoteOrder["status"]> = { paid: "pagada", approved: "pagada", cancelled: "cancelada", canceled: "cancelada", refunded: "devuelta", returned: "devuelta" };

/** Pedido de la plataforma → pedido de Faro (un solo formato para todas) */
export function toOrder(o: Record<string, unknown>): RemoteOrder | null {
  const status = STATUS[String(o.status ?? "").toLowerCase()];
  const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
  if (!o.id || !status || !items.length) return null;
  return {
    externalId: String(o.id),
    status,
    at: typeof o.created_at === "string" ? o.created_at : new Date().toISOString(),
    lines: items.map((i) => ({ listingId: String(i.listing_id ?? i.id ?? ""), sku: i.sku ? String(i.sku) : null, title: String(i.title ?? "Producto"), qty: Number(i.quantity ?? 1), price: Number(i.unit_price ?? 0) })).filter((l) => l.qty > 0),
    raw: o,
  };
}

export function adapterFor(platform: Platform, shop: string) {
  const p = `/${platform}/${encodeURIComponent(shop)}`;
  const info = PLATFORMS[platform];
  return {
    info,
    async listings(): Promise<RemoteListing[]> {
      if (info.orders === "importacion") return [];
      const r = (await call(`${p}/listings`)) as { results: { id: string; sku: string | null; title: string; stock: number }[] };
      return r.results.map((l) => ({ externalId: String(l.id), sku: l.sku, title: l.title, qty: Number(l.stock) }));
    },
    async remoteQty(externalId: string): Promise<number> {
      const r = (await call(`${p}/listings/${encodeURIComponent(externalId)}`)) as { stock: number };
      return Number(r.stock);
    },
    async publish(externalId: string, qty: number) {
      if (!info.publish) throw new StoreError(`${info.label} no permite publicar la existencia.`);
      await call(`${p}/listings/${encodeURIComponent(externalId)}/stock`, { method: "PUT", body: JSON.stringify({ qty }) });
    },
    async orders(since: string | null): Promise<RemoteOrder[]> {
      if (info.orders === "importacion") return [];
      const r = (await call(`${p}/orders${since ? `?since=${encodeURIComponent(since)}` : ""}`)) as { results: Record<string, unknown>[] };
      return r.results.map(toOrder).filter((x): x is RemoteOrder => !!x);
    },
  };
}
