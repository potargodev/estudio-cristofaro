import "server-only";
import { and, desc, eq, lte, max } from "drizzle-orm";
import { getDb } from "@/db";
import { commercial_docs, ipc_series, recurring_invoices } from "@/db/schema";
import { audit } from "@/lib/audit";
import { todayAR } from "@/lib/format";
import type { DraftInput, IssuerScope } from "@/modules/arca/server";

// Comprobantes de §2.p (B3) que no son de ARCA: presupuestos (que pasan a
// factura con un clic), remitos y recibos de cobranza, con PDF y link
// público; y las facturas recurrentes (abonos) con ajuste por IPC. Las
// recurrentes quedan en borrador salvo el interruptor «Facturar
// automáticamente los comprobantes recurrentes» (auditado y con pausa).

const db = () => getDb();
type Actor = { id: string; email: string; name: string; role: string };
export class DocError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOC_KINDS = { presupuesto: "Presupuesto", remito: "Remito", recibo: "Recibo" } as const;
export type DocKind = keyof typeof DOC_KINDS;
export const isDocKind = (k: string): k is DocKind => k in DOC_KINDS;

interface DocInput {
  kind: DocKind;
  issueDate?: string | null;
  validUntil?: string | null;
  customer: { name: string; docType?: number; docNumber?: string; ivaCondition?: string; email?: string | null; address?: string | null };
  items: { description: string; quantity: number; unitPrice: number; ivaRate?: number | null }[];
  appliesTo?: string[];
  paymentMethod?: string | null;
  notes?: string | null;
}

const isDate = (d?: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Alta de un presupuesto, remito o recibo con su número correlativo */
export async function createDoc(scope: IssuerScope, actor: Actor, i: DocInput) {
  if (!isDocKind(i.kind)) throw new DocError("Tipo de comprobante inválido.");
  const name = i.customer.name?.trim();
  if (!name) throw new DocError("Falta el cliente.");
  const items = (i.items ?? []).map((x) => ({ description: String(x.description ?? "").trim().slice(0, 200), quantity: Number(x.quantity), unitPrice: Number(x.unitPrice), ivaRate: x.ivaRate == null ? null : Number(x.ivaRate) })).filter((x) => x.description && x.quantity > 0 && x.unitPrice >= 0);
  if (!items.length) throw new DocError("Agregá al menos un ítem.");
  const total = Math.round(items.reduce((t, x) => t + x.quantity * x.unitPrice * (1 + (x.ivaRate ?? 0) / 100), 0) * 100) / 100;
  if (i.kind !== "remito" && total <= 0) throw new DocError("El total tiene que ser mayor a cero.");
  // Número: el siguiente de su serie (la carrera la resuelve el índice único: se reintenta)
  for (let attempt = 0; attempt < 5; attempt++) {
    const [m] = await db()
      .select({ n: max(commercial_docs.number) })
      .from(commercial_docs)
      .where(and(eq(commercial_docs.organization_id, scope.organizationId), eq(commercial_docs.cuit, scope.cuit), eq(commercial_docs.kind, i.kind)));
    const [row] = await db()
      .insert(commercial_docs)
      .values({
        studio_id: scope.studioId,
        organization_id: scope.organizationId,
        cuit: scope.cuit,
        kind: i.kind,
        number: (m?.n ?? 0) + 1,
        issue_date: isDate(i.issueDate) ? i.issueDate! : todayAR(),
        valid_until: i.kind === "presupuesto" ? (isDate(i.validUntil) ? i.validUntil! : new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10)) : null,
        customer_name: name.slice(0, 160),
        customer_doc_type: [80, 86, 96, 99].includes(Number(i.customer.docType)) ? Number(i.customer.docType) : 99,
        customer_doc_number: String(i.customer.docNumber ?? "0").replace(/\D/g, "") || "0",
        customer_iva_condition: i.customer.ivaCondition ?? "consumidor_final",
        customer_email: i.customer.email?.trim() || null,
        customer_address: i.customer.address?.trim() || null,
        items,
        total: String(total),
        applies_to: i.kind === "recibo" ? (i.appliesTo ?? []).filter((x) => UUID.test(x)).slice(0, 50) : [],
        payment_method: i.kind === "recibo" ? (i.paymentMethod?.trim().slice(0, 60) ?? "Transferencia") : null,
        status: "emitido",
        notes: i.notes?.slice(0, 500) || null,
        created_by: actor.id,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: `comprobante.${i.kind}`, entityType: i.kind, entityId: row.id, metadata: { numero: row.number, total } });
      return row;
    }
  }
  throw new DocError("No pudimos numerar el comprobante: probá de nuevo.");
}

