import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { healthHistory } from "@/modules/arca/queue";

// Estado público de Faro (§2.p, B9): la app, la base y los servidores de ARCA
// (FEDummy de las últimas 24 h) y si hay comprobantes esperando en la cola.
// Sin datos de ningún tenant: solo totales.

type Level = "operativo" | "con_demoras" | "caido" | "sin_datos";

export async function publicStatus() {
  let base: Level = "operativo";
  try {
    await getDb().execute(sql`select 1`);
  } catch {
    base = "caido";
  }
  const arca = async (env: "produccion" | "homologacion") => {
    const h = await healthHistory(env, 24).catch(() => null);
    const last = h?.last;
    const estado: Level = !last ? "sin_datos" : last.ok ? "operativo" : "caido";
    return { estado, disponibilidad_24h: h?.uptime == null ? null : Math.round(h.uptime * 1000) / 10, ultimo_chequeo: last?.checked_at.toISOString() ?? null, latencia_ms: last?.latency_ms ?? null, historial: (h?.rows ?? []).slice(0, 96).map((r) => ({ at: r.checked_at.toISOString(), ok: r.ok })) };
  };
  const [produccion, homologacion, [q]] = await Promise.all([arca("produccion"), arca("homologacion"), getDb().select({ n: count() }).from(invoices).where(eq(invoices.status, "en_cola"))]);
  const cola = q?.n ?? 0;
  const emision: Level = produccion.estado === "caido" ? "caido" : cola > 0 ? "con_demoras" : produccion.estado === "sin_datos" ? "sin_datos" : "operativo";
  return { faro: { app: "operativo" as Level, base }, emision, arca: { produccion, homologacion }, cola_de_emision: cola, actualizado: new Date().toISOString() };
}
