import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { getDb } from "@/db";
import { memberships, organization_modules, organizations, smart_documents, stock_aliases, stock_conflicts, stock_counts, stock_deposits, stock_listings, stock_movements, stock_products, stock_publications, stock_store_orders, stock_stores, stock_unlinked, studios, supplier_rules, users, type invoices } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { hasModule } from "@/lib/faro/entitlements";
import { UUID } from "@/lib/ids";
import { mailLayout } from "@/lib/notify";
import { can, type OrgRole } from "@/lib/permissions";
import { notify } from "@/modules/notifications/server";
import { adapterFor, isPlatform, PLATFORMS, StoreError, toOrder, type Platform, type RemoteOrder } from "./adapters";
import { aliasKeys, availableToPublish, cmv, inventoryValue, norm, similarity, suggestProduct, valuate, type Method, type Move } from "./core";

// Stock simple del lado del servidor (§2.q etapa 7). Toda query filtra por
// estudio y organización; los IDs del navegador se vuelven a validar. Los
// movimientos son la única fuente de la existencia; los automáticos (compras
// leídas, ventas facturadas, ventas de tiendas, devoluciones) llevan una clave
// de idempotencia para no contar dos veces lo mismo. La sincronización hacia
// las tiendas está apagada por defecto, solo publica lo vinculado, nunca pisa
// una diferencia (la deja como conflicto) y queda en un registro.

const db = () => getDb();
export interface StockScope {
  studioId: string;
  organizationId: string;
  canManage: boolean;
}
type Actor = { id: string; email: string; name?: string };

export class StockError extends Error {}

const MAX_DEPOSITS = 3;
const n = (v: unknown) => Number(v ?? 0) || 0;

function manage(s: StockScope) {
  if (!s.canManage) throw new StockError("No tenés permiso para administrar el stock.");
}

/** El estudio tiene Stock en el plan y, en un estudio, la organización lo tiene activo (Plan y módulos) */
export async function stockEnabled(studioId: string, organizationId: string) {
  if (!(await hasModule(studioId, "stock"))) return false;
  const [t] = await db().select({ kind: studios.kind }).from(studios).where(eq(studios.id, studioId));
  if (t?.kind !== "studio") return true;
  const [m] = await db().select({ active: organization_modules.active }).from(organization_modules).where(and(eq(organization_modules.organization_id, organizationId), eq(organization_modules.module_key, "stock")));
  return !!m?.active;
}

async function requireStock(s: StockScope) {
  const [o] = await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, s.organizationId), eq(organizations.studio_id, s.studioId)));
  if (!o) throw new StockError("No encontramos esa organización.");
  if (!(await stockEnabled(s.studioId, s.organizationId))) throw new StockError("El módulo Stock no está activo para esta organización.");
}

// ───────────── Depósitos y productos ─────────────

export async function deposits(s: StockScope) {
  const rows = await db().select().from(stock_deposits).where(and(eq(stock_deposits.studio_id, s.studioId), eq(stock_deposits.organization_id, s.organizationId))).orderBy(asc(stock_deposits.position), asc(stock_deposits.created_at));
  if (rows.length) return rows;
  const [d] = await db().insert(stock_deposits).values({ studio_id: s.studioId, organization_id: s.organizationId, name: "Depósito principal" }).onConflictDoNothing().returning();
  return d ? [d] : db().select().from(stock_deposits).where(eq(stock_deposits.organization_id, s.organizationId));
}

export async function saveDeposit(s: StockScope, actor: Actor, name: string) {
  manage(s);
  await requireStock(s);
  const list = await deposits(s);
  const clean = name.trim().slice(0, 60);
  if (clean.length < 2) throw new StockError("Poné el nombre del depósito.");
  if (list.length >= MAX_DEPOSITS) throw new StockError(`Hasta ${MAX_DEPOSITS} depósitos por organización.`);
  if (list.some((d) => norm(d.name) === norm(clean))) throw new StockError("Ya hay un depósito con ese nombre.");
  const [d] = await db().insert(stock_deposits).values({ studio_id: s.studioId, organization_id: s.organizationId, name: clean, position: list.length }).returning();
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.deposito", entityType: "deposito", entityId: d.id, metadata: { nombre: clean } });
  return d;
}

async function ownDeposit(s: StockScope, id: string | null | undefined) {
  const list = await deposits(s);
  if (!id) return list[0];
  const d = list.find((x) => x.id === id);
  if (!d) throw new StockError("Ese depósito no es de la organización.");
  return d;
}

async function ownProduct(s: StockScope, id: string) {
  if (!UUID.test(id)) throw new StockError("Producto inválido.");
  const [p] = await db().select().from(stock_products).where(and(eq(stock_products.id, id), eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId)));
  if (!p) throw new StockError("No encontramos ese producto.");
  return p;
}

async function movesOf(s: StockScope, productIds?: string[]): Promise<Move[]> {
  const rows = await db()
    .select({ productId: stock_movements.product_id, depositId: stock_movements.deposit_id, at: stock_movements.at, kind: stock_movements.kind, qty: stock_movements.qty, unitCost: stock_movements.unit_cost })
    .from(stock_movements)
    .where(and(eq(stock_movements.studio_id, s.studioId), eq(stock_movements.organization_id, s.organizationId), productIds ? inArray(stock_movements.product_id, productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]) : undefined));
  return rows.map((r) => ({ productId: r.productId, depositId: r.depositId, at: r.at.toISOString(), kind: r.kind, qty: Number(r.qty), unitCost: r.unitCost == null ? null : Number(r.unitCost) }));
}

/** Productos con su existencia por depósito y su valuación de hoy */
export async function listProducts(s: StockScope, q?: string | null) {
  const products = await db().select().from(stock_products).where(and(eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId))).orderBy(asc(stock_products.description));
  const v = valuate(await movesOf(s), null, Object.fromEntries(products.map((p) => [p.id, Number(p.cost)])));
  const query = norm(q);
  return products
    .filter((p) => !query || norm(`${p.code} ${p.barcode ?? ""} ${p.description}`).includes(query))
    .map((p) => {
      const x = v.get(p.id);
      const qty = x?.qty ?? 0;
      return { p, qty, byDeposit: x?.byDeposit ?? {}, lastCost: x?.lastCost ?? Number(p.cost), avgCost: x?.avgCost ?? Number(p.cost), low: p.min_stock != null && qty < Number(p.min_stock) };
    });
}

interface ProductInput {
  code: string;
  barcode: string | null;
  description: string;
  unit: string;
  ivaRate: number;
  cost: number;
  price: number;
  minStock: number | null;
}

function cleanProduct(i: ProductInput) {
  const code = i.code.trim().slice(0, 40);
  const description = i.description.trim().slice(0, 160);
  if (!code || description.length < 2) throw new StockError("Cargá el código y la descripción.");
  if (![0, 2.5, 5, 10.5, 21, 27].includes(Number(i.ivaRate))) throw new StockError("Alícuota de IVA inválida.");
  if (!(i.cost >= 0) || !(i.price >= 0)) throw new StockError("Revisá el costo y el precio.");
  return { code, barcode: i.barcode?.replace(/\s/g, "").slice(0, 40) || null, description, unit: i.unit.trim().slice(0, 20) || "unidad", iva_rate: String(i.ivaRate), cost: String(i.cost), price: String(i.price), min_stock: i.minStock == null || !(i.minStock >= 0) ? null : String(i.minStock) };
}

