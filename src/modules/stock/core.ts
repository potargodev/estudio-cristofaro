// Stock simple (§2.q etapa 7): funciones puras. La existencia y la valuación
// salen de reproducir los movimientos en orden (último costo y promedio
// ponderado), a cualquier fecha, también pasada. Las sugerencias de vínculo
// entre una publicación de una tienda (o un ítem de un proveedor) y el
// producto propio salen del código, de lo aprendido y de la similitud del
// nombre. Archivo sin "server-only": lo usan las pruebas y las pantallas.

export interface Move {
  productId: string;
  depositId: string;
  at: string;
  kind: string;
  qty: number;
  unitCost: number | null;
}

interface Valued {
  productId: string;
  qty: number;
  byDeposit: Record<string, number>;
  lastCost: number;
  avgCost: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Existencia, último costo y costo promedio ponderado de cada producto hasta una fecha (inclusive) */
export function valuate(moves: Move[], until?: string | null, initialCost: Record<string, number> = {}): Map<string, Valued> {
  const out = new Map<string, Valued>();
  const sorted = [...moves].sort((a, b) => a.at.localeCompare(b.at));
  for (const m of sorted) {
    if (until && m.at.slice(0, 10) > until) break;
    const v = out.get(m.productId) ?? { productId: m.productId, qty: 0, byDeposit: {}, lastCost: initialCost[m.productId] ?? 0, avgCost: initialCost[m.productId] ?? 0 };
    if (m.qty > 0 && m.unitCost != null && m.unitCost > 0 && ["compra", "inicial", "ajuste", "conteo"].includes(m.kind)) {
      const base = Math.max(0, v.qty);
      v.avgCost = base + m.qty > 0 ? r2((base * v.avgCost + m.qty * m.unitCost) / (base + m.qty)) : m.unitCost;
      v.lastCost = m.unitCost;
    }
    v.qty = r3(v.qty + m.qty);
    v.byDeposit[m.depositId] = r3((v.byDeposit[m.depositId] ?? 0) + m.qty);
    out.set(m.productId, v);
  }
  return out;
}

export type Method = "ultimo" | "promedio";

/** Valor del inventario a una fecha con el método elegido */
export function inventoryValue(v: Map<string, Valued>, method: Method) {
  let total = 0;
  const rows = [...v.values()].map((x) => {
    const unit = method === "ultimo" ? x.lastCost : x.avgCost;
    const value = r2(Math.max(0, x.qty) * unit);
    total += value;
    return { ...x, unit, value };
  });
  return { rows, total: r2(total) };
}

const SALE = ["venta", "venta_tienda"];
const RETURN = ["devolucion", "anulacion"];

/**
 * Costo de la mercadería vendida estimado del período: cada venta al costo
 * promedio del momento, menos las devoluciones. Es una estimación de gestión.
 */
export function cmv(moves: Move[], from: string, to: string, initialCost: Record<string, number> = {}) {
  const state = new Map<string, { qty: number; avg: number }>();
  let total = 0;
  let units = 0;
  const sorted = [...moves].sort((a, b) => a.at.localeCompare(b.at));
  for (const m of sorted) {
    const day = m.at.slice(0, 10);
    if (day > to) break;
    const s = state.get(m.productId) ?? { qty: 0, avg: initialCost[m.productId] ?? 0 };
    if (m.qty > 0 && m.unitCost != null && m.unitCost > 0 && ["compra", "inicial", "ajuste", "conteo"].includes(m.kind)) {
      const base = Math.max(0, s.qty);
      s.avg = base + m.qty > 0 ? (base * s.avg + m.qty * m.unitCost) / (base + m.qty) : m.unitCost;
    }
    if (day >= from && (SALE.includes(m.kind) || RETURN.includes(m.kind))) {
      total += -m.qty * s.avg;
      units += -m.qty;
    }
    s.qty += m.qty;
    state.set(m.productId, s);
  }
  return { total: r2(total), units: r3(units) };
}

/** Lo que se publica en una tienda: la existencia del depósito menos el margen de seguridad, nunca negativo */
export const availableToPublish = (qty: number, margin: number) => Math.max(0, Math.floor(qty - Math.max(0, margin)));

/** Texto normalizado para comparar (sin tildes, minúsculas, sin signos) */
export const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set(["de", "la", "el", "x", "con", "para", "y", "en", "por", "un", "una"]);
const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t)));

/** Parecido entre dos nombres (0 a 1): tokens en común, con las cifras (medidas, gramos) pesando más */
export function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  let weight = 0;
  for (const t of new Set([...ta, ...tb])) {
    const w = /\d/.test(t) ? 2 : 1;
    weight += w;
    if (ta.has(t) && tb.has(t)) common += w;
  }
  return Math.round((common / weight) * 1000) / 1000;
}

interface ProductRef {
  id: string;
  code: string;
  barcode: string | null;
  description: string;
}

interface Suggestion {
  productId: string;
  score: number;
  reason: string;
  /** Se vincula solo (código igual o aprendido); si no, queda como sugerencia para confirmar */
  auto: boolean;
  by: "sku" | "aprendido" | "sugerencia";
}

/** Producto propio para una publicación o un ítem: código o código de barras igual, lo aprendido o el nombre más parecido */
export function suggestProduct(item: { sku: string | null; title: string }, products: ProductRef[], aliases: { alias: string; productId: string }[]): Suggestion | null {
  const sku = norm(item.sku).replace(/ /g, "");
  if (sku) {
    const p = products.find((x) => norm(x.code).replace(/ /g, "") === sku || (x.barcode && norm(x.barcode).replace(/ /g, "") === sku));
    if (p) return { productId: p.id, score: 1, reason: `El código ${item.sku} coincide con el del producto`, auto: true, by: "sku" };
  }
  const keys = [sku ? `sku:${sku}` : null, `nombre:${norm(item.title)}`].filter(Boolean) as string[];
  const learned = aliases.find((a) => keys.includes(a.alias));
  if (learned && products.some((p) => p.id === learned.productId)) return { productId: learned.productId, score: 1, reason: "Aprendido de un vínculo anterior", auto: true, by: "aprendido" };
  let best: Suggestion | null = null;
  for (const p of products) {
    const sc = similarity(item.title, p.description);
    if (sc >= 0.5 && (!best || sc > best.score)) best = { productId: p.id, score: sc, reason: `Nombre parecido a «${p.description}» (${Math.round(sc * 100)} %)`, auto: false, by: "sugerencia" };
  }
  return best;
}

/** Claves que se aprenden al vincular a mano */
export const aliasKeys = (item: { sku: string | null; title: string }) => [norm(item.sku) ? `sku:${norm(item.sku).replace(/ /g, "")}` : null, `nombre:${norm(item.title)}`].filter(Boolean) as string[];

export const MOVE_LABEL: Record<string, string> = {
  compra: "Compra",
  venta: "Venta facturada",
  venta_tienda: "Venta en tienda",
  devolucion: "Devolución",
  anulacion: "Cancelación",
  ajuste: "Ajuste manual",
  conteo: "Ajuste por conteo",
  inicial: "Existencia inicial",
};
