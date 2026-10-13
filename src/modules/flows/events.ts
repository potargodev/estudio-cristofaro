import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { flow_events, flows } from "@/db/schema";

/**
 * Los módulos avisan que pasó algo (factura emitida, documento leído, recibo
 * firmado…). Solo se encola si el estudio tiene algún flujo activo para ese
 * evento; la clave evita duplicados. Nunca rompe la acción que lo emite.
 * §2.p B9: también se encola para los webhooks salientes que lo suscriben.
 */
export async function emitEvent(studioId: string, name: string, payload: Record<string, unknown>, dedupeKey: string) {
  await import("@/modules/api/webhooks")
    .then((m) => m.enqueueWebhooks(studioId, name, payload, dedupeKey))
    .catch((e) => console.error("[webhooks] no se pudo encolar", name, (e as Error).message));
  try {
    const [f] = await getDb().select({ id: flows.id }).from(flows).where(and(eq(flows.studio_id, studioId), eq(flows.trigger_event, name), eq(flows.status, "activo"))).limit(1);
    if (!f) return;
    await getDb()
      .insert(flow_events)
      .values({ studio_id: studioId, name, organization_id: typeof payload.organizacion_id === "string" ? payload.organizacion_id : null, payload, dedupe_key: `${name}:${dedupeKey}` })
      .onConflictDoNothing();
  } catch (e) {
    console.error("[flujos] no se pudo emitir el evento", name, (e as Error).message);
  }
}
