import "server-only";
import { and, asc, desc, eq, gte, lte, max, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { arca_status_checks, invoice_batch_rows, invoices, organizations, studios } from "@/db/schema";
import { audit } from "@/lib/audit";
import { CBTE_TYPES } from "./config";
import { loadCredential } from "./credentials";
import { feDummy } from "./wsfe";

// ARCA caído (§2.p, B5): el estado de los servidores de ARCA (FEDummy) con su
// historial, y la cola de emisión. Si ARCA no responde, el comprobante queda
// «en cola» con un número previsto (el siguiente de su CUIT, punto de venta y
// tipo, contando los que ya esperan), se emite solo y en orden cuando ARCA
// vuelve, y avisa. Nunca dos comprobantes con el mismo número: la cola se
// procesa en orden y de a uno por CUIT, punto de venta y tipo, y el número
// definitivo lo da ARCA al emitir.

const db = () => getDb();
type Env = "homologacion" | "produccion" | "simulador";
type Inv = typeof invoices.$inferSelect;

interface ArcaHealth {
  ok: boolean;
  app: string | null;
  db: string | null;
  auth: string | null;
  latency: number | null;
  error: string | null;
  checkedAt: Date;
}

/** Consulta FEDummy y lo guarda en el historial */
export async function checkArca(env: Env): Promise<ArcaHealth> {
  const t0 = Date.now();
  let h: ArcaHealth;
  try {
    const cred = await loadCredential(env);
    const r = await feDummy(cred);
    const ok = r.app === "OK" && r.db === "OK" && r.auth === "OK";
    h = { ok, app: r.app, db: r.db, auth: r.auth, latency: Date.now() - t0, error: ok ? null : "Algún servidor de ARCA no responde OK.", checkedAt: new Date() };
  } catch (e) {
    h = { ok: false, app: null, db: null, auth: null, latency: Date.now() - t0, error: (e as Error).message.slice(0, 300), checkedAt: new Date() };
  }
  await db().insert(arca_status_checks).values({ environment: env, ok: h.ok, app: h.app, db: h.db, auth: h.auth, latency_ms: h.latency, error: h.error, checked_at: h.checkedAt });
  return h;
}

/** Último estado conocido (sin consultar a ARCA) */
async function lastHealth(env: Env) {
  const [r] = await db().select().from(arca_status_checks).where(eq(arca_status_checks.environment, env)).orderBy(desc(arca_status_checks.checked_at)).limit(1);
  return r ?? null;
}

/** Historial de las últimas horas y disponibilidad (porcentaje de chequeos OK) */
export async function healthHistory(env: Env, hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db().select().from(arca_status_checks).where(and(eq(arca_status_checks.environment, env), gte(arca_status_checks.checked_at, since))).orderBy(desc(arca_status_checks.checked_at)).limit(500);
  const ok = rows.filter((r) => r.ok).length;
  return { rows, uptime: rows.length ? ok / rows.length : null, last: rows[0] ?? null };
}

/** ¿Hay que encolar en vez de emitir? Si ARCA figura caído hace poco, o ya hay cola para esa numeración */
export async function shouldQueue(inv: Inv) {
  const last = await lastHealth(inv.environment as Env);
  if (last && !last.ok && Date.now() - last.checked_at.getTime() < 5 * 60_000) return "ARCA no responde (estado de los servidores).";
  const [waiting] = await db()
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.status, "en_cola"), eq(invoices.cuit, inv.cuit), eq(invoices.environment, inv.environment), eq(invoices.point_of_sale, inv.point_of_sale), eq(invoices.cbte_type, inv.cbte_type), sql`${invoices.id} <> ${inv.id}`))
    .limit(1);
  return waiting ? "Hay comprobantes esperando antes en la cola de esta numeración." : null;
}

/** Número previsto: el último autorizado o previsto de esa numeración, más uno */
async function nextReserved(inv: Inv) {
  const key = and(eq(invoices.cuit, inv.cuit), eq(invoices.environment, inv.environment), eq(invoices.point_of_sale, inv.point_of_sale), eq(invoices.cbte_type, inv.cbte_type));
  const [a] = await db().select({ n: max(invoices.number) }).from(invoices).where(and(key, eq(invoices.status, "autorizada")));
  const [q] = await db().select({ n: max(invoices.reserved_number) }).from(invoices).where(and(key, eq(invoices.status, "en_cola"), sql`${invoices.id} <> ${inv.id}`));
  return Math.max(a?.n ?? 0, q?.n ?? 0) + 1;
}

