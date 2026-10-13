import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoice_batch_rows, invoice_batches, invoices, legal_entities, organizations, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { todayAR } from "@/lib/format";
import { ArcaError } from "@/modules/arca/soap";
import { cbteFrom, mapRows, parseText, validate, type BatchRow } from "./core";

// Facturación en lote (§2.p, B2): el lote se valida entero antes de emitir
// (cada fila dice qué corregir), después una cola lo procesa con progreso en
// vivo, reintentos e idempotencia (la clave lote:fila nunca crea dos
// comprobantes). En modo «borradores» quedan para revisar; en modo «emitir»
// los emite la cola porque una persona lo pidió para ese lote.

const db = () => getDb();
export class BatchError extends Error {}
type Actor = { id: string; email: string; name?: string; role: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ROWS = 5000;

export interface BatchScope {
  studioId: string;
  /** Lote de una sola organización (o de la cuenta personal); null = panel del estudio (CUIT emisora por fila) */
  organizationId: string | null;
  cuit: string | null;
  canEmit: boolean;
}

/** Lee la planilla: .xlsx, .csv/.txt o texto pegado */
export async function readTable(input: { file?: File | null; text?: string | null }): Promise<unknown[][]> {
  if (input.file && input.file.size) {
    if (input.file.size > 10 * 1024 * 1024) throw new BatchError("El archivo supera los 10 MB.");
    const name = input.file.name.toLowerCase();
    if (name.endsWith(".xlsx")) {
      const { readSheet } = await import("read-excel-file/node");
      return (await readSheet(Buffer.from(await input.file.arrayBuffer()))) as unknown[][];
    }
    if (name.endsWith(".csv") || name.endsWith(".txt")) return parseText(await input.file.text());
    throw new BatchError("Subí un Excel (.xlsx) o un CSV.");
  }
  if (input.text?.trim()) return parseText(input.text);
  throw new BatchError("Subí la planilla o pegá las filas.");
}

/** Emisores posibles del lote: la CUIT de la organización o, en el panel, las de toda la cartera */
async function issuers(s: BatchScope) {
  const rows = await db()
    .select({ cuit: legal_entities.cuit, org: legal_entities.organization_id })
    .from(legal_entities)
    .innerJoin(organizations, and(eq(organizations.id, legal_entities.organization_id), eq(organizations.studio_id, s.studioId)))
    .where(and(eq(legal_entities.studio_id, s.studioId), eq(legal_entities.active, true), ...(s.organizationId ? [eq(legal_entities.organization_id, s.organizationId)] : [])));
  return new Map(rows.filter((r) => r.cuit).map((r) => [r.cuit!.replace(/\D/g, ""), r.org]));
}

/** Crea el lote validado (no emite nada todavía) */
export async function createBatch(s: BatchScope, actor: Actor, i: { name: string; source: "excel" | "csv" | "pegado" | "app"; mode: "borradores" | "emitir"; table: unknown[][] }) {
  if (i.mode === "emitir" && !s.canEmit) throw new BatchError("Tu rol prepara borradores: el lote se emite con un dueño o un contador.");
  const { rows, unknown } = mapRows(i.table);
  if (!rows.length) throw new BatchError("La planilla no tiene filas (la primera fila son los encabezados).");
  if (rows.length > MAX_ROWS) throw new BatchError(`Un lote admite hasta ${MAX_ROWS} filas.`);
  const checked = validate(rows, { needsIssuer: !s.organizationId, today: todayAR() });
  const iss = await issuers(s);
  const final = checked.map((c) => {
    if (!c.data) return { ...c, org: null as string | null };
    const cuit = c.data.issuerCuit ?? s.cuit;
    const org = cuit ? (iss.get(cuit) ?? (s.organizationId && cuit === s.cuit ? s.organizationId : null)) : s.organizationId;
    if (!org || !cuit) return { ...c, data: null, errors: [s.organizationId ? "Esa CUIT emisora no es de esta organización." : "Esa CUIT emisora no es de ninguna organización del estudio."], org: null };
    return { ...c, data: { ...c.data, issuerCuit: cuit }, org };
  });
  const valid = final.filter((r) => r.data).length;
  const [b] = await db()
    .insert(invoice_batches)
    .values({ studio_id: s.studioId, name: i.name.trim().slice(0, 120) || `Lote del ${todayAR()}`, source: i.source, mode: i.mode, status: "validado", rows_total: final.length, rows_valid: valid, created_by: actor.id })
    .returning();
  for (let k = 0; k < final.length; k += 500) {
    await db()
      .insert(invoice_batch_rows)
      .values(final.slice(k, k + 500).map((r) => ({ batch_id: b.id, studio_id: s.studioId, organization_id: r.org, row_number: r.row, data: (r.data ?? {}) as Record<string, unknown>, errors: r.errors, status: r.data ? "pendiente" : "invalida" })));
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "lote.crear", entityType: "lote", entityId: b.id, metadata: { filas: final.length, validas: valid, modo: i.mode, origen: i.source, columnas_ignoradas: unknown } });
  return { batch: b, valid, invalid: final.length - valid, unknown };
}

