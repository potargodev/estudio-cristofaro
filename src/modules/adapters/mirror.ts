import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { adapter_conflicts, external_records } from "@/db/schema";
import { upsertExternal, type Connection, type ExternalRow } from "@/modules/connectors/store";

// Espejo normalizado del núcleo (principios §22 y §22.a). Lo que llega de un
// sistema externo se guarda con su origen, su ID externo, la fecha, el estado
// de validación y el registro original (external_records). Idempotente por ID
// externo. Si un registro tiene cambios hechos en Faro que todavía no
// volvieron al otro sistema, y del otro lado también cambió lo mismo, no se
// pisa: queda un conflicto para que decida una persona (regla 3).

const val = (raw: unknown, field: string) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>)[field] : undefined);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Resultado de un upsert al espejo */
interface MirrorResult {
  saved: number;
  conflicts: number;
}

export async function upsertMirror(conn: Connection, source: string, rows: ExternalRow[]): Promise<MirrorResult> {
  if (!rows.length) return { saved: 0, conflicts: 0 };
  const db = getDb();
  const ids = [...new Set(rows.map((r) => r.externalId.slice(0, 120)))];
  const edited = await db
    .select()
    .from(external_records)
    .where(and(eq(external_records.connection_id, conn.id), inArray(external_records.external_id, ids), isNotNull(external_records.faro_edits)));
  const byKey = new Map(edited.map((r) => [`${r.resource}:${r.external_id}`, r]));
  const pass: ExternalRow[] = [];
  let conflicts = 0;
  for (const row of rows) {
    const prev = byKey.get(`${row.resource}:${row.externalId.slice(0, 120)}`);
    if (!prev?.faro_edits) {
      pass.push(row);
      continue;
    }
    // Campos editados en Faro que del otro lado también cambiaron desde la última sincronización
    const clash = Object.keys(prev.faro_edits).filter((f) => !same(val(row.raw, f), val(prev.raw, f)));
    if (!clash.length) {
      pass.push(row);
      continue;
    }
    const inserted = await db
      .insert(adapter_conflicts)
      .values({
        studio_id: conn.studio_id,
        organization_id: prev.organization_id,
        adapter: source,
        record_id: prev.id,
        fields: clash.map((f) => ({ field: f, faro: prev.faro_edits![f], externo: val(row.raw, f) })),
        incoming: row.raw as never,
      })
      .onConflictDoNothing()
      .returning({ id: adapter_conflicts.id });
    if (inserted.length) conflicts++;
  }
  const saved = await upsertExternal(conn, source, pass);
  return { saved, conflicts };
}
