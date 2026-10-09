import "server-only";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { integration_syncs, integrations, tango_companies, tango_records } from "@/db/schema";
import { hashConnectorKey } from "./keys";
import { getMapping, pick, pickCuit } from "./mapping";
import type { TangoBatch } from "./source";

// Guardado de lo que llega de Tango, sea cual sea el origen (TangoSource).

export type Integration = typeof integrations.$inferSelect;

export async function findIntegrationByKey(key: string): Promise<Integration | null> {
  const [row] = await getDb()
    .select()
    .from(integrations)
    .where(and(eq(integrations.connector_key_hash, hashConnectorKey(key)), eq(integrations.type, "tango")));
  return row ?? null;
}

type CompanyInfo = { id: string; name?: string | null };

async function upsertCompanies(studioId: string, companies: CompanyInfo[], synced = false) {
  if (companies.length === 0) return;
  const now = new Date();
  for (const c of companies) {
    await getDb()
      .insert(tango_companies)
      .values({ studio_id: studioId, company_id: c.id, name: c.name ?? null, last_sync_at: synced ? now : null })
      .onConflictDoUpdate({
        target: [tango_companies.studio_id, tango_companies.company_id],
        set: {
          ...(c.name ? { name: c.name } : {}),
          ...(synced ? { last_sync_at: now } : {}),
        },
      });
  }
}

/** Prueba de conexión del conector (`connector test`) */
export async function recordPing(integration: Integration, companies: (CompanyInfo & { ok?: boolean; error?: string | null })[]) {
  const db = getDb();
  await db.update(integrations).set({ last_seen_at: new Date() }).where(eq(integrations.id, integration.id));
  await upsertCompanies(integration.studio_id, companies.filter((c) => c.ok !== false));
  const failed = companies.filter((c) => c.ok === false);
  await db.insert(integration_syncs).values({
    integration_id: integration.id,
    sync_id: `test-${Date.now()}`,
    kind: "test",
    status: failed.length ? "error" : "ok",
    companies: companies.length,
    message: failed.length
      ? `Prueba con errores: ${failed.map((c) => `empresa ${c.id}: ${c.error ?? "sin respuesta"}`).join("; ")}`
      : `Prueba de conexión correcta (${companies.length} ${companies.length === 1 ? "empresa" : "empresas"}).`,
    finished_at: new Date(),
  });
}

export async function startSync(integration: Integration, syncId: string, companies: CompanyInfo[]) {
  const db = getDb();
  await db.update(integrations).set({ last_seen_at: new Date() }).where(eq(integrations.id, integration.id));
  await db
    .insert(integration_syncs)
    .values({ integration_id: integration.id, sync_id: syncId, kind: "sync", companies: companies.length })
    .onConflictDoNothing();
  await upsertCompanies(integration.studio_id, companies);
}

/** ID estable de un registro: el campo de ID del mapeo, o el CUIT, o un hash del JSON */
function externalId(raw: Record<string, unknown>, mapping: ReturnType<typeof getMapping>) {
  return (
    pick(raw, mapping.id) ??
    pickCuit(raw, mapping) ??
    `hash-${createHash("sha1").update(JSON.stringify(raw)).digest("hex").slice(0, 20)}`
  );
}

export async function saveBatches(integration: Integration, syncId: string, batches: TangoBatch[]) {
  const db = getDb();
  const mapping = getMapping(integration.settings);
  let saved = 0;
  for (const batch of batches) {
    await upsertCompanies(integration.studio_id, [{ id: batch.companyId, name: batch.companyName }], true);
    // Un mismo id repetido en el lote haría fallar el upsert: queda el último
    const rows = new Map<string, Record<string, unknown>>();
    for (const raw of batch.records) rows.set(externalId(raw, mapping), raw);
    if (rows.size === 0) continue;
    const now = new Date();
    await db
      .insert(tango_records)
      .values(
        [...rows].map(([external_id, raw]) => ({
          studio_id: integration.studio_id,
          company_id: batch.companyId,
          process: batch.process,
          external_id,
          raw,
          synced_at: now,
        })),
      )
      .onConflictDoUpdate({
        target: [tango_records.studio_id, tango_records.company_id, tango_records.process, tango_records.external_id],
        set: { raw: sql`excluded.raw`, synced_at: sql`excluded.synced_at` },
      });
    saved += rows.size;
  }
  await db
    .update(integration_syncs)
    .set({ records: sql`${integration_syncs.records} + ${saved}` })
    .where(and(eq(integration_syncs.integration_id, integration.id), eq(integration_syncs.sync_id, syncId)));
  await db.update(integrations).set({ last_seen_at: new Date() }).where(eq(integrations.id, integration.id));
  return saved;
}

export async function endSync(integration: Integration, syncId: string, ok: boolean, message?: string | null) {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(integration_syncs)
    .set({ status: ok ? "ok" : "error", finished_at: now, message: message ?? null })
    .where(and(eq(integration_syncs.integration_id, integration.id), eq(integration_syncs.sync_id, syncId)))
    .returning();
  await db
    .update(integrations)
    .set({ last_seen_at: now, ...(ok ? { last_sync_at: now } : {}) })
    .where(eq(integrations.id, integration.id));
  return row ?? null;
}
