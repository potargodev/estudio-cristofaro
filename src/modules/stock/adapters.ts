import "server-only";

// Adaptadores de tiendas (§2.q etapa 7, principios §22): un núcleo propio con
// adaptadores intercambiables, y escritura solo según las capacidades que
// declara cada plataforma. Hoy todos hablan con el simulador de mocks/tiendas
// (TIENDAS_API_URL); lo que falta para las APIs reales está en `missing` y en
// docs/pendientes-configuracion.md. Faro es la fuente de verdad del stock.

import { PLATFORMS, isPlatform, type Platform } from "./platforms";

export { PLATFORMS, isPlatform, type Platform };

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
