import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoice_settings, invoices, legal_entities, organizations, stock_store_orders, stock_stores } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/ids";
import { automationAllows } from "@/modules/agent/automations";
import { PLATFORMS, type Platform } from "@/modules/stock/platforms";
import { buyerOf, creditNoteFor, dayOf, isBillingMode, itemsOf, orderTotal, type BillingMode } from "./core";

// Ventas para facturar (§2.p, B7). Los pedidos llegan por la capa de tiendas
// de Stock (webhook, consulta o importación) y quedan «para facturar» si la
// tienda tiene una regla. La tarea «facturacion» arma la factura (por venta o
// un resumen por día) y la emite solo con el interruptor «Facturar
// automáticamente las ventas de tiendas» (auditado y con pausa); si no, queda
// en borrador y la emite una persona desde esta pantalla. Una devolución o
// cancelación de algo facturado genera la nota de crédito. Idempotente por
// clave: tienda:<tienda>:<pedido>, tienda-dia:<tienda>:<día> y tienda-nc:…

const db = () => getDb();
export class SalesError extends Error {}

export interface SalesScope {
  studioId: string;
  /** null = todo el estudio (panel); si no, una organización o la cuenta personal */
  organizationId: string | null;
  canEmit: boolean;
}
type Actor = { id: string; email: string; name: string; role: string };
type Store = typeof stock_stores.$inferSelect;
type Order = typeof stock_store_orders.$inferSelect;

const inScope = (s: SalesScope) => and(eq(stock_stores.studio_id, s.studioId), s.organizationId ? eq(stock_stores.organization_id, s.organizationId) : undefined);

/** Tiendas con su regla y cuántos pedidos hay en cada estado */
export async function salesStores(s: SalesScope) {
  const stores = await db().select({ st: stock_stores, org: organizations.name }).from(stock_stores).innerJoin(organizations, eq(organizations.id, stock_stores.organization_id)).where(inScope(s)).orderBy(organizations.name, stock_stores.name);
  const counts = stores.length
    ? await db()
        .select({ store: stock_store_orders.store_id, status: stock_store_orders.billing_status, n: sql<number>`count(*)::int` })
        .from(stock_store_orders)
        .where(and(inArray(stock_store_orders.store_id, stores.map((x) => x.st.id)), isNotNull(stock_store_orders.billing_status)))
        .groupBy(stock_store_orders.store_id, stock_store_orders.billing_status)
    : [];
  const cuits = new Map<string, string[]>();
  for (const orgId of new Set(stores.map((x) => x.st.organization_id))) cuits.set(orgId, await cuitsOf(s.studioId, orgId));
  return stores.map(({ st, org }) => ({
    id: st.id,
    name: st.name,
    platform: PLATFORMS[st.platform as Platform]?.label ?? st.platform,
    organizationId: st.organization_id,
    organization: org,
    mode: st.billing_mode as BillingMode,
    cuit: st.billing_cuit,
    pos: st.billing_pos,
    cuits: cuits.get(st.organization_id) ?? [],
    counts: Object.fromEntries(counts.filter((c) => c.store === st.id).map((c) => [c.status!, c.n])) as Record<string, number>,
  }));
}

/** Pedidos con su estado de facturación (los más nuevos primero) */
export async function salesOrders(s: SalesScope, filter: { status?: string | null; storeId?: string | null } = {}) {
  return db()
    .select({ o: stock_store_orders, store: stock_stores.name, platform: stock_stores.platform, org: organizations.name, invoice: { id: invoices.id, cbte: invoices.cbte_type, pos: invoices.point_of_sale, number: invoices.number, status: invoices.status } })
    .from(stock_store_orders)
    .innerJoin(stock_stores, eq(stock_stores.id, stock_store_orders.store_id))
    .innerJoin(organizations, eq(organizations.id, stock_store_orders.organization_id))
    .leftJoin(invoices, eq(invoices.id, stock_store_orders.invoice_id))
    .where(and(inScope(s), isNotNull(stock_store_orders.billing_status), filter.status ? eq(stock_store_orders.billing_status, filter.status) : undefined, filter.storeId && isUuid(filter.storeId) ? eq(stock_store_orders.store_id, filter.storeId) : undefined))
    .orderBy(desc(stock_store_orders.received_at))
    .limit(300);
}

async function cuitsOf(studioId: string, orgId: string) {
  const a = await db().select({ c: invoice_settings.cuit }).from(invoice_settings).where(and(eq(invoice_settings.organization_id, orgId), eq(invoice_settings.studio_id, studioId)));
  const b = await db().select({ c: legal_entities.cuit }).from(legal_entities).where(and(eq(legal_entities.organization_id, orgId), eq(legal_entities.studio_id, studioId), isNotNull(legal_entities.cuit)));
  return [...new Set([...a, ...b].map((x) => x.c!).filter(Boolean))];
}