/** Pasa el comprobante a la cola (conserva el número si ya lo tenía, para recuperar el CAE si llegó a ARCA) */
export async function enqueue(inv: Inv, actorId: string, reason: string) {
  const reserved = inv.reserved_number ?? (await nextReserved(inv));
  const [r] = await db()
    .update(invoices)
    .set({ status: "en_cola", queued_at: inv.queued_at ?? new Date(), queued_by: inv.queued_by ?? actorId, queue_reason: reason, reserved_number: reserved, attempts: sql`${invoices.attempts} + 1`, next_attempt_at: new Date(Date.now() + 60_000), error: null })
    .where(eq(invoices.id, inv.id))
    .returning();
  await audit({ studioId: inv.studio_id, organizationId: inv.organization_id, actorLabel: "Cola de ARCA", action: "factura.en_cola", entityType: "factura", entityId: inv.id, metadata: { motivo: reason, numero_previsto: reserved, tipo: CBTE_TYPES[inv.cbte_type]?.label } });
  return r;
}

/** Comprobantes en cola de un estudio (para las pantallas) */
export async function queueOf(studioId: string) {
  return db().select().from(invoices).where(and(eq(invoices.studio_id, studioId), eq(invoices.status, "en_cola"))).orderBy(asc(invoices.queued_at));
}

/**
 * Procesa la cola: si ARCA responde, emite en orden (de a uno por
 * numeración) y avisa a quien lo había mandado. Devuelve cuántos salieron.
 */
export async function processQueue(limit = 50) {
  const pending = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.status, "en_cola"), or(sql`${invoices.next_attempt_at} is null`, lte(invoices.next_attempt_at, new Date()))))
    .orderBy(asc(invoices.queued_at))
    .limit(limit);
  if (!pending.length) return { emitidos: 0, rechazados: 0, siguenEnCola: 0 };
  const envs = [...new Set(pending.map((p) => p.environment as Env))];
  const up = new Map<Env, boolean>();
  for (const e of envs) up.set(e, (await checkArca(e)).ok);
  const { emitInvoice } = await import("./server");
  const { notify } = await import("@/modules/notifications/server");
  let emitidos = 0;
  let rechazados = 0;
  let siguen = 0;
  const blocked = new Set<string>();
  for (const inv of pending) {
    const key = `${inv.cuit}:${inv.environment}:${inv.point_of_sale}:${inv.cbte_type}`;
    if (!up.get(inv.environment as Env) || blocked.has(key)) {
      siguen++;
      continue;
    }
    const scope = await scopeOf(inv);
    const actor = { id: inv.queued_by ?? "", email: "cola@faro", name: "Cola de ARCA", role: "dueno" };
    try {
      const r = await emitInvoice(scope, inv.id, actor, "cola");
      if (r.status === "autorizada") {
        emitidos++;
        await db().update(invoice_batch_rows).set({ status: "emitida" }).where(eq(invoice_batch_rows.invoice_id, r.id));
        await notify([inv.queued_by], { kind: "fiscal", title: `Se emitió ${CBTE_TYPES[r.cbte_type]?.label ?? "el comprobante"} ${r.number} que estaba en cola`, body: `${r.customer_name}${r.reserved_number && r.number !== r.reserved_number ? ` · el número previsto era ${r.reserved_number}: ARCA dio el ${r.number}` : ""}`, href: `${scope.base}/${r.id}`, refId: r.id });
      } else if (r.status === "en_cola") {
        siguen++;
        blocked.add(key);
      } else {
        rechazados++;
        blocked.add(key);
        await db().update(invoice_batch_rows).set({ status: "fallida", last_error: r.error }).where(eq(invoice_batch_rows.invoice_id, r.id));
        await notify([inv.queued_by], { kind: "fiscal", title: "Un comprobante de la cola fue rechazado por ARCA", body: `${r.customer_name}: ${r.error ?? ""}`.slice(0, 280), href: `${scope.base}/${r.id}`, refId: r.id });
      }
    } catch {
      siguen++;
      blocked.add(key);
    }
  }
  return { emitidos, rechazados, siguenEnCola: siguen };
}

/** Alcance de emisión de un comprobante guardado (para la cola y los lotes) */
export async function scopeOf(inv: Pick<Inv, "studio_id" | "organization_id" | "cuit">) {
  const [t] = await db().select({ kind: studios.kind }).from(studios).where(eq(studios.id, inv.studio_id));
  const [o] = await db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, inv.organization_id));
  const personal = t?.kind !== "studio";
  return {
    studioId: inv.studio_id,
    organizationId: inv.organization_id,
    organizationName: o?.name ?? "",
    cuit: inv.cuit,
    kind: personal ? ("personal" as const) : ("studio" as const),
    canEmit: true,
    base: personal ? "/facturacion" : `/admin/organizaciones/${inv.organization_id}/arca`,
    home: personal ? "/facturacion" : `/admin/organizaciones/${inv.organization_id}?tab=arca`,
  };
}

/** Chequeo periódico del estado (aunque no haya cola), para el historial y la página /estado */
export async function periodicCheck(everyMs = 5 * 60_000) {
  const out: Env[] = [];
  for (const env of ["homologacion", "produccion"] as Env[]) {
    const last = await lastHealth(env);
    if (last && Date.now() - last.checked_at.getTime() < everyMs) continue;
    // Solo los ambientes con certificado cargado
    try {
      await loadCredential(env);
    } catch {
      continue;
    }
    await checkArca(env);
    out.push(env);
  }
  return out;
}

