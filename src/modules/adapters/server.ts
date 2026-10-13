import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adapter_conflicts, connections, external_records, org_adapters, org_sources, source_migrations, stock_conflicts, stock_stores, tango_conflicts, tango_documents, type MigrationTotals } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { Connection } from "@/modules/connectors/store";
import { ADAPTERS, adapterDef } from "./catalog";
import { coreTotals, implOf, stateOf, type Ctx, type OpResult } from "./registry";
import { AREAS, canWrite, isArea, type AdapterDef, type AdapterState, type Area, type Entity } from "./types";

// Operaciones del núcleo sobre los adaptadores (principios §22 y §22.a). Todo
// recibe el alcance ya validado (estudio y organización del usuario, nunca IDs
// del navegador sin cruzar) y queda en la auditoría.

type Actor = { id: string; email: string; name?: string };
export class AdapterError extends Error {}

const db = () => getDb();

// ───────────── Estado ─────────────

export interface OrgAdapter {
  def: AdapterDef;
  state: AdapterState;
}

/** Los adaptadores de la organización: los sistemas siempre; las tiendas y cobros, solo si están configurados */
export async function orgAdapters(ctx: Ctx): Promise<OrgAdapter[]> {
  const out = await Promise.all(ADAPTERS.map(async (def) => ({ def, state: await stateOf(ctx, def.key) })));
  return out.filter((a) => a.def.kind === "sistema" || a.def.kind === "archivos" || a.state.status !== "sin_configurar");
}

/** Fuente de verdad por área (sin fila: manda Faro) */
export async function sourcesOf(ctx: Ctx): Promise<Record<Area, string>> {
  const rows = await db()
    .select()
    .from(org_sources)
    .where(and(eq(org_sources.studio_id, ctx.studioId), eq(org_sources.organization_id, ctx.organizationId)));
  const out = Object.fromEntries(Object.keys(AREAS).map((a) => [a, "faro"])) as Record<Area, string>;
  for (const r of rows) if (isArea(r.area)) out[r.area] = r.source;
  return out;
}

/** ¿Quién manda en esta área? Lo usan facturación, compras, contabilidad y stock antes de escribir */
export async function sourceOf(ctx: Ctx, area: Area) {
  return (await sourcesOf(ctx))[area];
}

/**
 * Cambia la fuente de verdad de un área. Un solo dueño por área (§22.a,
 * regla 1): la fila es única, así que elegir un sistema saca a Faro y
 * viceversa. Solo puede mandar un sistema conectado que declare el área.
 */
export async function setSource(ctx: Ctx, actor: Actor, area: string, source: string) {
  if (!isArea(area)) throw new AdapterError("Esa área no existe.");
  if (source !== "faro") {
    const def = adapterDef(source);
    if (!def?.canOwn.includes(area)) throw new AdapterError(`${def?.name ?? "Ese sistema"} no puede ser la fuente de verdad de ${AREAS[area].toLowerCase()}.`);
    const st = await stateOf(ctx, source);
    if (st.status !== "conectado") throw new AdapterError(`Primero conectá ${def.name}: hoy está «${st.status.replace("_", " ")}».`);
  }
  const before = (await sourcesOf(ctx))[area];
  if (before === source) return;
  await db()
    .insert(org_sources)
    .values({ studio_id: ctx.studioId, organization_id: ctx.organizationId, area, source, set_by: actor.id })
    .onConflictDoUpdate({ target: [org_sources.organization_id, org_sources.area], set: { source, set_by: actor.id, set_at: new Date() } });
  await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.fuente", entityType: "organizacion", entityId: ctx.organizationId, metadata: { area, antes: before, ahora: source } });
}