export async function saveProduct(s: StockScope, actor: Actor, i: ProductInput, id?: string | null) {
  manage(s);
  await requireStock(s);
  const v = cleanProduct(i);
  const [dup] = await db().select({ id: stock_products.id }).from(stock_products).where(and(eq(stock_products.organization_id, s.organizationId), eq(stock_products.code, v.code)));
  if (dup && dup.id !== id) throw new StockError("Ya hay un producto con ese código.");
  let pid: string;
  if (id) {
    const cur = await ownProduct(s, id);
    await db().update(stock_products).set(v).where(eq(stock_products.id, cur.id));
    pid = cur.id;
  } else {
    const [r] = await db().insert(stock_products).values({ ...v, studio_id: s.studioId, organization_id: s.organizationId }).returning({ id: stock_products.id });
    pid = r.id;
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: id ? "stock.producto_editado" : "stock.producto", entityType: "producto", entityId: pid, metadata: { codigo: v.code } });
  return pid;
}

/** Movimiento con clave de idempotencia: si ya existe, no hace nada y devuelve false */
async function move(s: { studioId: string; organizationId: string }, m: { productId: string; depositId: string; kind: string; qty: number; unitCost?: number | null; sourceType: string; sourceId?: string | null; idem?: string | null; reason?: string | null; actorId?: string | null; at?: Date }) {
  if (!m.qty) return false;
  const r = await db()
    .insert(stock_movements)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, product_id: m.productId, deposit_id: m.depositId, kind: m.kind, qty: String(m.qty), unit_cost: m.unitCost == null ? null : String(m.unitCost), source_type: m.sourceType, source_id: m.sourceId ?? null, idem_key: m.idem ?? null, reason: m.reason ?? null, actor_id: m.actorId ?? null, at: m.at ?? new Date() })
    .onConflictDoNothing()
    .returning({ id: stock_movements.id });
  if (r.length && m.unitCost != null && m.unitCost > 0 && m.kind === "compra") await db().update(stock_products).set({ cost: String(m.unitCost) }).where(eq(stock_products.id, m.productId));
  return r.length > 0;
}

const KEYS: Record<string, string[]> = {
  code: ["codigo", "cod", "sku", "articulo"],
  barcode: ["codigo de barras", "codigo barras", "ean", "barcode"],
  description: ["descripcion", "producto", "nombre", "detalle"],
  unit: ["unidad", "um"],
  iva: ["alicuota", "iva", "alicuota iva"],
  cost: ["costo", "costo unitario"],
  price: ["precio", "precio de venta", "precio venta"],
  min: ["minimo", "stock minimo"],
  qty: ["existencia", "stock", "cantidad"],
};
const num = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const t = String(v).trim().replace(/\$/g, "");
  const x = Number(/,\d{1,3}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(x) ? x : null;
};

async function readTable(file: File): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return (await readSheet(Buffer.from(await file.arrayBuffer()))) as unknown[][];
  if (!name.endsWith(".csv") && !name.endsWith(".txt")) throw new StockError("Subí un archivo .xlsx o .csv.");
  const text = await file.text();
  const head = text.split("\n")[0];
  const sep = (head.match(/;/g)?.length ?? 0) >= (head.match(/,/g)?.length ?? 0) ? ";" : ",";
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));
}

/** Importación de productos (Excel o CSV). Con la columna «existencia», carga la existencia inicial */
export async function importProducts(s: StockScope, actor: Actor, file: File) {
  manage(s);
  await requireStock(s);
  const [head, ...rows] = await readTable(file);
  if (!head) throw new StockError("El archivo está vacío.");
  const h = head.map((x) => norm(String(x ?? "")));
  const col = (k: string) => h.findIndex((x) => KEYS[k].includes(x));
  const c = Object.fromEntries(Object.keys(KEYS).map((k) => [k, col(k)])) as Record<string, number>;
  if (c.code < 0 || c.description < 0) throw new StockError("El encabezado tiene que tener código y descripción.");
  const dep = (await deposits(s))[0];
  let created = 0;
  let updated = 0;
  const errors: { row: number; error: string }[] = [];
  for (const [idx, r] of rows.entries()) {
    if (!r || r.every((x) => x == null || String(x).trim() === "")) continue;
    const get = (k: string) => (c[k] >= 0 ? r[c[k]] : null);
    try {
      const v = cleanProduct({ code: String(get("code") ?? ""), barcode: get("barcode") ? String(get("barcode")) : null, description: String(get("description") ?? ""), unit: String(get("unit") ?? "unidad"), ivaRate: num(get("iva")) ?? 21, cost: num(get("cost")) ?? 0, price: num(get("price")) ?? 0, minStock: num(get("min")) });
      const [cur] = await db().select({ id: stock_products.id }).from(stock_products).where(and(eq(stock_products.organization_id, s.organizationId), eq(stock_products.code, v.code)));
      let pid = cur?.id;
      if (cur) {
        await db().update(stock_products).set(v).where(eq(stock_products.id, cur.id));
        updated++;
      } else {
        const [x] = await db().insert(stock_products).values({ ...v, studio_id: s.studioId, organization_id: s.organizationId, source: "importacion" }).returning({ id: stock_products.id });
        pid = x.id;
        created++;
      }
      const q = num(get("qty"));
      if (q != null && q !== 0) await move(s, { productId: pid!, depositId: dep.id, kind: "inicial", qty: q, unitCost: Number(v.cost) || null, sourceType: "import", idem: `inicial:${pid}`, actorId: actor.id });
    } catch (e) {
      errors.push({ row: idx + 2, error: (e as Error).message });
    }
  }
  await checkLow(s);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.importacion", entityType: "organizacion", entityId: s.organizationId, metadata: { nuevos: created, actualizados: updated, errores: errors.length, archivo: file.name.slice(0, 80) } });
  return { created, updated, errors };
}

/** Ajuste manual: con motivo y auditado */
export async function adjust(s: StockScope, actor: Actor, i: { productId: string; depositId: string | null; qty: number; reason: string; unitCost?: number | null }) {
  manage(s);
  await requireStock(s);
  const p = await ownProduct(s, i.productId);
  const d = await ownDeposit(s, i.depositId);
  if (!i.qty || !Number.isFinite(i.qty)) throw new StockError("Cargá la cantidad (positiva para sumar, negativa para restar).");
  if (i.reason.trim().length < 3) throw new StockError("El ajuste necesita un motivo.");
  await move(s, { productId: p.id, depositId: d.id, kind: "ajuste", qty: i.qty, unitCost: i.qty > 0 ? (i.unitCost ?? Number(p.cost)) : null, sourceType: "manual", reason: i.reason.trim().slice(0, 200), actorId: actor.id });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.ajuste", entityType: "producto", entityId: p.id, metadata: { cantidad: i.qty, deposito: d.name, motivo: i.reason.trim().slice(0, 200) } });
  await checkLow(s, [p.id]);
}

