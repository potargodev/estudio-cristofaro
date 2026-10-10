import "server-only";
import { and, count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { connections, external_records, integrations, tango_records } from "@/db/schema";
import { TANGO_PROCESS } from "@/lib/integrations/tango/constants";
import { CONNECTORS, type ConnectorDefinition } from "./catalog";

// Estado de cada conector del catálogo para el hub. Tango conserva su tabla
// (integrations) y su conector local; el resto usa `connections`.

export type HubState = "conectada" | "error" | "pausada" | "pendiente" | "sin_configurar";

export interface HubEntry {
  def: ConnectorDefinition;
  state: HubState;
  accounts: number;
  records: number;
  lastSync: Date | null;
  detail?: string | null;
}

export async function hubEntries(studioId: string): Promise<HubEntry[]> {
  const db = getDb();
  const [[tango], [tangoRecords], rows, recs] = await Promise.all([
    db.select().from(integrations).where(and(eq(integrations.studio_id, studioId), eq(integrations.type, "tango"))),
    db.select({ n: count() }).from(tango_records).where(and(eq(tango_records.studio_id, studioId), eq(tango_records.process, TANGO_PROCESS.clientes))),
    db.select().from(connections).where(eq(connections.studio_id, studioId)),
    db.select({ connector: connections.connector, n: count() }).from(external_records).innerJoin(connections, eq(connections.id, external_records.connection_id)).where(eq(external_records.studio_id, studioId)).groupBy(connections.connector),
  ]);
  const recordsBy = new Map(recs.map((r) => [r.connector, r.n]));
  return CONNECTORS.map((def) => {
    if (def.key === "tango") {
      const hours = tango?.last_seen_at ? (Date.now() - tango.last_seen_at.getTime()) / 3600000 : null;
      return {
        def,
        state: !tango ? "sin_configurar" : tango.status === "pausada" ? "pausada" : hours === null ? "pendiente" : hours < 26 ? "conectada" : "error",
        accounts: tango ? 1 : 0,
        records: tangoRecords.n,
        lastSync: tango?.last_sync_at ?? null,
        detail: !tango ? null : hours === null ? "Esperando al conector" : hours >= 26 ? "Sin contacto hace más de un día" : null,
      };
    }
    const mine = rows.filter((r) => r.connector === def.key);
    const state: HubState = !mine.length
      ? "sin_configurar"
      : mine.some((r) => r.status === "error")
        ? "error"
        : mine.some((r) => r.status === "activa")
          ? "conectada"
          : mine.every((r) => r.status === "pausada")
            ? "pausada"
            : "pendiente";
    const last = mine.map((r) => r.last_sync_at).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return { def, state, accounts: mine.length, records: recordsBy.get(def.key) ?? 0, lastSync: last, detail: mine.find((r) => r.last_error)?.last_error ?? null };
  });
}
