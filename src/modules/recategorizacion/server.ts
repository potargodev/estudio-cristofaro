import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, income_adjustments, invoices, legal_entities, memberships, organizations, recategorizations, tasks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { formatAmount, lastDayOfMonth, todayAR } from "@/lib/format";
import { can } from "@/lib/permissions";
import { CBTE_TYPES } from "@/modules/arca/config";
import type { ScaleCategory } from "@/modules/arca/monotributo";
import { feeOf, monthsTo, movementOf, periodFor, suggest, type Activity, type Movement, type Params } from "./core";

// Recategorización del monotributo de la cartera (A5): todos los
// monotributistas del estudio con sus 12 meses de facturación (lo autorizado
// en Faro con su CUIT, las notas de crédito restando, y lo cargado a mano),
// la categoría actual y la que coincide, y el circuito: revisar en lote,
// marcar recategorizado con el comprobante, avisar al cliente y crear las
// tareas del equipo. El contador decide la categoría (§1).

const db = () => getDb();
type Actor = { id: string; email: string; name?: string };
export class RecatError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  entityId: string;
  organizationId: string;
  organizationName: string;
  businessName: string;
  cuit: string | null;
  income12m: number;
  current: string | null;
  suggested: string | null;
  final: string | null;
  movement: Movement;
  reasons: string[];
  feeCurrent: number | null;
  feeNew: number | null;
  params: Params;
  status: string;
  receiptDocumentId: string | null;
  notifiedAt: Date | null;
  recordId: string | null;
}

const feeStr = (cats: ScaleCategory[], letter: string, activity: Activity) => {
  const f = feeOf(cats, letter, activity);
  return f == null ? null : String(f);
};

async function scale() {
  const { currentScale } = await import("@/modules/arca/server");
  const s = await currentScale();
  return { id: s.id, status: s.status, source: s.source, validFrom: s.valid_from, categories: s.categories as ScaleCategory[] };
}

/** La recategorización que viene (o la del período pedido, AAAA-01 / AAAA-07) */
export function periodOf(key?: string | null) {
  if (key && /^\d{4}-(01|07)$/.test(key)) {
    const y = Number(key.slice(0, 4));
    return key.endsWith("-01") ? { key, label: `enero de ${y}`, cutoff: `${y - 1}-12`, deadline: `${y}-02-05` } : { key, label: `julio de ${y}`, cutoff: `${y}-06`, deadline: `${y}-08-05` };
  }
  return periodFor(todayAR());
}

