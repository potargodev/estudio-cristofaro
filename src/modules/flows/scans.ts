import "server-only";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { flows, obligations, organizations, payslips, tax_profiles } from "@/db/schema";
import { semaforoFor } from "@/modules/arca/server";
import { emitEvent } from "./events";

// Eventos que no salen de una acción sino del paso del tiempo (una vez por
// día): vencimientos en 3 días, monotributo cerca del tope y recibos sin
// firmar hace 7 días. Solo para estudios con flujos activos de ese evento.

async function studiosWith(event: string) {
  const rows = await getDb().selectDistinct({ s: flows.studio_id }).from(flows).where(and(eq(flows.trigger_event, event), eq(flows.status, "activo")));
  return rows.map((r) => r.s);
}

export async function runFlowScans(now = new Date()) {
  let n = 0;
  const today = new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const in3 = new Date(now.getTime() - 3 * 3600_000 + 3 * 86400000).toISOString().slice(0, 10);
  const db = getDb();
  const s1 = await studiosWith("vencimiento.proximo");
  if (s1.length) {
    const rows = await db.select().from(obligations).where(and(inArray(obligations.studio_id, s1), eq(obligations.status, "pendiente"), gte(obligations.due_date, today), lte(obligations.due_date, in3), isNotNull(obligations.organization_id)));
    for (const o of rows) {
      await emitEvent(o.studio_id, "vencimiento.proximo", { vencimiento_id: o.id, organizacion_id: o.organization_id, titulo: `${o.tax} ${o.period}`, fecha: o.due_date, importe: o.amount ? Number(o.amount) : null }, `ob:${o.id}`);
      n++;
    }
  }
  const s2 = await studiosWith("monotributo.cerca_del_tope");
  if (s2.length) {
    const profiles = await db.select({ p: tax_profiles, org: organizations.name }).from(tax_profiles).innerJoin(organizations, eq(organizations.id, tax_profiles.organization_id)).where(and(inArray(tax_profiles.studio_id, s2), eq(tax_profiles.regime, "monotributo")));
    for (const { p, org } of profiles) {
      try {
        const s = await semaforoFor({ studioId: p.studio_id, organizationId: p.organization_id, organizationName: org, cuit: p.cuit, kind: "studio", canEmit: false, base: "", home: "" });
        const used = s.used ?? 0;
        if (used >= 0.8) {
          await emitEvent(p.studio_id, "monotributo.cerca_del_tope", { organizacion_id: p.organization_id, porcentaje: Math.round(used * 100), categoria: p.category }, `mt:${p.organization_id}:${today.slice(0, 7)}`);
          n++;
        }
      } catch (e) {
        console.error("[flujos] semáforo", p.organization_id, (e as Error).message);
      }
    }
  }
  const s3 = await studiosWith("recibo.sin_firmar");
  if (s3.length) {
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const rows = await db.select({ batch: payslips.batch_id, org: payslips.organization_id, studio: payslips.studio_id, period: payslips.period }).from(payslips).where(and(inArray(payslips.studio_id, s3), eq(payslips.status, "publicado"), lte(payslips.published_at, weekAgo)));
    const byBatch = new Map<string, { org: string; studio: string; period: string; n: number }>();
    for (const r of rows) {
      const cur = byBatch.get(r.batch) ?? { org: r.org, studio: r.studio, period: r.period, n: 0 };
      cur.n++;
      byBatch.set(r.batch, cur);
    }
    for (const [batch, v] of byBatch) {
      await emitEvent(v.studio, "recibo.sin_firmar", { lote_id: batch, organizacion_id: v.org, periodo: v.period, pendientes: v.n }, `rs:${batch}`);
      n++;
    }
  }
  return n;
}