async function own(s: BatchScope, id: string) {
  if (!UUID.test(id)) throw new BatchError("No encontramos ese lote.");
  const [b] = await db().select().from(invoice_batches).where(and(eq(invoice_batches.id, id), eq(invoice_batches.studio_id, s.studioId)));
  if (!b) throw new BatchError("No encontramos ese lote.");
  if (s.organizationId) {
    const [other] = await db().select({ id: invoice_batch_rows.id }).from(invoice_batch_rows).where(and(eq(invoice_batch_rows.batch_id, b.id), sql`${invoice_batch_rows.organization_id} is distinct from ${s.organizationId}`, sql`${invoice_batch_rows.status} <> 'invalida'`)).limit(1);
    if (other) throw new BatchError("No encontramos ese lote.");
  }
  return b;
}

/** Arranca (o reanuda) el lote: la cola lo procesa con progreso en vivo */
export async function startBatch(s: BatchScope, actor: Actor, id: string) {
  const b = await own(s, id);
  if (b.mode === "emitir" && !s.canEmit) throw new BatchError("Tu rol prepara borradores: el lote se emite con un dueño o un contador.");
  if (!["validado", "pausado"].includes(b.status)) throw new BatchError("Ese lote ya está en curso o terminó.");
  if (!b.rows_valid) throw new BatchError("El lote no tiene filas válidas.");
  await db().update(invoice_batches).set({ status: "en_curso", started_at: b.started_at ?? new Date() }).where(eq(invoice_batches.id, b.id));
  await audit({ studioId: s.studioId, actor, action: b.status === "pausado" ? "lote.reanudar" : "lote.emitir", entityType: "lote", entityId: b.id, metadata: { modo: b.mode, filas: b.rows_valid } });
}

export async function pauseBatch(s: BatchScope, actor: Actor, id: string, cancel = false) {
  const b = await own(s, id);
  if (!["en_curso", "pausado", "validado"].includes(b.status)) throw new BatchError("Ese lote ya terminó.");
  await db().update(invoice_batches).set({ status: cancel ? "cancelado" : "pausado", ...(cancel ? { finished_at: new Date() } : {}) }).where(eq(invoice_batches.id, b.id));
  if (cancel) await db().update(invoice_batch_rows).set({ status: "omitida" }).where(and(eq(invoice_batch_rows.batch_id, b.id), eq(invoice_batch_rows.status, "pendiente")));
  await audit({ studioId: s.studioId, actor, action: cancel ? "lote.cancelar" : "lote.pausar", entityType: "lote", entityId: b.id });
}

/** Vuelve a la cola las filas que fallaron (la idempotencia evita duplicar las que sí salieron) */
export async function retryFailed(s: BatchScope, actor: Actor, id: string) {
  const b = await own(s, id);
  const r = await db().update(invoice_batch_rows).set({ status: "pendiente", last_error: null }).where(and(eq(invoice_batch_rows.batch_id, b.id), eq(invoice_batch_rows.status, "fallida"))).returning({ id: invoice_batch_rows.id });
  if (r.length) await db().update(invoice_batches).set({ status: "en_curso", finished_at: null }).where(eq(invoice_batches.id, b.id));
  await audit({ studioId: s.studioId, actor, action: "lote.reintentar", entityType: "lote", entityId: b.id, metadata: { filas: r.length } });
  return r.length;
}

