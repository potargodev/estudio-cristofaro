import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stock_stores } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { simGet, simLog, simSet } from "./server";

// Parte C · Simulador de tiendas online dentro de Faro (Mercado Libre,
// Tiendanube, Empretienda, Shopify, WooCommerce, VTEX y Mercado Pago detrás
// de la misma API que mocks/tiendas). Cada tienda simulada guarda sus
// publicaciones, su existencia y sus pedidos en la base. El panel del
// simulador crea ventas y devoluciones que llegan a Faro como un aviso real.

interface Listing {
  id: string;
  sku: string | null;
  title: string;
  stock: number;
}
interface Shop {
  listings: Listing[];
  orders: Record<string, unknown>[];
}

const SAMPLE: Listing[] = [
  { id: "SIM-1", sku: "YER-1K", title: "Yerba mate suave 1 kg", stock: 40 },
  { id: "SIM-2", sku: "AZU-1K", title: "Azúcar común 1 kg", stock: 25 },
  { id: "SIM-3", sku: "MATE-CAL", title: "Mate de calabaza forrado", stock: 12 },
  { id: "SIM-4", sku: null, title: "Bombilla de alpaca", stock: 30 },
];

export async function shopState(path: string): Promise<Shop> {
  return (await simGet<Shop>("tiendas", path)) ?? { listings: SAMPLE.map((l) => ({ ...l })), orders: [] };
}
// La tienda simulada se identifica por el ID de la tienda en Faro: de ahí sale el espacio
async function studioOf(key: string) {
  const id = decodeURIComponent(key.split("/")[2] ?? "");
  if (!isUuid(id)) return null;
  const [st] = await getDb().select({ s: stock_stores.studio_id }).from(stock_stores).where(eq(stock_stores.id, id));
  return st?.s ?? null;
}
const save = async (path: string, s: Shop) => simSet("tiendas", path, s, await studioOf(path));

/** Atiende /<plataforma>/<tienda>/… como la API de la tienda */
export async function simTiendas(path: string, init?: RequestInit): Promise<unknown> {
  const m = path.match(/^\/([\w-]+)\/([^/?]+)(\/.*)?$/);
  if (!m) throw new Error("Simulador de tiendas: ruta inválida");
  const key = `/${m[1]}/${m[2]}`;
  const rest = (m[3] ?? "").split("?")[0];
  const s = await shopState(key);
  if (rest === "/listings") return { results: s.listings };
  const one = rest.match(/^\/listings\/([^/]+)(\/stock)?$/);
  if (one) {
    const l = s.listings.find((x) => x.id === decodeURIComponent(one[1]));
    if (!l) throw new Error("Simulador de tiendas: publicación inexistente");
    if (one[2] && init?.method === "PUT") {
      l.stock = Number(JSON.parse(String(init.body ?? "{}")).qty ?? l.stock);
      await save(key, s);
      await simLog("tiendas", "stock", `${key}: «${l.title}» publicada con ${l.stock}`, { shop: key, id: l.id, qty: l.stock }, await studioOf(key));
      return { ok: true };
    }
    return l;
  }
  if (rest === "/orders") return { results: s.orders };
  throw new Error(`Simulador de tiendas: pedido desconocido (${path})`);
}

/** Panel: una venta (o devolución) en la tienda simulada; devuelve el pedido para mandarlo como aviso a Faro */
export async function simOrder(platform: string, shop: string, i: { listingId: string; qty: number; price: number; status: "paid" | "refunded" | "cancelled"; orderId?: string; buyer?: { name: string; doc_number: string } | null }) {
  const key = `/${platform}/${encodeURIComponent(shop)}`;
  const s = await shopState(key);
  const l = s.listings.find((x) => x.id === i.listingId) ?? s.listings[0];
  const id = i.orderId ?? `SIM-${Date.now().toString(36).toUpperCase()}`;
  const prev = s.orders.find((o) => o.id === id);
  const order = { id, status: i.status, created_at: (prev?.created_at as string) ?? new Date().toISOString(), items: prev?.items ?? [{ listing_id: l.id, sku: l.sku, title: l.title, quantity: i.qty, unit_price: i.price }], ...(i.buyer ? { buyer: i.buyer } : prev?.buyer ? { buyer: prev.buyer } : {}) };
  s.orders = s.orders.filter((o) => o.id !== id).concat(order);
  if (i.status === "paid" && !prev) l.stock = Math.max(0, l.stock - i.qty);
  await save(key, s);
  await simLog("tiendas", i.status === "paid" ? "venta" : "devolucion", `${key}: pedido ${id} ${i.status === "paid" ? `pagado (${i.qty} × «${l.title}» a $ ${i.price})` : i.status === "refunded" ? "devuelto" : "cancelado"}`, { shop: key, order }, await studioOf(key));
  return order;
}