async function setAdapterRow(ctx: Ctx, actor: Actor | null, key: string, patch: { status?: string; last_sync_at?: Date; last_result?: string }) {
  await db()
    .insert(org_adapters)
    .values({ studio_id: ctx.studioId, organization_id: ctx.organizationId, adapter: key, status: patch.status ?? "activo", last_sync_at: patch.last_sync_at, last_result: patch.last_result, updated_by: actor?.id ?? null })
    .onConflictDoUpdate({ target: [org_adapters.organization_id, org_adapters.adapter], set: { ...patch, updated_by: actor?.id ?? null, updated_at: new Date() } });
}

// ───────────── Operaciones ─────────────

export type AdapterOp = "sincronizar" | "publicar" | "pausar" | "reanudar" | "desconectar" | "reconectar";

export async function runOp(ctx: Ctx, actor: Actor | null, key: string, op: AdapterOp, opts: { days?: number } = {}): Promise<OpResult> {
  const def = adapterDef(key);
  const impl = implOf(key);
  if (!def || !impl) throw new AdapterError("Ese sistema no existe.");
  const st = await stateOf(ctx, key);
  let r: OpResult;
  switch (op) {
    case "sincronizar":
      if (st.status === "pausado" || st.status === "desconectado") throw new AdapterError(`${def.name} está ${st.status === "pausado" ? "en pausa" : "desconectado"}: reanudalo para sincronizar.`);
      if (!impl.sync) throw new AdapterError(def.kind === "archivos" ? "Los archivos se importan desde Conexiones → Archivos." : `${def.name} manda sus datos por aviso: no hace falta sincronizar a mano.`);
      r = await impl.sync(ctx, actor?.id ?? null, opts.days ?? 90);
      await setAdapterRow(ctx, actor, key, { last_sync_at: new Date(), last_result: r.message.slice(0, 300) });
      break;
    case "publicar":
      if (st.status !== "conectado") throw new AdapterError(`${def.name} no está conectado.`);
      if (!impl.publish) throw new AdapterError(`${def.name} no recibe datos de Faro: lo que se hace en Faro queda solo en Faro.`);
      r = await impl.publish(ctx);
      break;
    case "pausar":
      await setAdapterRow(ctx, actor, key, { status: "pausado" });
      r = { ok: true, message: `${def.name} en pausa: no se sincroniza ni se le escribe hasta que lo reanudes.` };
      break;
    case "reanudar":
    case "reconectar":
      await setAdapterRow(ctx, actor, key, { status: "activo" });
      r = { ok: true, message: `${def.name} ${op === "reanudar" ? "reanudado" : "vuelve a estar conectado"}.` };
      break;
    case "desconectar": {
      if (!actor) throw new AdapterError("Desconectar lo hace una persona.");
      // Desconectar no pierde nada: lo traído queda en el núcleo con su origen, y las áreas que mandaba pasan a Faro
      const sources = await sourcesOf(ctx);
      for (const [area, src] of Object.entries(sources)) if (src === key) await setSource(ctx, actor, area, "faro");
      await impl.disconnect?.(ctx);
      await setAdapterRow(ctx, actor, key, { status: "desconectado" });
      r = { ok: true, message: `${def.name} desconectado. Todo lo que trajo sigue en Faro${Object.values(sources).includes(key) ? ", y las áreas que mandaba ahora las maneja Faro" : ""}.` };
      break;
    }
  }
  await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, actorLabel: actor ? undefined : "Sistema", action: `nucleo.${op}`, entityType: "adaptador", entityId: key, result: r.ok ? "ok" : "error", metadata: { adaptador: key, mensaje: r.message.slice(0, 200) } });
  return r;
}

// ───────────── Conflictos (unificados: espejo, Tango y tiendas) ─────────────

interface ConflictView {
  id: string;
  /** espejo | tango | tienda */
  kind: "espejo" | "tango" | "tienda";
  adapter: string;
  title: string;
  fields: { field: string; faro: unknown; externo: unknown }[];
  createdAt: Date;
}