/** Toda la cartera de monotributistas del estudio, con su movimiento */
export async function portfolio(studioId: string, periodKey?: string | null) {
  const p = periodOf(periodKey);
  const months = monthsTo(p.cutoff);
  const from = `${months[0]}-01`;
  const to = lastDayOfMonth(p.cutoff);
  const sc = await scale();
  const ents = await db()
    .select({ e: legal_entities, orgName: organizations.name })
    .from(legal_entities)
    .innerJoin(organizations, and(eq(organizations.id, legal_entities.organization_id), eq(organizations.studio_id, studioId)))
    .where(and(eq(legal_entities.studio_id, studioId), eq(legal_entities.regime, "monotributo"), eq(legal_entities.active, true)))
    .orderBy(organizations.name);
  if (!ents.length) return { period: p, months, scale: sc, rows: [] as Row[] };
  const orgIds = [...new Set(ents.map((x) => x.e.organization_id))];
  const inv = await db()
    .select({ org: invoices.organization_id, cuit: invoices.cuit, type: invoices.cbte_type, total: sql<string>`sum(${invoices.total} * ${invoices.exchange_rate})` })
    .from(invoices)
    .where(and(eq(invoices.studio_id, studioId), inArray(invoices.organization_id, orgIds), eq(invoices.status, "autorizada"), gte(invoices.issue_date, from), lte(invoices.issue_date, to)))
    .groupBy(invoices.organization_id, invoices.cuit, invoices.cbte_type);
  const adj = await db()
    .select()
    .from(income_adjustments)
    .where(and(eq(income_adjustments.studio_id, studioId), inArray(income_adjustments.organization_id, orgIds), gte(income_adjustments.month, months[0]), lte(income_adjustments.month, p.cutoff)));
  const saved = await db()
    .select()
    .from(recategorizations)
    .where(and(eq(recategorizations.studio_id, studioId), eq(recategorizations.period, p.key)));
  const savedBy = new Map(saved.map((r) => [r.legal_entity_id, r]));
  // Lo cargado a mano es de la organización: se suma si tiene una sola CUIT de monotributo
  const monoPerOrg = new Map<string, number>();
  for (const { e } of ents) monoPerOrg.set(e.organization_id, (monoPerOrg.get(e.organization_id) ?? 0) + 1);
  const rows: Row[] = ents.map(({ e, orgName }) => {
    const cuit = (e.cuit ?? "").replace(/\D/g, "");
    let income = inv.filter((x) => x.org === e.organization_id && x.cuit.replace(/\D/g, "") === cuit).reduce((t, x) => t + (CBTE_TYPES[x.type]?.kind === "nota_credito" ? -1 : 1) * Number(x.total), 0);
    if (monoPerOrg.get(e.organization_id) === 1) income += adj.filter((a) => a.organization_id === e.organization_id).reduce((t, a) => t + Number(a.amount), 0);
    income = Math.round(income * 100) / 100;
    const r = savedBy.get(e.id);
    const params: Params = { activity: (r?.activity as Activity) ?? "servicios", surfaceM2: r?.surface_m2 != null ? Number(r.surface_m2) : null, energyKw: r?.energy_kw != null ? Number(r.energy_kw) : null, rentAnnual: r?.rent_annual != null ? Number(r.rent_annual) : null };
    const s = suggest(sc.categories, income, params);
    // Ya recategorizado: la categoría «actual» es la que tenía antes (la CUIT ya tiene la nueva)
    const current = r?.status === "recategorizado" || r?.recategorized_at ? r.current_category : e.category?.trim().toUpperCase() || null;
    const final = r?.final_category ?? null;
    return {
      entityId: e.id,
      organizationId: e.organization_id,
      organizationName: orgName,
      businessName: e.business_name,
      cuit: e.cuit,
      income12m: income,
      current,
      suggested: s.letter,
      final,
      movement: movementOf(sc.categories, current, s.letter, s.excluded),
      reasons: s.reasons,
      feeCurrent: feeOf(sc.categories, current, params.activity),
      feeNew: feeOf(sc.categories, final ?? s.letter, params.activity),
      params,
      status: r?.status ?? "pendiente",
      receiptDocumentId: r?.receipt_document_id ?? null,
      notifiedAt: r?.notified_at ?? null,
      recordId: r?.id ?? null,
    };
  });
  return { period: p, months, scale: sc, rows };
}

async function entityOf(studioId: string, entityId: string) {
  if (!UUID.test(entityId)) throw new RecatError("No encontramos ese monotributista.");
  const [e] = await db()
    .select({ e: legal_entities })
    .from(legal_entities)
    .innerJoin(organizations, and(eq(organizations.id, legal_entities.organization_id), eq(organizations.studio_id, studioId)))
    .where(and(eq(legal_entities.id, entityId), eq(legal_entities.studio_id, studioId), eq(legal_entities.regime, "monotributo")));
  if (!e) throw new RecatError("No encontramos ese monotributista.");
  return e.e;
}

/** Guarda (o crea) la fila de la recategorización con el cálculo del momento */
async function upsert(studioId: string, entityId: string, periodKey: string, set: Partial<typeof recategorizations.$inferInsert>) {
  const e = await entityOf(studioId, entityId);
  const pf = await portfolio(studioId, periodKey);
  const row = pf.rows.find((r) => r.entityId === e.id);
  const base = {
    studio_id: studioId,
    organization_id: e.organization_id,
    legal_entity_id: e.id,
    period: pf.period.key,
    income_12m: String(row?.income12m ?? 0),
    // Se congela al recategorizar (portfolio ya devuelve la de antes)
    current_category: row?.current ?? null,
    suggested_category: row?.suggested ?? null,
    movement: row?.movement ?? null,
    scale_status: pf.scale.status,
  };
  const [r] = await db()
    .insert(recategorizations)
    .values({ ...base, ...set })
    .onConflictDoUpdate({ target: [recategorizations.legal_entity_id, recategorizations.period], set: { ...base, ...set, updated_at: new Date() } })
    .returning();
  return { record: r, entity: e, row };
}