/** Cierra un conteo físico: compara lo contado (por código, código de barras o ID) con lo esperado y ajusta las diferencias */
export async function closeCount(s: StockScope, actor: Actor, depositId: string | null, lines: { ref: string; counted: number }[]) {
  manage(s);
  await requireStock(s);
  const d = await ownDeposit(s, depositId);
  const products = await db().select().from(stock_products).where(and(eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId)));
  const v = valuate(await movesOf(s));
  const out: { productId: string; counted: number; expected: number }[] = [];
  const unknown: string[] = [];
  for (const l of lines.slice(0, 2000)) {
    const ref = String(l.ref ?? "").trim();
    const p = products.find((x) => x.id === ref || x.code === ref || (x.barcode && x.barcode === ref));
    if (!p) {
      unknown.push(ref);
      continue;
    }
    const counted = Number(l.counted);
    if (!(counted >= 0)) continue;
    const prev = out.find((x) => x.productId === p.id);
    if (prev) prev.counted += counted;
    else out.push({ productId: p.id, counted, expected: v.get(p.id)?.byDeposit[d.id] ?? 0 });
  }
  if (!out.length) throw new StockError("No hay productos contados reconocidos.");
  const [c] = await db().insert(stock_counts).values({ studio_id: s.studioId, organization_id: s.organizationId, deposit_id: d.id, lines: out, created_by: actor.id }).returning({ id: stock_counts.id });
  let adjusted = 0;
  for (const x of out) {
    const diff = Math.round((x.counted - x.expected) * 1000) / 1000;
    if (diff && (await move(s, { productId: x.productId, depositId: d.id, kind: "conteo", qty: diff, unitCost: diff > 0 ? v.get(x.productId)?.avgCost ?? null : null, sourceType: "count", sourceId: c.id, idem: `conteo:${c.id}:${x.productId}`, reason: "Diferencia de conteo", actorId: actor.id }))) adjusted++;
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.conteo", entityType: "conteo", entityId: c.id, metadata: { deposito: d.name, productos: out.length, ajustes: adjusted, desconocidos: unknown.length } });
  await checkLow(s, out.map((x) => x.productId));
  return { countId: c.id, products: out.length, adjusted, unknown };
}

export async function listMovements(s: StockScope, limit = 100) {
  return db()
    .select({ m: stock_movements, code: stock_products.code, description: stock_products.description, deposit: stock_deposits.name })
    .from(stock_movements)
    .innerJoin(stock_products, eq(stock_products.id, stock_movements.product_id))
    .innerJoin(stock_deposits, eq(stock_deposits.id, stock_movements.deposit_id))
    .where(and(eq(stock_movements.studio_id, s.studioId), eq(stock_movements.organization_id, s.organizationId)))
    .orderBy(desc(stock_movements.at), desc(stock_movements.created_at))
    .limit(limit);
}

/** Inventario valorizado a una fecha (también pasada), por último costo o promedio ponderado */
export async function inventory(s: StockScope, date: string, method: Method) {
  const products = await db().select().from(stock_products).where(and(eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId)));
  const v = valuate(await movesOf(s), date, Object.fromEntries(products.map((p) => [p.id, Number(p.cost)])));
  const inv = inventoryValue(v, method);
  const by = new Map(products.map((p) => [p.id, p]));
  return { date, method, total: inv.total, rows: inv.rows.filter((r) => by.has(r.productId)).map((r) => ({ ...r, unitCost: r.unit, code: by.get(r.productId)!.code, description: by.get(r.productId)!.description, unit: by.get(r.productId)!.unit })).sort((a, b) => a.description.localeCompare(b.description)) };
}

export async function cmvOf(s: StockScope, from: string, to: string) {
  const products = await db().select({ id: stock_products.id, cost: stock_products.cost }).from(stock_products).where(and(eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId)));
  return cmv(await movesOf(s), from, to, Object.fromEntries(products.map((p) => [p.id, Number(p.cost)])));
}

/** Más vendidos de un período (facturado y tiendas, menos devoluciones) */
export async function topSellers(s: StockScope, from: string, to: string, limit = 10) {
  const rows = await db()
    .select({ id: stock_products.id, code: stock_products.code, description: stock_products.description, units: sql<string>`-sum(${stock_movements.qty})` })
    .from(stock_movements)
    .innerJoin(stock_products, eq(stock_products.id, stock_movements.product_id))
    .where(and(eq(stock_movements.studio_id, s.studioId), eq(stock_movements.organization_id, s.organizationId), inArray(stock_movements.kind, ["venta", "venta_tienda", "devolucion", "anulacion"]), gte(stock_movements.at, new Date(`${from}T03:00:00Z`)), lte(stock_movements.at, new Date(Date.parse(`${to}T03:00:00Z`) + 86400000))))
    .groupBy(stock_products.id, stock_products.code, stock_products.description)
    .orderBy(desc(sql`-sum(${stock_movements.qty})`))
    .limit(limit);
  return rows.map((r) => ({ ...r, units: Number(r.units) })).filter((r) => r.units > 0);
}

// ───────────── Alertas de stock mínimo ─────────────

async function recipients(studioId: string, organizationId: string) {
  const [t] = await db().select({ kind: studios.kind }).from(studios).where(eq(studios.id, studioId));
  if (t?.kind !== "studio") return db().select({ id: users.id, email: users.email }).from(users).where(and(eq(users.studioId, studioId), eq(users.role, "titular"), eq(users.active, true)));
  const rows = await db().select({ id: users.id, email: users.email, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.user_id)).where(and(eq(memberships.organization_id, organizationId), eq(memberships.studio_id, studioId), eq(memberships.status, "activa")));
  return rows.filter((r) => can(r.role as OrgRole, "finanzas.gestionar"));
}

/** Avisa (app, mail y WhatsApp) los productos que quedaron debajo del mínimo; una vez hasta que se reponen */
async function checkLow(s: { studioId: string; organizationId: string }, productIds?: string[]) {
  const products = await db().select().from(stock_products).where(and(eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId), eq(stock_products.active, true), sql`${stock_products.min_stock} is not null`, productIds ? inArray(stock_products.id, productIds.length ? productIds : ["00000000-0000-0000-0000-000000000000"]) : undefined));
  if (!products.length) return 0;
  const v = valuate(await movesOf({ ...s, canManage: false }, products.map((p) => p.id)));
  const low = products.filter((p) => (v.get(p.id)?.qty ?? 0) < Number(p.min_stock));
  const ok = products.filter((p) => p.alerted_at && (v.get(p.id)?.qty ?? 0) >= Number(p.min_stock));
  if (ok.length) await db().update(stock_products).set({ alerted_at: null }).where(inArray(stock_products.id, ok.map((p) => p.id)));
  const fresh = low.filter((p) => !p.alerted_at);
  if (!fresh.length) return 0;
  await db().update(stock_products).set({ alerted_at: new Date() }).where(inArray(stock_products.id, fresh.map((p) => p.id)));
  const to = await recipients(s.studioId, s.organizationId);
  const list = fresh.map((p) => `${p.description} (${v.get(p.id)?.qty ?? 0} ${p.unit}; mínimo ${Number(p.min_stock)})`);
  const title = fresh.length === 1 ? `Stock bajo: ${fresh[0].description}` : `${fresh.length} productos debajo del mínimo`;
  await notify(to.map((u) => u.id), { kind: "aviso", title, body: list.join(" · "), href: null });
  for (const u of to) if (u.email) await sendMail({ to: u.email, subject: title, html: mailLayout(title, `<p>${list.map(esc).join("<br>")}</p>`, undefined, "Faro") }).catch(() => null);
  const { notifyUserWhatsApp } = await import("@/modules/whatsapp/server");
  for (const u of to) await notifyUserWhatsApp(s.studioId, u.id, `${title}: ${list.slice(0, 3).join("; ")}.`).catch(() => 0);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor: null, actorLabel: "Alerta de stock", action: "stock.alerta", entityType: "organizacion", entityId: s.organizationId, metadata: { productos: fresh.length, destinatarios: to.length } });
  return fresh.length;
}

export async function belowMinimum(s: StockScope) {
  return (await listProducts(s)).filter((x) => x.low);
}

// ───────────── Movimientos automáticos ─────────────

interface PurchaseItem {
  descripcion?: string | null;
  codigo?: string | null;
  cantidad?: number | null;
  precio_unitario?: number | null;
}