export async function conflictsOf(ctx: Ctx): Promise<ConflictView[]> {
  const [mirror, tango, stores] = await Promise.all([
    db()
      .select({ c: adapter_conflicts, name: external_records.name, resource: external_records.resource })
      .from(adapter_conflicts)
      .innerJoin(external_records, eq(external_records.id, adapter_conflicts.record_id))
      .where(and(eq(adapter_conflicts.studio_id, ctx.studioId), eq(adapter_conflicts.organization_id, ctx.organizationId), eq(adapter_conflicts.status, "abierto")))
      .orderBy(desc(adapter_conflicts.created_at)),
    db()
      .select({ c: tango_conflicts, number: tango_documents.number, customer: tango_documents.customer_std })
      .from(tango_conflicts)
      .innerJoin(tango_documents, eq(tango_documents.id, tango_conflicts.document_id))
      .where(and(eq(tango_conflicts.studio_id, ctx.studioId), eq(tango_documents.organization_id, ctx.organizationId), eq(tango_conflicts.status, "abierto"))),
    db()
      .select({ c: stock_conflicts, store: stock_stores.name, platform: stock_stores.platform })
      .from(stock_conflicts)
      .innerJoin(stock_stores, eq(stock_stores.id, stock_conflicts.store_id))
      .where(and(eq(stock_conflicts.studio_id, ctx.studioId), eq(stock_conflicts.organization_id, ctx.organizationId), eq(stock_conflicts.status, "abierto"))),
  ]);
  return [
    ...mirror.map(({ c, name, resource }) => ({ id: c.id, kind: "espejo" as const, adapter: c.adapter, title: `${resource === "clientes" ? "Cliente" : "Registro"}: ${name ?? "sin nombre"}`, fields: c.fields, createdAt: c.created_at })),
    ...tango.map(({ c, number, customer }) => ({ id: c.id, kind: "tango" as const, adapter: "tango", title: `Comprobante ${number} · ${customer}`, fields: c.fields.map((f) => ({ field: f.field, faro: f.faro, externo: f.tango })), createdAt: c.created_at })),
    ...stores.map(({ c, store, platform }) => ({ id: c.id, kind: "tienda" as const, adapter: `tienda_${platform}`, title: `Existencia en ${store}`, fields: [{ field: "existencia", faro: Number(c.faro_qty), externo: Number(c.remote_qty) }], createdAt: c.created_at })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

const RESOURCE_ENTITY: Record<string, Entity> = { clientes: "clientes", comprobantes_venta: "comprobantes_emitidos", comprobantes_compra: "comprobantes_recibidos", asientos: "asientos", archivos: "archivos" };

async function recordOf(ctx: Ctx, recordId: string) {
  const [row] = await db()
    .select({ r: external_records, conn: connections })
    .from(external_records)
    .innerJoin(connections, eq(connections.id, external_records.connection_id))
    .where(and(eq(external_records.id, recordId), eq(external_records.studio_id, ctx.studioId), eq(external_records.organization_id, ctx.organizationId)));
  if (!row) throw new AdapterError("Ese registro no es de esta organización.");
  return row;
}

/**
 * Escritura de vuelta según capacidades (§22.a, regla 4): si el sistema
 * permite modificar esa entidad, el cambio vuelve allá; si no, queda
 * «solo en Faro» y se ve marcado.
 */
async function writeBack(ctx: Ctx, conn: Connection, r: typeof external_records.$inferSelect, changes: Record<string, unknown>) {
  const def = adapterDef(conn.connector);
  const entity = RESOURCE_ENTITY[r.resource];
  const impl = implOf(conn.connector);
  const st = await stateOf(ctx, conn.connector);
  if (def && entity && canWrite(def, entity, "modificar") && impl?.write && st.status === "conectado") {
    await impl.write(conn, r.resource, r.external_id, changes);
    return true;
  }
  return false;
}

/** Edita en Faro un registro del espejo */
export async function editMirror(ctx: Ctx, actor: Actor, recordId: string, changes: Record<string, unknown>) {
  const { r, conn } = await recordOf(ctx, recordId);
  const written = await writeBack(ctx, conn, r, changes).catch((e) => {
    throw new AdapterError(`El otro sistema rechazó el cambio: ${(e as Error).message}`);
  });
  await db()
    .update(external_records)
    .set(written ? { raw: { ...(r.raw as object), ...changes } as never, faro_edits: null, local_only: false } : { faro_edits: { ...(r.faro_edits ?? {}), ...changes }, local_only: true })
    .where(eq(external_records.id, r.id));
  await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.editar_espejo", entityType: "registro_externo", entityId: r.id, metadata: { sistema: conn.connector, campos: Object.keys(changes), escrito: written } });
  return { written };
}

/** Resuelve un conflicto del espejo: vale lo de Faro o lo del otro sistema. Lo decide una persona. */
export async function resolveMirrorConflict(ctx: Ctx, actor: Actor, conflictId: string, keep: "faro" | "externo") {
  const [c] = await db()
    .select()
    .from(adapter_conflicts)
    .where(and(eq(adapter_conflicts.id, conflictId), eq(adapter_conflicts.studio_id, ctx.studioId), eq(adapter_conflicts.organization_id, ctx.organizationId), eq(adapter_conflicts.status, "abierto")));
  if (!c) throw new AdapterError("Ese conflicto no existe o ya se resolvió.");
  const { r, conn } = await recordOf(ctx, c.record_id);
  if (keep === "externo") {
    await db().update(external_records).set({ raw: c.incoming as never, faro_edits: null, local_only: false, synced_at: new Date() }).where(eq(external_records.id, r.id));
  } else {
    // Vale lo de Faro: se escribe del otro lado si se puede; si no, queda «solo en Faro»
    const written = await writeBack(ctx, conn, r, r.faro_edits ?? {}).catch(() => false);
    await db()
      .update(external_records)
      .set(written ? { raw: { ...(c.incoming as object), ...(r.faro_edits ?? {}) } as never, faro_edits: null, local_only: false } : { raw: c.incoming as never, local_only: true })
      .where(eq(external_records.id, r.id));
  }
  await db().update(adapter_conflicts).set({ status: "resuelto", resolution: keep, resolved_by: actor.id, resolved_at: new Date() }).where(eq(adapter_conflicts.id, c.id));
  await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.conflicto", entityType: "conflicto", entityId: c.id, metadata: { sistema: c.adapter, vale: keep } });
}

// ───────────── «Pasate a Faro» ─────────────

export async function migrationsOf(ctx: Ctx) {
  return db()
    .select()
    .from(source_migrations)
    .where(and(eq(source_migrations.studio_id, ctx.studioId), eq(source_migrations.organization_id, ctx.organizationId)))
    .orderBy(desc(source_migrations.created_at))
    .limit(10);
}

async function migrationOf(ctx: Ctx, id: string) {
  const [m] = await db()
    .select()
    .from(source_migrations)
    .where(and(eq(source_migrations.id, id), eq(source_migrations.studio_id, ctx.studioId), eq(source_migrations.organization_id, ctx.organizationId)));
  if (!m) throw new AdapterError("Esa migración no existe.");
  return m;
}

/** 1. Conectar ya está hecho: se arranca y se trae toda la historia */
export async function startMigration(ctx: Ctx, actor: Actor, key: string) {
  const def = adapterDef(key);
  if (!def || !def.canOwn.length) throw new AdapterError("Ese sistema no tiene historia para traer.");
  const st = await stateOf(ctx, key);
  if (st.status !== "conectado") throw new AdapterError(`Primero conectá ${def.name}.`);
  const sources = await sourcesOf(ctx);
  const areas = def.canOwn.filter((a) => sources[a] === key);
  const [m] = await db()
    .insert(source_migrations)
    .values({ studio_id: ctx.studioId, organization_id: ctx.organizationId, adapter: key, areas: areas.length ? areas : def.canOwn, created_by: actor.id })
    .returning();
  await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.migracion_iniciar", entityType: "migracion", entityId: m.id, metadata: { sistema: key } });
  return advanceMigration(ctx, actor, m.id);
}

/**
 * Avanza un paso: traer la historia (10 años) → controlar los totales contra
 * el sistema de origen → revisar (lo confirma la persona) → cambiar la fuente
 * de verdad a Faro → desconectar. Nunca quedan dos fuentes de verdad.
 */
export async function advanceMigration(ctx: Ctx, actor: Actor, id: string, opts: { confirm?: boolean } = {}) {
  const m = await migrationOf(ctx, id);
  const set = (patch: Partial<typeof source_migrations.$inferInsert>) => db().update(source_migrations).set({ ...patch, updated_at: new Date() }).where(eq(source_migrations.id, m.id));
  switch (m.step) {
    case "traer": {
      const r = await runOp(ctx, actor, m.adapter, "sincronizar", { days: 3650 }).catch((e: Error) => ({ ok: false, message: e.message }));
      if (!r.ok) throw new AdapterError(`No se pudo traer la historia: ${r.message}`);
      await set({ step: "controlar" });
      return advanceMigration(ctx, actor, id);
    }
    case "controlar": {
      const impl = implOf(m.adapter);
      const [remote, core] = await Promise.all([impl?.remoteTotals?.(ctx).catch(() => null) ?? null, coreTotals(ctx, m.adapter)]);
      const keys = [...new Set([...Object.keys(remote ?? {}), ...Object.keys(core)])];
      const totals: MigrationTotals = keys.map((k) => {
        const ext = remote?.[k] ?? core[k] ?? { count: 0, amount: 0 };
        const faro = core[k] ?? { count: 0, amount: 0 };
        return { entity: k, external: ext, faro, ok: ext.count === faro.count && Math.abs(ext.amount - faro.amount) < 0.01 };
      });
      await set({ step: "revisar", totals });
      await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.migracion_control", entityType: "migracion", entityId: m.id, result: totals.every((t) => t.ok) ? "ok" : "error", metadata: { totales: totals, sin_control_remoto: !remote } });
      return { step: "revisar", totals };
    }
    case "revisar": {
      if (!opts.confirm) throw new AdapterError("Revisá el control de totales y confirmá para cambiar la fuente de verdad.");
      if ((m.totals ?? []).some((t) => !t.ok)) throw new AdapterError("Los totales no coinciden: volvé a traer la historia antes de pasar a Faro.");
      for (const area of m.areas) await setSource(ctx, actor, area, "faro");
      await set({ step: "cambiar" });
      return advanceMigration(ctx, actor, id);
    }
    case "cambiar": {
      await runOp(ctx, actor, m.adapter, "desconectar");
      await set({ step: "hecha" });
      await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.migracion_hecha", entityType: "migracion", entityId: m.id, metadata: { sistema: m.adapter, areas: m.areas } });
      return { step: "hecha", totals: m.totals };
    }
    default:
      return { step: m.step, totals: m.totals };
  }
}

export async function cancelMigration(ctx: Ctx, actor: Actor, id: string) {
  const m = await migrationOf(ctx, id);
  if (m.step === "hecha") throw new AdapterError("Esa migración ya terminó.");
  await db().update(source_migrations).set({ step: "cancelada", updated_at: new Date() }).where(eq(source_migrations.id, m.id));
  await audit({ studioId: ctx.studioId, organizationId: ctx.organizationId, actor, action: "nucleo.migracion_cancelar", entityType: "migracion", entityId: m.id });
}

/** Después de emitir en Faro: si la fuente de verdad de la facturación es un sistema que acepta altas de comprobantes, se le publica */
export async function afterInvoice(ctx: Ctx) {
  const source = await sourceOf(ctx, "facturacion");
  const def = source === "faro" || source === "tango" ? null : adapterDef(source);
  if (!def || !canWrite(def, "comprobantes_emitidos", "crear")) return;
  await runOp(ctx, null, source, "publicar").catch((e) => console.error("[nucleo] publicar", (e as Error).message));
}