async function ownStore(s: SalesScope, storeId: string) {
  if (!isUuid(storeId)) throw new SalesError("Tienda inválida.");
  const [st] = await db().select().from(stock_stores).where(and(eq(stock_stores.id, storeId), inScope(s)));
  if (!st) throw new SalesError("No encontramos esa tienda.");
  return st;
}

/** Regla de facturación de una tienda (auditada). Activarla no factura lo anterior: solo lo que llega desde ahora. */
export async function setBillingRule(s: SalesScope, actor: Actor, storeId: string, i: { mode: string; cuit: string | null; pos: number | null }) {
  if (!s.canEmit) throw new SalesError("Tu rol no puede cambiar cómo se factura.");
  const st = await ownStore(s, storeId);
  if (!isBillingMode(i.mode)) throw new SalesError("Elegí cómo se factura.");
  const cuit = (i.cuit ?? "").replace(/\D/g, "") || null;
  if (i.mode !== "ninguna") {
    if (!cuit || !(await cuitsOf(s.studioId, st.organization_id)).includes(cuit)) throw new SalesError("Elegí una CUIT de la organización para facturar.");
    if (i.pos != null && !(Number.isInteger(i.pos) && i.pos >= 1 && i.pos <= 99998)) throw new SalesError("Revisá el punto de venta.");
  }
  await db().update(stock_stores).set({ billing_mode: i.mode, billing_cuit: cuit, billing_pos: i.pos }).where(eq(stock_stores.id, st.id));
  await audit({ studioId: s.studioId, organizationId: st.organization_id, actor, action: "ventas.regla", entityType: "tienda", entityId: st.id, metadata: { modo: i.mode, cuit, punto_de_venta: i.pos } });
}

const systemActor = (st: Store) => ({ id: st.created_by ?? "", email: "tiendas@faro", name: `Ventas de ${st.name}`, role: "dueno" });

async function issuer(st: Store) {
  if (!st.billing_cuit) throw new SalesError("La tienda no tiene CUIT para facturar.");
  const arca = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const scope = await scopeOf({ studio_id: st.studio_id, organization_id: st.organization_id, cuit: st.billing_cuit });
  const settings = await arca.getSettings(scope);
  const pos = st.billing_pos ?? (await arca.listPoints(scope)).find((p) => !p.blocked)?.number ?? 1;
  return { arca, scope, pos, discriminates: settings.iva_condition === "responsable_inscripto" };
}

const STATUS_OF: Record<string, string> = { autorizada: "facturada", en_cola: "en_cola", borrador: "borrador" };

/** Arma (y, si corresponde, emite) la factura de un pedido */
async function billOrder(st: Store, o: Order, emit: boolean, actor: Actor) {
  const { arca, scope, pos, discriminates } = await issuer(st);
  try {
    let inv = await arca.createDraft(scope, { pointOfSale: pos, issueDate: dayOf(new Date()), concept: 1, customer: buyerOf(o.raw), items: itemsOf(o.lines, discriminates), notes: `Pedido ${o.external_id} · ${st.name}`, idempotencyKey: `tienda:${st.id}:${o.external_id}` }, actor, "tienda");
    if (emit && inv.status === "borrador") inv = await arca.emitInvoice(scope, inv.id, actor, "tienda");
    const status = STATUS_OF[inv.status] ?? "error";
    await db().update(stock_store_orders).set({ billing_status: status, invoice_id: inv.id, billing_error: status === "error" ? (inv.error ?? "ARCA no lo autorizó.") : null }).where(eq(stock_store_orders.id, o.id));
    return status;
  } catch (e) {
    await db().update(stock_store_orders).set({ billing_status: "error", billing_error: (e as Error).message.slice(0, 300) }).where(eq(stock_store_orders.id, o.id));
    return "error";
  }
}

/** Resumen de un día: una factura a consumidor final con todas las ventas pagadas de la tienda */
async function billDay(st: Store, day: string, orders: Order[], emit: boolean, actor: Actor) {
  const { arca, scope, pos, discriminates } = await issuer(st);
  try {
    const lines = orders.flatMap((o) => o.lines.map((l) => ({ ...l, title: `${l.title} (pedido ${o.external_id})` })));
    let inv = await arca.createDraft(scope, { pointOfSale: pos, issueDate: dayOf(new Date()), concept: 1, customer: { docType: 99, docNumber: "0", name: "Consumidor final", ivaCondition: "consumidor_final" }, items: itemsOf(lines, discriminates), notes: `Ventas del ${day.split("-").reverse().join("/")} · ${st.name} (${orders.length} pedidos)`, idempotencyKey: `tienda-dia:${st.id}:${day}` }, actor, "tienda");
    if (emit && inv.status === "borrador") inv = await arca.emitInvoice(scope, inv.id, actor, "tienda");
    const status = STATUS_OF[inv.status] ?? "error";
    await db().update(stock_store_orders).set({ billing_status: status, invoice_id: inv.id, billing_error: status === "error" ? (inv.error ?? "ARCA no lo autorizó.") : null }).where(inArray(stock_store_orders.id, orders.map((o) => o.id)));
    return orders.length;
  } catch (e) {
    await db().update(stock_store_orders).set({ billing_status: "error", billing_error: (e as Error).message.slice(0, 300) }).where(inArray(stock_store_orders.id, orders.map((o) => o.id)));
    return 0;
  }
}