/** Progreso del lote: conteo por estado */
export async function progressOf(s: BatchScope, id: string) {
  const b = await own(s, id);
  const counts = await db().select({ status: invoice_batch_rows.status, n: sql<number>`count(*)::int` }).from(invoice_batch_rows).where(eq(invoice_batch_rows.batch_id, b.id)).groupBy(invoice_batch_rows.status);
  const by = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>;
  const done = (by.emitida ?? 0) + (by.borrador ?? 0) + (by.en_cola ?? 0) + (by.fallida ?? 0) + (by.omitida ?? 0);
  return { batch: b, by, done, total: b.rows_valid, pct: b.rows_valid ? Math.round((done / b.rows_valid) * 100) : 0 };
}

export async function rowsOf(s: BatchScope, id: string, f: { status?: string | null; limit?: number } = {}) {
  const b = await own(s, id);
  return db()
    .select({ r: invoice_batch_rows, inv: { id: invoices.id, number: invoices.number, point_of_sale: invoices.point_of_sale, cbte_type: invoices.cbte_type, cae: invoices.cae, total: invoices.total, status: invoices.status, customer_name: invoices.customer_name, customer_email: invoices.customer_email, reserved_number: invoices.reserved_number } })
    .from(invoice_batch_rows)
    .leftJoin(invoices, eq(invoices.id, invoice_batch_rows.invoice_id))
    .where(and(eq(invoice_batch_rows.batch_id, b.id), ...(f.status ? [eq(invoice_batch_rows.status, f.status)] : [])))
    .orderBy(asc(invoice_batch_rows.row_number))
    .limit(f.limit ?? 5000);
}

export async function listBatches(s: BatchScope, limit = 30) {
  const rows = await db().select().from(invoice_batches).where(eq(invoice_batches.studio_id, s.studioId)).orderBy(desc(invoice_batches.created_at)).limit(limit * 3);
  if (!s.organizationId) return rows.slice(0, limit);
  // En una organización, solo los lotes de esa organización
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const mine = await db().selectDistinct({ id: invoice_batch_rows.batch_id }).from(invoice_batch_rows).where(and(inArray(invoice_batch_rows.batch_id, ids), eq(invoice_batch_rows.organization_id, s.organizationId)));
  const set = new Set(mine.map((m) => m.id));
  return rows.filter((r) => set.has(r.id)).slice(0, limit);
}

const draftOf = (d: BatchRow) => ({
  cbteType: cbteFrom(d.type),
  pointOfSale: d.pointOfSale ?? 0,
  issueDate: d.issueDate ?? todayAR(),
  concept: d.concept,
  customer: { docType: d.customerDocType, docNumber: d.customerDoc, name: d.customerName, ivaCondition: d.ivaCondition, email: d.email },
  items: d.items.map((x) => ({ description: x.description, quantity: x.quantity, unitPrice: x.unitPrice, ivaRate: x.ivaRate })),
});

/**
 * Cola de lotes: toma filas pendientes de los lotes en curso (las reclama de a
 * una para que nunca se procesen dos veces), arma el borrador con la clave
 * lote:fila y, en modo emitir, lo emite. Al terminar avisa a quien lo creó.
 */