/** Compra confirmada en la lectura: suma lo vinculado (por lo aprendido del proveedor, el código o el nombre) */
export async function onPurchaseConfirmed(scope: { studioId: string; organizationId: string }, doc: { id: string; cuit: string | null; kind: string; items: PurchaseItem[]; productLinks: Record<string, string> }, actorId: string | null) {
  if (!(await stockEnabled(scope.studioId, scope.organizationId))) return { added: 0, unlinked: 0 };
  const s = { ...scope, canManage: true };
  const dep = (await deposits(s))[0];
  const products = await db().select({ id: stock_products.id, code: stock_products.code, barcode: stock_products.barcode, description: stock_products.description }).from(stock_products).where(and(eq(stock_products.studio_id, s.studioId), eq(stock_products.organization_id, s.organizationId)));
  const aliases = (await db().select({ alias: stock_aliases.alias, productId: stock_aliases.product_id }).from(stock_aliases).where(eq(stock_aliases.organization_id, s.organizationId))).map((a) => ({ alias: a.alias.replace(/^proveedor:\d+:/, ""), productId: a.productId, raw: a.alias }));
  const sign = doc.kind === "nota_credito" ? -1 : 1;
  // Lo aprendido del proveedor en la lectura (código del proveedor → producto propio)
  const [rule] = doc.cuit ? await db().select({ rule: supplier_rules.rule }).from(supplier_rules).where(and(eq(supplier_rules.studio_id, s.studioId), eq(supplier_rules.organization_id, s.organizationId), eq(supplier_rules.supplier_cuit, doc.cuit))) : [];
  const learnedLinks = (rule?.rule.productLinks as Record<string, string> | undefined) ?? {};
  let added = 0;
  let unlinked = 0;
  for (const [i, it] of doc.items.entries()) {
    const qty = Number(it.cantidad) || 0;
    if (!(qty > 0)) continue;
    const linked = it.codigo ? (doc.productLinks[it.codigo] ?? learnedLinks[it.codigo]) : undefined;
    const supplierAlias = doc.cuit && it.codigo ? aliases.find((a) => a.raw === `proveedor:${doc.cuit}:${norm(it.codigo).replace(/ /g, "")}`) : undefined;
    const sug = suggestProduct({ sku: it.codigo ?? null, title: it.descripcion ?? "" }, products, aliases.filter((a) => !a.raw.startsWith("proveedor:")));
    const productId = (linked && products.some((p) => p.id === linked) ? linked : null) ?? supplierAlias?.productId ?? (sug?.auto ? sug.productId : null);
    if (!productId) {
      unlinked++;
      continue;
    }
    if (await move(s, { productId, depositId: dep.id, kind: sign > 0 ? "compra" : "devolucion", qty: sign * qty, unitCost: sign > 0 ? Number(it.precio_unitario) || null : null, sourceType: "smart_document", sourceId: doc.id, idem: `compra:${doc.id}:${i}`, actorId })) added++;
  }
  if (added) await checkLow(s);
  return { added, unlinked };
}

/** Compras confirmadas con ítems que todavía no están vinculados a un producto */
export async function unlinkedPurchases(s: StockScope) {
  const docs = await db()
    .select({ id: smart_documents.id, extracted: smart_documents.extracted, decisions: smart_documents.decisions, cuit: smart_documents.supplier_cuit, confirmedAt: smart_documents.confirmed_at })
    .from(smart_documents)
    .where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.status, "confirmado"), gte(smart_documents.confirmed_at, new Date(Date.now() - 120 * 86400000))))
    .orderBy(desc(smart_documents.confirmed_at))
    .limit(200);
  const done = new Set((await db().select({ k: stock_movements.idem_key }).from(stock_movements).where(and(eq(stock_movements.organization_id, s.organizationId), eq(stock_movements.source_type, "smart_document")))).map((r) => r.k));
  const products = await db().select({ id: stock_products.id, code: stock_products.code, barcode: stock_products.barcode, description: stock_products.description }).from(stock_products).where(eq(stock_products.organization_id, s.organizationId));
  const out: { docId: string; line: number; supplier: string | null; cuit: string | null; code: string | null; description: string; qty: number; price: number | null; suggestion: ReturnType<typeof suggestProduct> }[] = [];
  for (const d of docs) {
    const e = d.extracted as { razon_social_emisor?: string; items?: PurchaseItem[] } | null;
    for (const [i, it] of (e?.items ?? []).entries()) {
      if (!(Number(it.cantidad) > 0) || done.has(`compra:${d.id}:${i}`)) continue;
      out.push({ docId: d.id, line: i, supplier: e?.razon_social_emisor ?? null, cuit: d.cuit, code: it.codigo ?? null, description: it.descripcion ?? "", qty: Number(it.cantidad), price: it.precio_unitario ?? null, suggestion: suggestProduct({ sku: it.codigo ?? null, title: it.descripcion ?? "" }, products, []) });
    }
  }
  return out;
}

/**
 * Vincula un ítem de una compra a un producto (o lo crea desde la compra):
 * aprende la equivalencia del proveedor (Stock y la regla de la lectura) y
 * suma la compra.
 */
export async function linkPurchaseItem(s: StockScope, actor: Actor, docId: string, line: number, productId: string | "nuevo") {
  manage(s);
  await requireStock(s);
  if (!UUID.test(docId)) throw new StockError("Comprobante inválido.");
  const [d] = await db().select().from(smart_documents).where(and(eq(smart_documents.id, docId), eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.status, "confirmado")));
  if (!d) throw new StockError("No encontramos esa compra.");
  const e = d.extracted as { tipo_documento?: string; items?: PurchaseItem[] };
  const it = e.items?.[line];
  if (!it) throw new StockError("Ese ítem no existe.");
  let pid: string;
  if (productId === "nuevo") {
    const code = (it.codigo?.trim() || `P-${randomBytes(3).toString("hex").toUpperCase()}`).slice(0, 40);
    const [dup] = await db().select({ id: stock_products.id }).from(stock_products).where(and(eq(stock_products.organization_id, s.organizationId), eq(stock_products.code, code)));
    pid = dup?.id ?? (await db().insert(stock_products).values({ studio_id: s.studioId, organization_id: s.organizationId, code, description: (it.descripcion ?? code).slice(0, 160), cost: String(Number(it.precio_unitario) || 0), source: "compra" }).returning({ id: stock_products.id }))[0].id;
  } else pid = (await ownProduct(s, productId)).id;
  if (d.supplier_cuit && it.codigo) {
    await db().insert(stock_aliases).values({ studio_id: s.studioId, organization_id: s.organizationId, alias: `proveedor:${d.supplier_cuit}:${norm(it.codigo).replace(/ /g, "")}`, product_id: pid, source: "proveedor", created_by: actor.id }).onConflictDoUpdate({ target: [stock_aliases.organization_id, stock_aliases.alias], set: { product_id: pid } });
    const [rule] = await db().select().from(supplier_rules).where(and(eq(supplier_rules.studio_id, s.studioId), eq(supplier_rules.organization_id, s.organizationId), eq(supplier_rules.supplier_cuit, d.supplier_cuit)));
    if (rule) await db().update(supplier_rules).set({ rule: { ...rule.rule, productLinks: { ...((rule.rule.productLinks as Record<string, string>) ?? {}), [it.codigo]: pid } } }).where(eq(supplier_rules.id, rule.id));
  }
  const dep = (await deposits(s))[0];
  const sign = e.tipo_documento === "nota_credito" ? -1 : 1;
  await move(s, { productId: pid, depositId: dep.id, kind: sign > 0 ? "compra" : "devolucion", qty: sign * (Number(it.cantidad) || 0), unitCost: sign > 0 ? Number(it.precio_unitario) || null : null, sourceType: "smart_document", sourceId: d.id, idem: `compra:${d.id}:${line}`, actorId: actor.id });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.vincular", entityType: "producto", entityId: pid, metadata: { origen: "compra", codigo_proveedor: it.codigo ?? null } });
  return pid;
}