/** Devolución o cancelación: borra el borrador o arma la nota de crédito de lo facturado (la emite con el interruptor) */
async function reverseOrder(st: Store, o: Order, emit: boolean, actor: Actor) {
  if (!o.invoice_id) return db().update(stock_store_orders).set({ billing_status: "ignorada" }).where(eq(stock_store_orders.id, o.id));
  const [inv] = await db().select().from(invoices).where(eq(invoices.id, o.invoice_id));
  if (!inv) return db().update(stock_store_orders).set({ billing_status: "ignorada", invoice_id: null }).where(eq(stock_store_orders.id, o.id));
  if (inv.status === "en_cola") return; // espera a que ARCA la autorice
  const { arca, scope, discriminates } = await issuer(st);
  if (inv.status === "borrador") {
    await arca.deleteDraft(scope, inv.id, actor);
    // Si era un resumen del día, lo demás vuelve a quedar para facturar
    await db().update(stock_store_orders).set({ billing_status: "pendiente", invoice_id: null }).where(and(eq(stock_store_orders.invoice_id, inv.id), sql`${stock_store_orders.id} <> ${o.id}`));
    return db().update(stock_store_orders).set({ billing_status: "ignorada", invoice_id: null }).where(eq(stock_store_orders.id, o.id));
  }
  if (inv.status !== "autorizada") return db().update(stock_store_orders).set({ billing_status: "ignorada" }).where(eq(stock_store_orders.id, o.id));
  const nc = creditNoteFor(inv.cbte_type);
  try {
    if (!nc) throw new SalesError("No hay nota de crédito para ese tipo de comprobante.");
    const customer = { docType: inv.customer_doc_type, docNumber: inv.customer_doc_number, name: inv.customer_name, ivaCondition: inv.customer_iva_condition };
    let note = await arca.createDraft(scope, { cbteType: nc, pointOfSale: inv.point_of_sale, issueDate: dayOf(new Date()), concept: inv.concept ?? 1, customer, items: itemsOf(o.lines, discriminates), associatedInvoiceId: inv.id, notes: `Devolución del pedido ${o.external_id} · ${st.name}`, idempotencyKey: `tienda-nc:${st.id}:${o.external_id}` }, actor, "tienda");
    if (emit && note.status === "borrador") note = await arca.emitInvoice(scope, note.id, actor, "tienda");
    await db().update(stock_store_orders).set({ billing_status: note.status === "autorizada" ? "anulada" : note.status === "borrador" || note.status === "en_cola" ? "nc_borrador" : "error", credit_note_id: note.id, billing_error: note.status === "autorizada" || note.status === "borrador" || note.status === "en_cola" ? null : (note.error ?? "ARCA no autorizó la nota de crédito.") }).where(eq(stock_store_orders.id, o.id));
  } catch (e) {
    await db().update(stock_store_orders).set({ billing_error: (e as Error).message.slice(0, 300) }).where(eq(stock_store_orders.id, o.id));
  }
}

/**
 * Tarea «facturacion»: ventas por pedido, resúmenes de los días cerrados y
 * notas de crédito de las devoluciones. Emite solo con el interruptor.
 */
export async function processStoreSales(limit = 200) {
  const out = { facturadas: 0, resumenes: 0, notas: 0 };
  const stores = await db().select().from(stock_stores).where(sql`${stock_stores.billing_mode} <> 'ninguna'`);
  const today = dayOf(new Date());
  for (const st of stores) {
    const emit = await automationAllows(st.studio_id, st.organization_id, "facturacion.tiendas");
    const actor = systemActor(st);
    const reversals = await db().select().from(stock_store_orders).where(and(eq(stock_store_orders.store_id, st.id), eq(stock_store_orders.billing_status, "a_anular"))).limit(limit);
    for (const o of reversals) {
      await reverseOrder(st, o, emit, actor);
      out.notas++;
    }
    const pending = await db().select().from(stock_store_orders).where(and(eq(stock_store_orders.store_id, st.id), eq(stock_store_orders.billing_status, "pendiente"))).orderBy(stock_store_orders.received_at).limit(limit);
    if (st.billing_mode === "por_venta") {
      for (const o of pending) if ((await billOrder(st, o, emit, actor)) !== "error") out.facturadas++;
    } else if (st.billing_mode === "resumen_diario") {
      const byDay = new Map<string, Order[]>();
      for (const o of pending) {
        const d = dayOf(o.received_at);
        if (d < today) byDay.set(d, [...(byDay.get(d) ?? []), o]);
      }
      for (const [d, list] of byDay) if (await billDay(st, d, list, emit, actor)) out.resumenes++;
    }
    if (reversals.length || pending.length) await audit({ studioId: st.studio_id, organizationId: st.organization_id, actor: null, actorLabel: `Ventas de ${st.name}`, action: "ventas.procesar", entityType: "tienda", entityId: st.id, metadata: { ...out, automatica: emit } });
  }
  return out;
}