export async function getDoc(scope: Pick<IssuerScope, "studioId" | "organizationId">, id: string) {
  if (!UUID.test(id)) return null;
  const [d] = await db().select().from(commercial_docs).where(and(eq(commercial_docs.id, id), eq(commercial_docs.studio_id, scope.studioId), eq(commercial_docs.organization_id, scope.organizationId)));
  return d ?? null;
}

export async function listDocs(scope: Pick<IssuerScope, "studioId" | "organizationId">, kind?: DocKind | null, limit = 100) {
  return db()
    .select()
    .from(commercial_docs)
    .where(and(eq(commercial_docs.studio_id, scope.studioId), eq(commercial_docs.organization_id, scope.organizationId), ...(kind ? [eq(commercial_docs.kind, kind)] : [])))
    .orderBy(desc(commercial_docs.created_at))
    .limit(limit);
}

export async function setDocStatus(scope: IssuerScope, actor: Actor, id: string, status: "aceptado" | "anulado") {
  const d = await getDoc(scope, id);
  if (!d) throw new DocError("No encontramos ese comprobante.");
  if (d.status === "facturado") throw new DocError("Ya se facturó: anulá la factura con una nota de crédito.");
  await db().update(commercial_docs).set({ status, updated_at: new Date() }).where(eq(commercial_docs.id, d.id));
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: `comprobante.${status}`, entityType: d.kind, entityId: d.id });
}

/** Presupuesto → borrador de factura con el mismo cliente e ítems (una sola vez) */
export async function quoteToInvoice(scope: IssuerScope, actor: Actor, id: string, pointOfSale: number) {
  const d = await getDoc(scope, id);
  if (!d || d.kind !== "presupuesto") throw new DocError("No encontramos ese presupuesto.");
  if (d.status === "anulado") throw new DocError("El presupuesto está anulado.");
  const { createDraft } = await import("@/modules/arca/server");
  const draft = await createDraft(
    scope,
    {
      pointOfSale,
      issueDate: todayAR(),
      concept: 2,
      customer: { docType: d.customer_doc_type, docNumber: d.customer_doc_number, name: d.customer_name, ivaCondition: d.customer_iva_condition, email: d.customer_email, address: d.customer_address },
      items: d.items.map((x) => ({ description: x.description, quantity: x.quantity, unitPrice: x.unitPrice, ivaRate: x.ivaRate })),
      notes: `Presupuesto Nº ${String(d.number).padStart(8, "0")}`,
      idempotencyKey: `presupuesto:${d.id}`,
    },
    actor,
    "presupuesto",
  );
  await db().update(commercial_docs).set({ status: "facturado", invoice_id: draft.id, updated_at: new Date() }).where(eq(commercial_docs.id, d.id));
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "comprobante.presupuesto_a_factura", entityType: "presupuesto", entityId: d.id, metadata: { factura: draft.id } });
  return draft;
}

// ───────────── Recurrentes con ajuste por IPC ─────────────

/** Coeficiente del IPC desde el mes base hasta el último mes publicado (≤ el mes dado) */
async function ipcFactor(baseMonth: string | null, upTo: string) {
  if (!baseMonth) return { factor: 1, from: null as string | null, to: null as string | null };
  const [b] = await db().select().from(ipc_series).where(eq(ipc_series.month, baseMonth));
  const [t] = await db().select().from(ipc_series).where(lte(ipc_series.month, upTo)).orderBy(desc(ipc_series.month)).limit(1);
  if (!b || !t || Number(b.value) <= 0) return { factor: 1, from: null, to: null };
  return { factor: Number(t.value) / Number(b.value), from: b.month, to: t.month };
}

const addMonth = (iso: string, day: number) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

export async function saveRecurring(scope: IssuerScope, actor: Actor, i: { name: string; template: Omit<DraftInput, "issueDate">; dayOfMonth: number; startDate: string; adjust: "ninguno" | "ipc" }) {
  if (!i.name.trim()) throw new DocError("Poné un nombre (por ejemplo, «Abono mensual»).");
  if (!isDate(i.startDate)) throw new DocError("Elegí la fecha de la primera factura.");
  if (!i.template.items?.length) throw new DocError("Agregá al menos un ítem.");
  const day = Math.min(28, Math.max(1, Math.trunc(i.dayOfMonth) || 1));
  const [r] = await db()
    .insert(recurring_invoices)
    .values({ studio_id: scope.studioId, organization_id: scope.organizationId, cuit: scope.cuit, name: i.name.trim().slice(0, 120), template: i.template as unknown as Record<string, unknown>, day_of_month: day, next_date: i.startDate, adjust: i.adjust, base_month: i.adjust === "ipc" ? i.startDate.slice(0, 7) : null, created_by: actor.id })
    .returning();
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "recurrente.crear", entityType: "recurrente", entityId: r.id, metadata: { nombre: r.name, dia: day, ajuste: i.adjust } });
  return r;
}