type InvoiceRow = typeof invoices.$inferSelect;

/** Venta facturada en Faro: resta; una nota de crédito devuelve. Lo que no se reconoce queda en «Ventas sin vincular» */
export async function onInvoiceAuthorized(inv: InvoiceRow) {
  if (!(await stockEnabled(inv.studio_id, inv.organization_id))) return { moved: 0, unlinked: 0 };
  const s = { studioId: inv.studio_id, organizationId: inv.organization_id, canManage: true };
  const { CBTE_TYPES } = await import("@/modules/arca/config");
  const kind = CBTE_TYPES[inv.cbte_type]?.kind;
  if (kind === "nota_debito") return { moved: 0, unlinked: 0 };
  const dep = (await deposits(s))[0];
  const products = await db().select({ id: stock_products.id, code: stock_products.code, barcode: stock_products.barcode, description: stock_products.description }).from(stock_products).where(eq(stock_products.organization_id, s.organizationId));
  const aliases = (await db().select({ alias: stock_aliases.alias, productId: stock_aliases.product_id }).from(stock_aliases).where(eq(stock_aliases.organization_id, s.organizationId))).map((a) => ({ alias: a.alias, productId: a.productId }));
  let moved = 0;
  let unlinked = 0;
  for (const [i, it] of inv.items.entries()) {
    const code = it.code ?? null;
    const sug = suggestProduct({ sku: code, title: it.description }, products, aliases);
    const exact = products.find((p) => norm(p.description) === norm(it.description));
    const productId = sug?.auto ? sug.productId : (exact?.id ?? null);
    if (!productId) {
      await db().insert(stock_unlinked).values({ studio_id: s.studioId, organization_id: s.organizationId, source_type: "factura", source_id: inv.id, line: i, sku: code, title: it.description.slice(0, 160), qty: String(kind === "nota_credito" ? -it.quantity : it.quantity) }).onConflictDoNothing();
      unlinked++;
      continue;
    }
    if (await move(s, { productId, depositId: dep.id, kind: kind === "nota_credito" ? "devolucion" : "venta", qty: kind === "nota_credito" ? it.quantity : -it.quantity, sourceType: "invoice", sourceId: inv.id, idem: `factura:${inv.id}:${i}` })) moved++;
  }
  if (moved) await checkLow(s);
  return { moved, unlinked };
}

// ───────────── Tiendas ─────────────

async function ownStore(s: StockScope, id: string) {
  if (!UUID.test(id)) throw new StockError("Tienda inválida.");
  const [st] = await db().select().from(stock_stores).where(and(eq(stock_stores.id, id), eq(stock_stores.studio_id, s.studioId), eq(stock_stores.organization_id, s.organizationId)));
  if (!st) throw new StockError("No encontramos esa tienda.");
  return st;
}

export async function listStores(s: StockScope) {
  return db().select().from(stock_stores).where(and(eq(stock_stores.studio_id, s.studioId), eq(stock_stores.organization_id, s.organizationId))).orderBy(asc(stock_stores.created_at));
}

/** Conecta una tienda (contra el simulador mientras no estén las APIs reales) y trae sus publicaciones */
export async function connectStore(s: StockScope, actor: Actor, i: { platform: string; name: string; shopId: string; depositId: string | null }) {
  manage(s);
  await requireStock(s);
  if (!isPlatform(i.platform)) throw new StockError("Elegí la plataforma.");
  const shop = i.shopId.trim().slice(0, 80);
  if (!shop) throw new StockError("Cargá el identificador de la tienda.");
  const dep = await ownDeposit(s, i.depositId);
  const [st] = await db().insert(stock_stores).values({ studio_id: s.studioId, organization_id: s.organizationId, platform: i.platform, name: i.name.trim().slice(0, 80) || PLATFORMS[i.platform].label, shop_id: shop, deposit_id: dep.id, webhook_token: randomBytes(24).toString("base64url"), created_by: actor.id }).returning();
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.tienda_conectada", entityType: "tienda", entityId: st.id, metadata: { plataforma: i.platform, tienda: shop } });
  if (PLATFORMS[i.platform].orders !== "importacion") await syncListings(s, st.id).catch((e) => db().update(stock_stores).set({ last_error: (e as Error).message }).where(eq(stock_stores.id, st.id)));
  return st;
}

/** Trae las publicaciones de la tienda y las vincula solas si el código coincide o ya se aprendió; si no, sugiere */
export async function syncListings(s: StockScope, storeId: string) {
  const st = await ownStore(s, storeId);
  const remote = await adapterFor(st.platform as Platform, st.shop_id).listings();
  const products = await db().select({ id: stock_products.id, code: stock_products.code, barcode: stock_products.barcode, description: stock_products.description }).from(stock_products).where(eq(stock_products.organization_id, s.organizationId));
  const aliases = (await db().select({ alias: stock_aliases.alias, productId: stock_aliases.product_id }).from(stock_aliases).where(eq(stock_aliases.organization_id, s.organizationId))).map((a) => ({ alias: a.alias, productId: a.productId }));
  const existing = await db().select().from(stock_listings).where(eq(stock_listings.store_id, st.id));
  for (const l of remote) {
    const cur = existing.find((x) => x.external_id === l.externalId);
    const sug = cur?.product_id ? null : suggestProduct({ sku: l.sku, title: l.title }, products, aliases);
    const linked = sug?.auto ? { product_id: sug.productId, linked_by: sug.by } : {};
    const suggested = sug && !sug.auto ? { suggested_product_id: sug.productId, suggestion_score: String(sug.score), suggestion_reason: sug.reason } : {};
    if (cur) await db().update(stock_listings).set({ sku: l.sku, title: l.title.slice(0, 200), remote_qty: String(l.qty), ...linked, ...suggested }).where(eq(stock_listings.id, cur.id));
    else await db().insert(stock_listings).values({ store_id: st.id, studio_id: s.studioId, organization_id: s.organizationId, external_id: l.externalId, sku: l.sku, title: l.title.slice(0, 200), remote_qty: String(l.qty), ...linked, ...suggested });
  }
  await db().update(stock_stores).set({ last_error: null }).where(eq(stock_stores.id, st.id));
  return remote.length;
}

/** Vincula (o desvincula) una publicación a un producto, aprende la equivalencia y procesa las ventas que esperaban */
export async function linkListing(s: StockScope, actor: Actor, listingId: string, productId: string | null) {
  manage(s);
  if (!UUID.test(listingId)) throw new StockError("Publicación inválida.");
  const [l] = await db().select().from(stock_listings).where(and(eq(stock_listings.id, listingId), eq(stock_listings.studio_id, s.studioId), eq(stock_listings.organization_id, s.organizationId)));
  if (!l) throw new StockError("No encontramos esa publicación.");
  if (!productId) {
    await db().update(stock_listings).set({ product_id: null, linked_by: null, last_published_qty: null }).where(eq(stock_listings.id, l.id));
    await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.desvincular", entityType: "publicacion", entityId: l.id });
    return 0;
  }
  const p = await ownProduct(s, productId);
  await db().update(stock_listings).set({ product_id: p.id, linked_by: "manual", suggested_product_id: null, suggestion_score: null, suggestion_reason: null }).where(eq(stock_listings.id, l.id));
  for (const alias of aliasKeys({ sku: l.sku, title: l.title })) await db().insert(stock_aliases).values({ studio_id: s.studioId, organization_id: s.organizationId, alias, product_id: p.id, source: "tienda", created_by: actor.id }).onConflictDoUpdate({ target: [stock_aliases.organization_id, stock_aliases.alias], set: { product_id: p.id } });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.vincular", entityType: "publicacion", entityId: l.id, metadata: { producto: p.code, origen: "tienda" } });
  return processPendingFor(s, l.store_id, l.external_id, p.id);
}