/** Carga rápida de parámetros (actividad, superficie, energía y alquiler anual) */
export async function saveParams(studioId: string, actor: Actor, entityId: string, periodKey: string, p: Params & { notes?: string | null }) {
  const num = (v: number | null) => (v == null || !Number.isFinite(v) ? null : String(Math.max(0, v)));
  const { record } = await upsert(studioId, entityId, periodKey, { activity: p.activity === "bienes" ? "bienes" : "servicios", surface_m2: num(p.surfaceM2), energy_kw: num(p.energyKw), rent_annual: num(p.rentAnnual), notes: p.notes?.slice(0, 300) ?? null });
  // Con los parámetros nuevos, el cálculo se rehace
  const again = await upsert(studioId, entityId, periodKey, {});
  await audit({ studioId, organizationId: record.organization_id, actor, action: "recategorizacion.parametros", entityType: "monotributista", entityId, metadata: { periodo: periodKey, actividad: p.activity, superficie: p.surfaceM2, energia: p.energyKw, alquiler: p.rentAnnual } });
  return again.record;
}

/**
 * Revisión en lote: el contador confirma la categoría (la que coincide o la
 * actual) para varios a la vez. Queda «revisada», con su nueva cuota.
 */
export async function reviewBatch(studioId: string, actor: Actor, entityIds: string[], periodKey: string, choice: "sugerida" | "actual") {
  const done: string[] = [];
  for (const id of [...new Set(entityIds)].slice(0, 500)) {
    const pre = await portfolio(studioId, periodKey);
    const row = pre.rows.find((r) => r.entityId === id);
    if (!row) throw new RecatError("No encontramos ese monotributista.");
    const final = choice === "actual" ? row.current : row.suggested;
    if (!final) continue; // excluido o sin categoría: lo decide el contador uno por uno
    await upsert(studioId, id, periodKey, { final_category: final, fee_new: feeStr(pre.scale.categories, final, row.params.activity), status: "revisada", reviewed_by: actor.id, reviewed_at: new Date() });
    done.push(id);
  }
  if (done.length) await audit({ studioId, actor, action: "recategorizacion.revisar", entityType: "cartera", metadata: { periodo: periodKey, cantidad: done.length, criterio: choice } });
  return done.length;
}

/** El contador elige otra categoría para uno (por ejemplo, un excluido que sigue o un caso con criterio propio) */
export async function decide(studioId: string, actor: Actor, entityId: string, periodKey: string, letter: string) {
  const sc = await scale();
  const l = letter.trim().toUpperCase();
  if (!sc.categories.some((c) => c.letter === l)) throw new RecatError("Esa categoría no está en la escala.");
  const pre = (await portfolio(studioId, periodKey)).rows.find((r) => r.entityId === entityId);
  const { record } = await upsert(studioId, entityId, periodKey, { final_category: l, fee_new: feeStr(sc.categories, l, pre?.params.activity ?? "servicios"), status: "revisada", reviewed_by: actor.id, reviewed_at: new Date() });
  await audit({ studioId, organizationId: record.organization_id, actor, action: "recategorizacion.decidir", entityType: "monotributista", entityId, metadata: { periodo: periodKey, categoria: l } });
  return record;
}

/**
 * Marca «recategorizado»: la recategorización se hizo en ARCA (la hace el
 * contador o el cliente con su clave; Faro no la pide ni la guarda). Guarda
 * el comprobante en Documentos y actualiza la categoría de la CUIT.
 */
export async function markRecategorized(studioId: string, actor: Actor, entityId: string, periodKey: string, receipt: File | null) {
  const e = await entityOf(studioId, entityId);
  const pf = await portfolio(studioId, periodKey);
  const row = pf.rows.find((r) => r.entityId === e.id)!;
  const final = row.final ?? row.suggested;
  if (!final) throw new RecatError("Elegí la categoría antes de marcarlo recategorizado.");
  let docId: string | null = null;
  if (receipt && receipt.size) {
    const { checkUpload, storeUpload } = await import("@/lib/uploads");
    const chk = await checkUpload(receipt);
    if (!chk.ok) throw new RecatError(chk.error);
    const st = await storeUpload(receipt, studioId, e.organization_id);
    const [d] = await db()
      .insert(documents)
      .values({ studio_id: studioId, organization_id: e.organization_id, legal_entity_id: e.id, name: st.name, storage_path: st.storagePath, mime_type: st.mimeType, size_bytes: st.sizeBytes, category: "constancias", period: periodKey, source: "estudio", uploaded_by: actor.id, reviewed_at: new Date() })
      .returning({ id: documents.id });
    docId = d.id;
  }
  const { record } = await upsert(studioId, entityId, periodKey, { final_category: final, fee_new: feeStr(pf.scale.categories, final, row.params.activity), status: "recategorizado", recategorized_at: new Date(), receipt_document_id: docId ?? row.receiptDocumentId, reviewed_by: actor.id, reviewed_at: new Date() });
  await db().update(legal_entities).set({ category: final, updated_at: new Date() }).where(and(eq(legal_entities.id, e.id), eq(legal_entities.studio_id, studioId)));
  await audit({ studioId, organizationId: e.organization_id, actor, action: "recategorizacion.hecha", entityType: "monotributista", entityId, metadata: { periodo: periodKey, anterior: row.current, nueva: final, comprobante: !!docId } });
  return record;
}

