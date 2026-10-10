import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { connection_logs, connections, external_records, legal_entities } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// Almacenamiento común de las conexiones: credenciales cifradas, log de
// sincronizaciones y registros externos con fuente, fecha de sincronización,
// ID externo, estado de validación y registro original.

export type Connection = typeof connections.$inferSelect;

export async function connectionOfStudio(id: string | null | undefined, studioId: string, connector?: string) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await getDb()
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.studio_id, studioId), connector ? eq(connections.connector, connector) : undefined));
  return c ?? null;
}

export async function connectionsOf(studioId: string, connector: string) {
  return getDb().select().from(connections).where(and(eq(connections.studio_id, studioId), eq(connections.connector, connector))).orderBy(connections.created_at);
}

export function readCredentials<T extends Record<string, string>>(c: Pick<Connection, "credentials_enc">): Partial<T> {
  if (!c.credentials_enc) return {};
  try {
    return JSON.parse(decrypt(c.credentials_enc)) as T;
  } catch {
    return {};
  }
}

export const sealCredentials = (creds: Record<string, string>) => encrypt(JSON.stringify(creds));

export async function startLog(connectionId: string, kind: "sync" | "test" | "import", actorId?: string | null) {
  const [row] = await getDb().insert(connection_logs).values({ connection_id: connectionId, kind, actor_id: actorId ?? null }).returning({ id: connection_logs.id });
  return row.id;
}

export async function endLog(logId: string, connectionId: string, ok: boolean, message: string, records = 0) {
  const db = getDb();
  const now = new Date();
  await db.update(connection_logs).set({ status: ok ? "ok" : "error", message: message.slice(0, 2000), records, finished_at: now }).where(eq(connection_logs.id, logId));
  const [log] = await db.select({ kind: connection_logs.kind }).from(connection_logs).where(eq(connection_logs.id, logId));
  await db
    .update(connections)
    .set({ status: ok ? "activa" : "error", last_error: ok ? null : message.slice(0, 500), ...(ok && log?.kind !== "test" ? { last_sync_at: now } : {}) })
    .where(eq(connections.id, connectionId));
}

export async function recentLogs(connectionId: string, limit = 15) {
  return getDb().select().from(connection_logs).where(eq(connection_logs.connection_id, connectionId)).orderBy(desc(connection_logs.started_at)).limit(limit);
}

export const digitsCuit = (v: unknown) => {
  const d = typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "";
  return d.length === 11 ? d : null;
};

/** Razones sociales del estudio por CUIT (para cruzar) */
export async function entitiesByCuit(studioId: string, cuits: (string | null)[]) {
  const list = [...new Set(cuits.filter((c): c is string => !!c))];
  if (!list.length) return new Map<string, { id: string; organizationId: string }>();
  const rows = await getDb()
    .select({ id: legal_entities.id, org: legal_entities.organization_id, cuit: legal_entities.cuit })
    .from(legal_entities)
    .where(and(eq(legal_entities.studio_id, studioId), inArray(legal_entities.cuit, list)));
  return new Map(rows.map((r) => [r.cuit!, { id: r.id, organizationId: r.org }]));
}

export interface ExternalRow {
  resource: string;
  externalId: string;
  cuit?: string | null;
  name?: string | null;
  date?: string | null;
  amount?: number | null;
  raw: unknown;
  organizationId?: string | null;
  legalEntityId?: string | null;
  validation?: "sin_cruzar" | "cruzado" | "validado" | "con_error";
}

/**
 * Guarda (upsert) los registros de una conexión. Si la fila no trae
 * organización, se cruza por CUIT con las razones sociales del estudio. Un
 * vínculo manual ya hecho (validado) no se pisa.
 */
export async function upsertExternal(conn: Connection, source: string, rows: ExternalRow[]) {
  if (!rows.length) return 0;
  const db = getDb();
  const byCuit = await entitiesByCuit(conn.studio_id, rows.map((r) => r.cuit ?? null));
  const now = new Date();
  // Un ID repetido en el lote haría fallar el upsert: queda el último
  const unique = new Map(rows.map((r) => [`${r.resource}:${r.externalId}`, r]));
  const values = [...unique.values()].map((r) => {
    const match = !r.organizationId && r.cuit ? byCuit.get(r.cuit) : null;
    const organizationId = r.organizationId ?? match?.organizationId ?? null;
    return {
      studio_id: conn.studio_id,
      connection_id: conn.id,
      source,
      resource: r.resource,
      external_id: r.externalId.slice(0, 120),
      cuit: r.cuit ?? null,
      name: r.name?.slice(0, 300) ?? null,
      record_date: r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null,
      amount: r.amount != null && Number.isFinite(r.amount) ? r.amount.toFixed(2) : null,
      validation_status: r.validation ?? (organizationId ? "cruzado" : "sin_cruzar"),
      raw: r.raw as never,
      organization_id: organizationId,
      legal_entity_id: r.legalEntityId ?? match?.id ?? null,
      synced_at: now,
    };
  });
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    await db
      .insert(external_records)
      .values(chunk)
      .onConflictDoUpdate({
        target: [external_records.connection_id, external_records.resource, external_records.external_id],
        set: {
          raw: sqlExcluded("raw"),
          cuit: sqlExcluded("cuit"),
          name: sqlExcluded("name"),
          record_date: sqlExcluded("record_date"),
          amount: sqlExcluded("amount"),
          synced_at: sqlExcluded("synced_at"),
          // El cruce se recalcula salvo que alguien lo haya validado a mano
          organization_id: sqlKeepValidated("organization_id"),
          legal_entity_id: sqlKeepValidated("legal_entity_id"),
          validation_status: sqlKeepValidated("validation_status"),
        },
      });
  }
  return values.length;
}

const sqlExcluded = (col: string) => sql.raw(`excluded.${col}`);
const sqlKeepValidated = (col: string) => sql.raw(`case when external_records.validation_status = 'validado' then external_records.${col} else excluded.${col} end`);

/** Registros de una conexión sin cruzar (para vincular a mano) */
export async function unmatched(connectionId: string, resource: string, limit = 50) {
  return getDb()
    .select()
    .from(external_records)
    .where(and(eq(external_records.connection_id, connectionId), eq(external_records.resource, resource), isNull(external_records.organization_id)))
    .limit(limit);
}