export async function processBatches(maxRows = 100) {
  const { createDraft, emitInvoice } = await import("@/modules/arca/server");
  const { scopeOf } = await import("@/modules/arca/queue");
  const { notify } = await import("@/modules/notifications/server");
  const active = await db().select().from(invoice_batches).where(eq(invoice_batches.status, "en_curso")).orderBy(asc(invoice_batches.started_at));
  let processed = 0;
  for (const b of active) {
    const [creator] = await db().select({ kind: studios.kind }).from(studios).where(eq(studios.id, b.studio_id));
    while (processed < maxRows) {
      // Reclamo atómico de la próxima fila
      const [row] = await db()
        .update(invoice_batch_rows)
        .set({ status: "procesando", attempts: sql`${invoice_batch_rows.attempts} + 1` })
        .where(sql`${invoice_batch_rows.id} = (select id from invoice_batch_rows where batch_id = ${b.id} and status = 'pendiente' order by row_number limit 1 for update skip locked)`)
        .returning();
      if (!row) break;
      processed++;
      const d = row.data as unknown as BatchRow;
      const actor = { id: b.created_by ?? "", email: "lote@faro", name: "Lote", role: creator?.kind === "studio" ? "dueno" : "titular" };
      try {
        const scope = await scopeOf({ studio_id: b.studio_id, organization_id: row.organization_id!, cuit: d.issuerCuit! });
        let pos = d.pointOfSale;
        if (!pos) {
          // Punto de venta por defecto: el primero habilitado para web services de esa CUIT
          const { listPoints } = await import("@/modules/arca/server");
          pos = (await listPoints(scope)).find((p) => !p.blocked)?.number ?? 1;
        }
        const draft = await createDraft(scope, { ...draftOf(d), pointOfSale: pos, idempotencyKey: `lote:${b.id}:${row.row_number}`, batchId: b.id }, actor, "lote");
        let status = "borrador";
        let error: string | null = null;
        if (b.mode === "emitir") {
          const inv = draft.status === "autorizada" || draft.status === "en_cola" ? draft : await emitInvoice(scope, draft.id, actor, "lote");
          status = inv.status === "autorizada" ? "emitida" : inv.status === "en_cola" ? "en_cola" : "fallida";
          error = status === "fallida" ? (inv.error ?? "ARCA lo rechazó.") : null;
        }
        await db().update(invoice_batch_rows).set({ status, invoice_id: draft.id, last_error: error }).where(eq(invoice_batch_rows.id, row.id));
      } catch (e) {
        const msg = e instanceof ArcaError || e instanceof BatchError ? e.message : (e as Error).message;
        await db().update(invoice_batch_rows).set({ status: "fallida", last_error: msg.slice(0, 300) }).where(eq(invoice_batch_rows.id, row.id));
      }
    }
    const [left] = await db().select({ n: sql<number>`count(*)::int` }).from(invoice_batch_rows).where(and(eq(invoice_batch_rows.batch_id, b.id), inArray(invoice_batch_rows.status, ["pendiente", "procesando"])));
    if (!left.n) {
      const [fin] = await db().update(invoice_batches).set({ status: "terminado", finished_at: new Date() }).where(and(eq(invoice_batches.id, b.id), eq(invoice_batches.status, "en_curso"))).returning();
      if (fin) {
        const counts = await db().select({ status: invoice_batch_rows.status, n: sql<number>`count(*)::int` }).from(invoice_batch_rows).where(eq(invoice_batch_rows.batch_id, b.id)).groupBy(invoice_batch_rows.status);
        const by = Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>;
        const base = creator?.kind === "studio" ? "/admin/facturacion/lotes" : "/facturacion/lotes";
        await notify([b.created_by], { kind: "fiscal", title: `Terminó el lote «${b.name}»`, body: `${by.emitida ?? 0} emitidos, ${by.borrador ?? 0} borradores, ${by.en_cola ?? 0} en cola y ${by.fallida ?? 0} con error.`, href: `${base}/${b.id}`, refId: b.id });
        await audit({ studioId: b.studio_id, actorLabel: "Cola de lotes", action: "lote.terminado", entityType: "lote", entityId: b.id, metadata: by });
      }
    }
    if (processed >= maxRows) break;
  }
  return processed;
}

/** Filas que quedaron «procesando» por un corte (más de 10 minutos): vuelven a la cola */
export async function recoverStuckRows() {
  const r = await db()
    .update(invoice_batch_rows)
    .set({ status: "pendiente" })
    .where(and(eq(invoice_batch_rows.status, "procesando"), sql`${invoice_batch_rows.updated_at} < now() - interval '10 minutes'`))
    .returning({ id: invoice_batch_rows.id });
  return r.length;
}