/** Ventas de una publicación que esperaban el vínculo: ahora descuentan (con la misma clave, nunca dos veces) */
async function processPendingFor(s: StockScope, storeId: string, externalId: string, productId: string) {
  const pending = await db().select().from(stock_unlinked).where(and(eq(stock_unlinked.organization_id, s.organizationId), eq(stock_unlinked.store_id, storeId), eq(stock_unlinked.listing_external_id, externalId), eq(stock_unlinked.status, "pendiente")));
  const [st] = await db().select().from(stock_stores).where(eq(stock_stores.id, storeId));
  const dep = st.deposit_id ?? (await deposits(s))[0].id;
  let n = 0;
  for (const u of pending) {
    if (await move(s, { productId, depositId: dep, kind: "venta_tienda", qty: -Number(u.qty), sourceType: "store_order", sourceId: u.source_id, idem: `tienda:${storeId}:${u.source_id}:${u.line}`, at: u.at })) n++;
    await db().update(stock_unlinked).set({ status: "vinculada" }).where(eq(stock_unlinked.id, u.id));
  }
  if (n) await checkLow(s, [productId]);
  return n;
}

export async function listUnlinked(s: StockScope) {
  return db().select({ u: stock_unlinked, store: stock_stores.name }).from(stock_unlinked).leftJoin(stock_stores, eq(stock_stores.id, stock_unlinked.store_id)).where(and(eq(stock_unlinked.studio_id, s.studioId), eq(stock_unlinked.organization_id, s.organizationId), eq(stock_unlinked.status, "pendiente"))).orderBy(desc(stock_unlinked.at)).limit(200);
}