/** Una persona factura ahora (y emite) los pedidos elegidos: es la aprobación (§1) */
export async function invoiceNow(s: SalesScope, actor: Actor, ids: string[]) {
  if (!s.canEmit) throw new SalesError("Tu rol no puede emitir comprobantes.");
  const valid = ids.filter(isUuid).slice(0, 200);
  if (!valid.length) throw new SalesError("Elegí al menos un pedido.");
  const rows = await db()
    .select({ o: stock_store_orders, st: stock_stores })
    .from(stock_store_orders)
    .innerJoin(stock_stores, eq(stock_stores.id, stock_store_orders.store_id))
    .where(and(inArray(stock_store_orders.id, valid), inScope(s), or(eq(stock_store_orders.billing_status, "pendiente"), eq(stock_store_orders.billing_status, "error"), eq(stock_store_orders.billing_status, "borrador"), eq(stock_store_orders.billing_status, "nc_borrador"))));
  let ok = 0;
  for (const { o, st } of rows) {
    if (st.billing_mode === "ninguna") continue;
    if (o.billing_status === "nc_borrador" && o.credit_note_id) {
      const { arca, scope } = await issuer(st);
      const note = await arca.emitInvoice(scope, o.credit_note_id, actor, "tienda").catch(() => null);
      if (note?.status === "autorizada") {
        await db().update(stock_store_orders).set({ billing_status: "anulada" }).where(eq(stock_store_orders.id, o.id));
        ok++;
      }
      continue;
    }
    if (o.billing_status === "borrador" && o.invoice_id) {
      const { arca, scope } = await issuer(st);
      const inv = await arca.emitInvoice(scope, o.invoice_id, actor, "tienda").catch(() => null);
      const status = inv ? (STATUS_OF[inv.status] ?? "error") : "error";
      await db().update(stock_store_orders).set({ billing_status: status }).where(eq(stock_store_orders.invoice_id, o.invoice_id));
      if (status !== "error") ok++;
      continue;
    }
    if ((await billOrder(st, { ...o, billing_status: "pendiente" }, true, actor)) !== "error") ok++;
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "ventas.facturar", entityType: "ventas", entityId: null, metadata: { pedidos: rows.length, emitidos: ok } });
  return { ok, total: rows.length };
}

/** No facturar estos pedidos (por ejemplo, ya se facturaron por otro lado) */
export async function ignoreSales(s: SalesScope, actor: Actor, ids: string[]) {
  if (!s.canEmit) throw new SalesError("Tu rol no puede cambiar la facturación.");
  const valid = ids.filter(isUuid).slice(0, 200);
  const storeIds = (await db().select({ id: stock_stores.id }).from(stock_stores).where(inScope(s))).map((x) => x.id);
  if (!valid.length || !storeIds.length) return 0;
  const r = await db()
    .update(stock_store_orders)
    .set({ billing_status: "ignorada" })
    .where(and(inArray(stock_store_orders.id, valid), inArray(stock_store_orders.store_id, storeIds), or(eq(stock_store_orders.billing_status, "pendiente"), eq(stock_store_orders.billing_status, "error"))))
    .returning({ id: stock_store_orders.id });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "ventas.no_facturar", entityType: "ventas", entityId: null, metadata: { pedidos: r.length } });
  return r.length;
}

/** Resumen para el Vigía y el panel: pedidos por estado de los últimos 30 días */
export async function salesSummary(s: SalesScope) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const rows = await db()
    .select({ status: stock_store_orders.billing_status, n: sql<number>`count(*)::int`, lines: sql<unknown[]>`json_agg(${stock_store_orders.lines})` })
    .from(stock_store_orders)
    .innerJoin(stock_stores, eq(stock_stores.id, stock_store_orders.store_id))
    .where(and(inScope(s), isNotNull(stock_store_orders.billing_status), gte(stock_store_orders.received_at, since)))
    .groupBy(stock_store_orders.billing_status);
  return rows.map((r) => ({ status: r.status!, count: r.n, total: (r.lines as Order["lines"][]).reduce((t, l) => t + orderTotal(l), 0) }));
}
