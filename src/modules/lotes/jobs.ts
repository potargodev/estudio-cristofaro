import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, notifications, studios } from "@/db/schema";
import { todayAR } from "@/lib/format";

// Tarea interna «facturacion» (§2.p): estado de ARCA cada 5 minutos, la cola
// de ARCA caído, los lotes en curso, los recurrentes del día y el resumen
// diario de lo que se facturó solo (interruptor «Facturar automáticamente»).

const AUTO = ["recurrente", "tienda", "api", "whatsapp"];

/** Una vez por día y por estudio: qué se emitió solo, por fuente (campanita al dueño) */
async function dailySummaries(now = new Date()) {
  const db = getDb();
  const since = new Date(now.getTime() - 24 * 3600_000);
  const rows = await db
    .select({ studio: invoices.studio_id, origin: invoices.origin, n: sql<number>`count(*)::int`, total: sql<string>`sum(${invoices.total} * ${invoices.exchange_rate})` })
    .from(invoices)
    .where(and(eq(invoices.status, "autorizada"), inArray(invoices.origin, AUTO), gte(invoices.authorized_at, since)))
    .groupBy(invoices.studio_id, invoices.origin);
  const byStudio = new Map<string, typeof rows>();
  for (const r of rows) byStudio.set(r.studio, [...(byStudio.get(r.studio) ?? []), r]);
  const { notify } = await import("@/modules/notifications/server");
  let sent = 0;
  for (const [studio, list] of byStudio) {
    const day = todayAR();
    const h = createHash("md5").update(`resumen:${studio}:${day}`).digest("hex");
    const ref = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
    const [owner] = await db.select({ id: studios.owner_user_id }).from(studios).where(eq(studios.id, studio));
    if (!owner?.id) continue;
    const [already] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.user_id, owner.id), eq(notifications.ref_id, ref)));
    if (already) continue;
    const label: Record<string, string> = { recurrente: "recurrentes", tienda: "de tiendas", api: "por la API", whatsapp: "por WhatsApp" };
    const body = list.map((r) => `${r.n} ${label[r.origin] ?? r.origin} ($ ${Math.round(Number(r.total)).toLocaleString("es-AR")})`).join(" · ");
    await notify([owner.id], { kind: "fiscal", title: "Resumen del día: lo que se facturó solo", body: `${body}. Lo podés pausar en Vigía → Automatizaciones.`, href: "/admin/facturacion", refId: ref });
    sent++;
  }
  return sent;
}

export async function runBillingJobs() {
  const { periodicCheck, processQueue } = await import("@/modules/arca/queue");
  const { processBatches, recoverStuckRows } = await import("./server");
  await periodicCheck();
  const cola = await processQueue();
  await recoverStuckRows();
  const lotes = await processBatches(200);
  const recurrentes = await import("@/modules/facturacion-plus/server").then((m) => m.runRecurring()).catch(() => 0);
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }));
  const resumenes = hour === 20 ? await dailySummaries() : 0;
  return { cola, lotes, recurrentes, resumenes };
}