/** Vincula una venta sin vincular: de tienda, vincula la publicación; de factura, aprende el nombre y descuenta */
export async function linkUnlinked(s: StockScope, actor: Actor, id: string, productId: string | null) {
  manage(s);
  if (!UUID.test(id)) throw new StockError("Venta inválida.");
  const [u] = await db().select().from(stock_unlinked).where(and(eq(stock_unlinked.id, id), eq(stock_unlinked.studio_id, s.studioId), eq(stock_unlinked.organization_id, s.organizationId)));
  if (!u || u.status !== "pendiente") throw new StockError("Esa venta ya no está sin vincular.");
  if (!productId) {
    await db().update(stock_unlinked).set({ status: "ignorada" }).where(eq(stock_unlinked.id, u.id));
    await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.venta_ignorada", entityType: "venta", entityId: u.id });
    return 0;
  }
  if (u.source_type === "tienda" && u.store_id) {
    const [l] = await db().select({ id: stock_listings.id }).from(stock_listings).where(and(eq(stock_listings.store_id, u.store_id), eq(stock_listings.external_id, u.listing_external_id ?? "")));
    if (l) return linkListing(s, actor, l.id, productId);
  }
  const p = await ownProduct(s, productId);
  for (const alias of aliasKeys({ sku: u.sku, title: u.title })) await db().insert(stock_aliases).values({ studio_id: s.studioId, organization_id: s.organizationId, alias, product_id: p.id, source: "factura", created_by: actor.id }).onConflictDoUpdate({ target: [stock_aliases.organization_id, stock_aliases.alias], set: { product_id: p.id } });
  const dep = (await deposits(s))[0];
  const qty = Number(u.qty);
  await move(s, { productId: p.id, depositId: dep.id, kind: qty < 0 ? "devolucion" : "venta", qty: -qty, sourceType: "invoice", sourceId: u.source_id, idem: `factura:${u.source_id}:${u.line}`, actorId: actor.id, at: u.at });
  await db().update(stock_unlinked).set({ status: "vinculada" }).where(eq(stock_unlinked.id, u.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.vincular", entityType: "producto", entityId: p.id, metadata: { origen: "factura" } });
  return 1;
}

/**
 * Pedido de una tienda (webhook, consulta o importación). Idempotente: el
 * mismo pedido dos veces no descuenta dos veces; si se cancela o se devuelve,
 * repone lo que había descontado.
 */
async function receiveOrder(store: typeof stock_stores.$inferSelect, o: RemoteOrder, via: "webhook" | "consulta" | "importacion") {
  const s = { studioId: store.studio_id, organizationId: store.organization_id, canManage: true };
  const [prev] = await db().select().from(stock_store_orders).where(and(eq(stock_store_orders.store_id, store.id), eq(stock_store_orders.external_id, o.externalId)));
  if (prev) await db().update(stock_store_orders).set({ status: o.status, raw: o.raw as Record<string, unknown>, lines: o.lines }).where(eq(stock_store_orders.id, prev.id));
  else await db().insert(stock_store_orders).values({ store_id: store.id, studio_id: s.studioId, organization_id: s.organizationId, external_id: o.externalId, status: o.status, lines: o.lines, raw: o.raw as Record<string, unknown>, via }).onConflictDoNothing();
  // §2.p B7: ventas para facturar según la regla de la tienda (las procesa la tarea «facturacion»)
  if (store.billing_mode !== "ninguna") {
    const [row] = await db().select({ id: stock_store_orders.id, billing: stock_store_orders.billing_status }).from(stock_store_orders).where(and(eq(stock_store_orders.store_id, store.id), eq(stock_store_orders.external_id, o.externalId)));
    const next = o.status === "pagada" ? (row?.billing ? null : "pendiente") : row?.billing === "pendiente" || row?.billing === "error" ? "ignorada" : row?.billing === "borrador" || row?.billing === "facturada" || row?.billing === "en_cola" ? "a_anular" : null;
    if (row && next) await db().update(stock_store_orders).set({ billing_status: next }).where(eq(stock_store_orders.id, row.id));
  }
  const dep = store.deposit_id ?? (await deposits(s))[0].id;
  const listings = await db().select().from(stock_listings).where(eq(stock_listings.store_id, store.id));
  const at = new Date(Date.parse(o.at) || Date.now());
  let moved = 0;
  let unlinked = 0;
  let restored = 0;
  for (const [i, line] of o.lines.entries()) {
    let l = listings.find((x) => x.external_id === line.listingId);
    if (!l && line.listingId) {
      const products = await db().select({ id: stock_products.id, code: stock_products.code, barcode: stock_products.barcode, description: stock_products.description }).from(stock_products).where(eq(stock_products.organization_id, s.organizationId));
      const aliases = (await db().select({ alias: stock_aliases.alias, productId: stock_aliases.product_id }).from(stock_aliases).where(eq(stock_aliases.organization_id, s.organizationId))).map((a) => ({ alias: a.alias, productId: a.productId }));
      const sug = suggestProduct({ sku: line.sku, title: line.title }, products, aliases);
      [l] = await db()
        .insert(stock_listings)
        .values({ store_id: store.id, studio_id: s.studioId, organization_id: s.organizationId, external_id: line.listingId, sku: line.sku, title: line.title.slice(0, 200), ...(sug?.auto ? { product_id: sug.productId, linked_by: sug.by } : sug ? { suggested_product_id: sug.productId, suggestion_score: String(sug.score), suggestion_reason: sug.reason } : {}) })
        .onConflictDoUpdate({ target: [stock_listings.store_id, stock_listings.external_id], set: { title: line.title.slice(0, 200) } })
        .returning();
    }
    const key = `tienda:${store.id}:${o.externalId}:${i}`;
    if (o.status === "pagada") {
      if (l?.product_id) {
        if (await move(s, { productId: l.product_id, depositId: dep, kind: "venta_tienda", qty: -line.qty, sourceType: "store_order", sourceId: o.externalId, idem: key, at })) moved++;
      } else {
        const r = await db().insert(stock_unlinked).values({ studio_id: s.studioId, organization_id: s.organizationId, source_type: "tienda", source_id: o.externalId, line: i, store_id: store.id, listing_external_id: line.listingId, sku: line.sku, title: line.title.slice(0, 160), qty: String(line.qty), at }).onConflictDoNothing().returning({ id: stock_unlinked.id });
        if (r.length) unlinked++;
      }
    } else {
      // Cancelada o devuelta: repone solo lo que se había descontado
      const [sold] = await db().select().from(stock_movements).where(and(eq(stock_movements.organization_id, s.organizationId), eq(stock_movements.idem_key, key)));
      if (sold && (await move(s, { productId: sold.product_id, depositId: sold.deposit_id, kind: o.status === "devuelta" ? "devolucion" : "anulacion", qty: -Number(sold.qty), sourceType: "store_order", sourceId: o.externalId, idem: `${key}:reverso` }))) restored++;
      await db().update(stock_unlinked).set({ status: "ignorada" }).where(and(eq(stock_unlinked.organization_id, s.organizationId), eq(stock_unlinked.source_type, "tienda"), eq(stock_unlinked.source_id, o.externalId), eq(stock_unlinked.store_id, store.id), eq(stock_unlinked.status, "pendiente")));
    }
  }
  if (moved || restored || unlinked) await audit({ studioId: s.studioId, organizationId: s.organizationId, actor: null, actorLabel: PLATFORMS[store.platform as Platform]?.label ?? store.platform, action: "stock.pedido_tienda", entityType: "tienda", entityId: store.id, metadata: { pedido: o.externalId, estado: o.status, descontados: moved, repuestos: restored, sin_vincular: unlinked, via } });
  if (moved) await checkLow(s);
  return { moved, unlinked, restored, repeated: !!prev && prev.status === o.status };
}

/** Aviso de una tienda (webhook): la URL lleva el token secreto de la tienda */
export async function webhook(token: string, body: unknown) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [st] = await db().select().from(stock_stores).where(eq(stock_stores.webhook_token, token));
  if (!st) return null;
  const order = toOrder(((body as { order?: unknown })?.order ?? body) as Record<string, unknown>);
  if (!order) return { ignored: true };
  return receiveOrder(st, order, "webhook");
}

/** Ventas de la tienda física por archivo: fecha, código, descripción, cantidad, importe y número de ticket */
export async function importStoreSales(s: StockScope, actor: Actor, storeId: string, file: File) {
  manage(s);
  const st = await ownStore(s, storeId);
  const [head, ...rows] = await readTable(file);
  const h = (head ?? []).map((x) => norm(String(x ?? "")));
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const c = { ticket: col("ticket", "comprobante", "numero"), code: col("codigo", "sku"), title: col("descripcion", "producto"), qty: col("cantidad"), price: col("importe", "precio") };
  if (c.code < 0 && c.title < 0) throw new StockError("El archivo tiene que tener código o descripción, y cantidad.");
  let total = { moved: 0, unlinked: 0 };
  for (const [i, r] of rows.entries()) {
    const qty = num(r[c.qty]) ?? 1;
    const code = c.code >= 0 ? String(r[c.code] ?? "").trim() : "";
    const title = c.title >= 0 ? String(r[c.title] ?? "").trim() : code;
    if (!code && !title) continue;
    const ticket = c.ticket >= 0 && r[c.ticket] ? String(r[c.ticket]) : `${file.name}:${i + 2}`;
    const res = await receiveOrder(st, { externalId: ticket, status: "pagada", at: new Date().toISOString(), lines: [{ listingId: code || `nombre:${norm(title)}`, sku: code || null, title, qty, price: num(r[c.price]) ?? 0 }], raw: { fila: r } }, "importacion");
    total = { moved: total.moved + res.moved, unlinked: total.unlinked + res.unlinked };
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.ventas_importadas", entityType: "tienda", entityId: st.id, metadata: total });
  return total;
}

/** Publicar la existencia: apagado por defecto, por tienda, con margen de seguridad y pausa; auditado */
export async function setStoreSync(s: StockScope, actor: Actor, storeId: string, i: { syncEnabled: boolean; margin: number; paused: boolean }) {
  manage(s);
  const st = await ownStore(s, storeId);
  if (i.syncEnabled && !PLATFORMS[st.platform as Platform]?.publish) throw new StockError(`${PLATFORMS[st.platform as Platform]?.label ?? st.platform} no permite publicar la existencia.`);
  if (!(i.margin >= 0 && i.margin <= 100000)) throw new StockError("Revisá el margen de seguridad.");
  await db().update(stock_stores).set({ sync_enabled: i.syncEnabled, safety_margin: String(i.margin), paused: i.paused }).where(eq(stock_stores.id, st.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: !i.syncEnabled ? "automatizacion.apagar" : i.paused ? "automatizacion.pausar" : "automatizacion.activar", entityType: "tienda", entityId: st.id, metadata: { accion: "stock.publicar", activa: i.syncEnabled, pausada: i.paused, margen: i.margin } });
}

const BACKOFF_MIN = [1, 5, 15, 60, 240];

/**
 * Publica la existencia de una tienda: solo lo vinculado. Antes de escribir
 * lee lo que hay en la tienda; si no es lo último que publicó Faro (o, la
 * primera vez, no coincide), deja un conflicto y no pisa nada.
 */
export async function publishStore(storeId: string, opts: { force?: boolean } = {}) {
  const [st] = await db().select().from(stock_stores).where(eq(stock_stores.id, storeId));
  if (!st || !st.sync_enabled || st.paused || !PLATFORMS[st.platform as Platform]?.publish) return { published: 0, conflicts: 0, errors: 0 };
  const s = { studioId: st.studio_id, organizationId: st.organization_id, canManage: true };
  const listings = await db().select().from(stock_listings).where(and(eq(stock_listings.store_id, st.id), sql`${stock_listings.product_id} is not null`));
  if (!listings.length) return { published: 0, conflicts: 0, errors: 0 };
  const v = valuate(await movesOf(s, listings.map((l) => l.product_id!)));
  const open = new Set((await db().select({ l: stock_conflicts.listing_id }).from(stock_conflicts).where(and(eq(stock_conflicts.store_id, st.id), eq(stock_conflicts.status, "abierto")))).map((r) => r.l));
  const lastPub = await db().select().from(stock_publications).where(eq(stock_publications.store_id, st.id)).orderBy(desc(stock_publications.created_at)).limit(500);
  const adapter = adapterFor(st.platform as Platform, st.shop_id);
  const out = { published: 0, conflicts: 0, errors: 0 };
  for (const l of listings) {
    if (open.has(l.id)) continue;
    const x = v.get(l.product_id!);
    const qty = st.deposit_id ? (x?.byDeposit[st.deposit_id] ?? 0) : (x?.qty ?? 0);
    const avail = availableToPublish(qty, Number(st.safety_margin));
    const last = lastPub.find((p) => p.listing_id === l.id);
    if (last?.status === "error" && last.next_retry_at && last.next_retry_at > new Date() && !opts.force) continue;
    if (l.last_published_qty != null && Number(l.last_published_qty) === avail && last?.status !== "error") continue;
    const attempts = last?.status === "error" ? last.attempts + 1 : 1;
    try {
      const remote = await adapter.remoteQty(l.external_id);
      const expected = l.last_published_qty == null ? null : Number(l.last_published_qty);
      if (!opts.force && remote !== avail && (expected == null || remote !== expected)) {
        await db().insert(stock_conflicts).values({ store_id: st.id, listing_id: l.id, studio_id: s.studioId, organization_id: s.organizationId, faro_qty: String(avail), remote_qty: String(remote), published_qty: expected == null ? null : String(expected) });
        await db().insert(stock_publications).values({ store_id: st.id, listing_id: l.id, studio_id: s.studioId, organization_id: s.organizationId, qty: String(avail), status: "conflicto", error: expected == null ? `La tienda tiene ${remote} y Faro publicaría ${avail}: no se pisa sin revisar.` : `La tienda tiene ${remote} y Faro había publicado ${expected}: no se pisa.` });
        await db().update(stock_listings).set({ remote_qty: String(remote) }).where(eq(stock_listings.id, l.id));
        out.conflicts++;
        continue;
      }
      if (remote !== avail) await adapter.publish(l.external_id, avail);
      await db().update(stock_listings).set({ last_published_qty: String(avail), remote_qty: String(avail), synced_at: new Date() }).where(eq(stock_listings.id, l.id));
      await db().insert(stock_publications).values({ store_id: st.id, listing_id: l.id, studio_id: s.studioId, organization_id: s.organizationId, qty: String(avail), status: "ok", attempts });
      out.published++;
    } catch (e) {
      const retry = e instanceof StoreError && e.retry && attempts < BACKOFF_MIN.length;
      await db().insert(stock_publications).values({ store_id: st.id, listing_id: l.id, studio_id: s.studioId, organization_id: s.organizationId, qty: String(avail), status: "error", attempts, error: (e as Error).message.slice(0, 300), next_retry_at: retry ? new Date(Date.now() + BACKOFF_MIN[attempts - 1] * 60000) : null });
      out.errors++;
    }
  }
  if (out.conflicts) {
    const to = await recipients(s.studioId, s.organizationId);
    await notify(to.map((u) => u.id), { kind: "aviso", title: `${st.name}: ${out.conflicts} ${out.conflicts === 1 ? "diferencia" : "diferencias"} de stock para revisar`, body: "La tienda tiene otra existencia que la que publicó Faro. No se pisó nada.", href: null });
  }
  return out;
}

/** Resolver un conflicto: publicar lo de Faro, ajustar Faro a lo de la tienda o descartarlo */
export async function resolveConflict(s: StockScope, actor: Actor, id: string, action: "usar_faro" | "ajustar_faro" | "descartar") {
  manage(s);
  if (!UUID.test(id)) throw new StockError("Conflicto inválido.");
  const [c] = await db().select().from(stock_conflicts).where(and(eq(stock_conflicts.id, id), eq(stock_conflicts.studio_id, s.studioId), eq(stock_conflicts.organization_id, s.organizationId), eq(stock_conflicts.status, "abierto")));
  if (!c) throw new StockError("Ese conflicto ya no está abierto.");
  const [l] = await db().select().from(stock_listings).where(eq(stock_listings.id, c.listing_id));
  const [st] = await db().select().from(stock_stores).where(eq(stock_stores.id, c.store_id));
  if (action === "ajustar_faro" && l.product_id) {
    const diff = Number(c.remote_qty) - Number(c.faro_qty);
    if (diff) await move(s, { productId: l.product_id, depositId: st.deposit_id ?? (await deposits(s))[0].id, kind: "ajuste", qty: diff, sourceType: "manual", reason: `Ajuste a la existencia de ${st.name}`, actorId: actor.id });
    await db().update(stock_listings).set({ last_published_qty: String(c.remote_qty) }).where(eq(stock_listings.id, l.id));
  }
  if (action === "usar_faro") await db().update(stock_listings).set({ last_published_qty: c.remote_qty }).where(eq(stock_listings.id, l.id));
  await db().update(stock_conflicts).set({ status: "resuelto", resolution: action, resolved_by: actor.id, resolved_at: new Date() }).where(eq(stock_conflicts.id, c.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "stock.conflicto", entityType: "tienda", entityId: st.id, metadata: { resolucion: action, faro: Number(c.faro_qty), tienda: Number(c.remote_qty) } });
  if (action === "usar_faro") await publishStore(st.id, { force: true });
}

export async function storeView(s: StockScope, id: string) {
  const st = await ownStore(s, id).catch(() => null);
  if (!st) return null;
  const [listings, publications, conflicts, orders] = await Promise.all([
    db().select({ l: stock_listings, code: stock_products.code, description: stock_products.description }).from(stock_listings).leftJoin(stock_products, eq(stock_products.id, stock_listings.product_id)).where(eq(stock_listings.store_id, st.id)).orderBy(asc(stock_listings.title)),
    db().select({ p: stock_publications, title: stock_listings.title }).from(stock_publications).innerJoin(stock_listings, eq(stock_listings.id, stock_publications.listing_id)).where(eq(stock_publications.store_id, st.id)).orderBy(desc(stock_publications.created_at)).limit(30),
    db().select({ c: stock_conflicts, title: stock_listings.title }).from(stock_conflicts).innerJoin(stock_listings, eq(stock_listings.id, stock_conflicts.listing_id)).where(and(eq(stock_conflicts.store_id, st.id), eq(stock_conflicts.status, "abierto"))),
    db().select().from(stock_store_orders).where(eq(stock_store_orders.store_id, st.id)).orderBy(desc(stock_store_orders.received_at)).limit(20),
  ]);
  return { st, listings, publications, conflicts, orders };
}

// ───────────── Tareas internas ─────────────

/** Consulta pedidos de las tiendas sin aviso, publica la existencia y avisa los mínimos */
export async function runStockJobs() {
  const stores = await db().select().from(stock_stores);
  for (const st of stores) {
    const info = PLATFORMS[st.platform as Platform];
    if (!info) continue;
    if (info.orders === "consulta") {
      try {
        const since = st.last_poll_at?.toISOString() ?? null;
        const orders = await adapterFor(st.platform as Platform, st.shop_id).orders(since);
        for (const o of orders) await receiveOrder(st, o, "consulta");
        await db().update(stock_stores).set({ last_poll_at: new Date(), last_error: null }).where(eq(stock_stores.id, st.id));
      } catch (e) {
        await db().update(stock_stores).set({ last_error: (e as Error).message.slice(0, 300) }).where(eq(stock_stores.id, st.id));
      }
    }
    if (st.sync_enabled && !st.paused) await publishStore(st.id).catch(() => null);
  }
  const orgs = await db().selectDistinct({ studioId: stock_products.studio_id, organizationId: stock_products.organization_id }).from(stock_products).where(sql`${stock_products.min_stock} is not null`);
  for (const o of orgs) await checkLow(o).catch(() => 0);
}

/** Existencia de un producto por nombre o código (Vigía y Agente) */
export async function findStock(s: StockScope, query: string) {
  const list = await listProducts(s);
  const q = norm(query);
  const exact = list.filter((x) => norm(x.p.code) === q || (x.p.barcode && x.p.barcode === query.trim()));
  const ranked = (exact.length ? exact : list.map((x) => ({ x, sc: Math.max(similarity(query, x.p.description), norm(x.p.description).includes(q) ? 0.8 : 0) })).filter((y) => y.sc >= 0.4).sort((a, b) => b.sc - a.sc).map((y) => y.x)).slice(0, 5);
  return ranked.map((x) => ({ codigo: x.p.code, descripcion: x.p.description, existencia: x.qty, unidad: x.p.unit, minimo: x.p.min_stock == null ? null : n(x.p.min_stock), bajo_minimo: x.low }));
}
