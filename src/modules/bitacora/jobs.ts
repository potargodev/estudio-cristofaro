import "server-only";
import { and, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_entries } from "@/db/schema";
import { notify } from "@/modules/notifications/server";
import { snapshotMep } from "./planning";
import { refreshInsights } from "./recurring";
import { sendWeeklySummaries } from "./weekly";

// Tareas de Bitácora (cada hora, instrumentation.ts; BITACORA_JOBS=off las
// apaga): guarda el dólar MEP del día, recalcula fijos, fugas y avisos de
// quienes cargaron algo en los últimos 60 días (una vez por día) y el domingo
// manda el resumen semanal.

const g = globalThis as unknown as { __bitacoraDay?: string; __bitacoraWeek?: string };

export async function runBitacoraJobs(now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 3600_000);
  const day = ar.toISOString().slice(0, 10);
  let avisos = 0;
  let resumenes = 0;
  const since = new Date(now.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  const active = (await getDb().selectDistinct({ id: bitacora_entries.user_id }).from(bitacora_entries).where(and(isNull(bitacora_entries.deleted_at), gte(bitacora_entries.date, since)))).map((r) => r.id);
  if (g.__bitacoraDay !== day) {
    g.__bitacoraDay = day;
    await snapshotMep().catch(() => false);
    for (const id of active) {
      const created = await refreshInsights(id).catch(() => []);
      for (const c of created) await notify([id], { kind: "aviso", title: c.title, body: c.body, href: "/bitacora", refId: c.id });
      avisos += created.length;
    }
  }
  // Domingo desde las 10 (hora de Argentina): resumen de la semana
  if (ar.getUTCDay() === 0 && ar.getUTCHours() >= 10 && g.__bitacoraWeek !== day) {
    g.__bitacoraWeek = day;
    resumenes = await sendWeeklySummaries(active);
  }
  // Cajas: el sueldo del dueño que vence hoy pasa del negocio a lo personal
  const { runSalaryJobs } = await import("@/modules/cajas/server");
  const sueldos = await runSalaryJobs(day).catch((e) => (console.error("[cajas] sueldos", (e as Error).message), 0));
  // Conexiones: resumen semanal opcional de «Lo que hizo tu contador»
  const conexiones = await import("@/modules/conexiones/server");
  const contador = await conexiones.sendWeeklySummaries(now).catch((e) => (console.error("[conexiones] resumen", (e as Error).message), 0));
  return { avisos, resumenes, sueldos, contador, activos: active.length };
}