const MSG = (r: Row, final: string, label: string) =>
  `Tu recategorización de monotributo de ${label}: ${r.current && r.current !== final ? `pasás de la categoría ${r.current} a la ${final}` : `seguís en la categoría ${final}`}${r.feeNew != null ? `, con una cuota mensual de ${formatAmount(r.feeNew, "ARS", { decimals: "none" })}` : ""}. Cualquier duda, escribinos.`;

/** Aviso al cliente por la app (campanita), mail y WhatsApp de los que ya están revisados o recategorizados */
export async function notifyClients(studioId: string, actor: Actor, entityIds: string[], periodKey: string, channels: { app: boolean; mail: boolean; whatsapp: boolean }) {
  const pf = await portfolio(studioId, periodKey);
  let sent = 0;
  for (const id of [...new Set(entityIds)]) {
    const r = pf.rows.find((x) => x.entityId === id);
    if (!r) throw new RecatError("No encontramos ese monotributista.");
    const final = r.final;
    if (!final || !["revisada", "recategorizado"].includes(r.status)) continue;
    const text = MSG(r, final, pf.period.label);
    const members = await db()
      .select({ id: users.id, email: users.email, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.user_id))
      .where(and(eq(memberships.organization_id, r.organizationId), eq(memberships.status, "activa"), eq(users.active, true)));
    const to = members.filter((m) => can(m.role, "vencimientos.ver"));
    if (channels.app && to.length) {
      const { notify } = await import("@/modules/notifications/server");
      await notify(to.map((m) => m.id), { kind: "fiscal", title: `Recategorización de ${pf.period.label}`, body: text, href: "/portal" });
    }
    if (channels.mail && to.length) {
      const { sendMail } = await import("@/lib/email");
      const { mailLayout } = await import("@/lib/notify");
      await sendMail({ to: to.map((m) => m.email), subject: `Tu recategorización de monotributo (${pf.period.label})`, html: mailLayout("Recategorización de monotributo", `<p>${text.replace(/</g, "&lt;")}</p>`) }).catch(() => undefined);
    }
    if (channels.whatsapp) {
      const { notifyOrgWhatsApp } = await import("@/modules/whatsapp/server");
      await notifyOrgWhatsApp(studioId, r.organizationId, "vencimientos", text).catch(() => 0);
    }
    await upsert(studioId, id, periodKey, { status: r.status === "recategorizado" ? "recategorizado" : r.status, notified_at: new Date() });
    await audit({ studioId, organizationId: r.organizationId, actor, action: "recategorizacion.aviso", entityType: "monotributista", entityId: id, metadata: { periodo: periodKey, canales: Object.entries(channels).filter(([, v]) => v).map(([k]) => k), categoria: final } });
    sent++;
  }
  return sent;
}

/** Una tarea del equipo por cada monotributista sin recategorizar, con vencimiento el día del vencimiento (sin duplicar) */
export async function createTasks(studioId: string, actor: Actor | null, periodKey?: string | null) {
  const pf = await portfolio(studioId, periodKey);
  let n = 0;
  for (const r of pf.rows.filter((x) => x.status !== "recategorizado")) {
    const res = await db()
      .insert(tasks)
      .values({ studio_id: studioId, organization_id: r.organizationId, title: `Recategorización de ${pf.period.label}: ${r.businessName}`, detail: `${r.current ?? "Sin categoría"} → ${r.suggested ?? "excluido"} (${r.movement}). Facturación de 12 meses: ${formatAmount(r.income12m, "ARS", { decimals: "none" })}.`, due_date: pf.period.deadline, source: "recategorizacion", source_ref: `${pf.period.key}:${r.entityId}`, created_by: actor?.id ?? null })
      .onConflictDoNothing()
      .returning({ id: tasks.id });
    n += res.length;
  }
  if (actor && n) await audit({ studioId, actor, action: "recategorizacion.tareas", entityType: "cartera", metadata: { periodo: pf.period.key, tareas: n } });
  return n;
}

export const summary = (rows: Row[]) => {
  const c: Record<Movement, number> = { sube: 0, baja: 0, mantiene: 0, excluido: 0, sin_categoria: 0 };
  for (const r of rows) c[r.movement]++;
  return c;
};