export async function listRecurring(scope: Pick<IssuerScope, "studioId" | "organizationId">) {
  return db().select().from(recurring_invoices).where(and(eq(recurring_invoices.studio_id, scope.studioId), eq(recurring_invoices.organization_id, scope.organizationId))).orderBy(desc(recurring_invoices.created_at));
}

export async function toggleRecurring(scope: IssuerScope, actor: Actor, id: string, active: boolean) {
  if (!UUID.test(id)) throw new DocError("No encontramos esa recurrente.");
  const [r] = await db()
    .update(recurring_invoices)
    .set({ active, updated_at: new Date() })
    .where(and(eq(recurring_invoices.id, id), eq(recurring_invoices.studio_id, scope.studioId), eq(recurring_invoices.organization_id, scope.organizationId)))
    .returning();
  if (!r) throw new DocError("No encontramos esa recurrente.");
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: active ? "recurrente.reanudar" : "recurrente.pausar", entityType: "recurrente", entityId: id });
}

/**
 * Recurrentes del día: arma el borrador con los precios ajustados por IPC
 * (si corresponde) y, con el interruptor, lo emite. La clave
 * recurrente:<id>:<fecha> nunca crea dos facturas del mismo período.
 */
export async function runRecurring(today = todayAR()) {
  const due = await db().select().from(recurring_invoices).where(and(eq(recurring_invoices.active, true), lte(recurring_invoices.next_date, today))).limit(200);
  if (!due.length) return 0;
  const { createDraft, emitInvoice } = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const { automationAllows } = await import("@/modules/agent/automations");
  const { notify } = await import("@/modules/notifications/server");
  let n = 0;
  for (const r of due) {
    // Reclamo: se adelanta la próxima fecha antes de facturar (otra vuelta no la vuelve a tomar)
    const [claimed] = await db()
      .update(recurring_invoices)
      .set({ next_date: addMonth(r.next_date, r.day_of_month), last_run_at: new Date() })
      .where(and(eq(recurring_invoices.id, r.id), eq(recurring_invoices.next_date, r.next_date)))
      .returning();
    if (!claimed) continue;
    const scope = await scopeOf({ studio_id: r.studio_id, organization_id: r.organization_id, cuit: r.cuit });
    const actor = { id: r.created_by ?? "", email: "recurrente@faro", name: "Facturación recurrente", role: "dueno" };
    try {
      const adj = r.adjust === "ipc" ? await ipcFactor(r.base_month, r.next_date.slice(0, 7)) : { factor: 1, from: null, to: null };
      const t = r.template as unknown as Omit<DraftInput, "issueDate">;
      const items = t.items.map((x) => ({ ...x, unitPrice: Math.round(Number(x.unitPrice) * adj.factor * 100) / 100 }));
      const draft = await createDraft(scope, { ...t, items, issueDate: r.next_date, idempotencyKey: `recurrente:${r.id}:${r.next_date}`, notes: [t.notes, adj.from && adj.factor !== 1 ? `Ajuste por IPC ${adj.from} → ${adj.to}: ${((adj.factor - 1) * 100).toFixed(2)} %` : null].filter(Boolean).join(" · ") || null }, actor, "recurrente");
      const auto = await automationAllows(r.studio_id, r.organization_id, "facturacion.recurrentes");
      const inv = auto && draft.status === "borrador" ? await emitInvoice(scope, draft.id, actor, "recurrente") : draft;
      await db().update(recurring_invoices).set({ last_invoice_id: inv.id, last_error: null }).where(eq(recurring_invoices.id, r.id));
      await notify([r.created_by], { kind: "fiscal", title: inv.status === "autorizada" ? `Se emitió «${r.name}»` : `«${r.name}» está lista para revisar`, body: `${inv.customer_name} · $ ${Number(inv.total).toLocaleString("es-AR")}${adj.factor !== 1 ? ` (ajustada por IPC ${((adj.factor - 1) * 100).toFixed(1)} %)` : ""}`, href: `${scope.base}/${inv.id}`, refId: inv.id });
      n++;
    } catch (e) {
      await db().update(recurring_invoices).set({ last_error: (e as Error).message.slice(0, 300) }).where(eq(recurring_invoices.id, r.id));
    }
  }
  return n;
}
