import "server-only";
import { lastDayOfMonth } from "@/lib/format";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices, legal_entities, organizations } from "@/db/schema";
import { CBTE_TYPES } from "@/modules/arca/config";
import type { ScaleCategory } from "@/modules/arca/monotributo";

// Panel de facturación del estudio (§2.p, B1): todas las CUIT de la cartera
// en una pantalla, con lo emitido en el mes, borradores, rechazos, cola de
// ARCA, el semáforo del monotributo y el acceso directo a emitir.

const db = () => getDb();

interface PanelRow {
  entityId: string;
  organizationId: string;
  organizationName: string;
  businessName: string;
  cuit: string;
  regime: string;
  category: string | null;
  month: { count: number; total: number };
  drafts: number;
  problems: number;
  queued: number;
  income12m: number;
  /** verde | amarillo | rojo | excluido (solo monotributo con categoría) */
  light: string | null;
  used: number | null;
}

export async function billingPanel(studioId: string, month: string) {
  const ents = await db()
    .select({ e: legal_entities, orgName: organizations.name })
    .from(legal_entities)
    .innerJoin(organizations, and(eq(organizations.id, legal_entities.organization_id), eq(organizations.studio_id, studioId)))
    .where(and(eq(legal_entities.studio_id, studioId), eq(legal_entities.active, true), sql`${legal_entities.cuit} is not null`))
    .orderBy(organizations.name);
  if (!ents.length) return [];
  const orgIds = [...new Set(ents.map((x) => x.e.organization_id))];
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const from12 = new Date(Date.UTC(y, m - 12, 1)).toISOString().slice(0, 10);
  const monthRows = await db()
    .select({ cuit: invoices.cuit, type: invoices.cbte_type, n: sql<number>`count(*)::int`, total: sql<string>`sum(${invoices.total} * ${invoices.exchange_rate})` })
    .from(invoices)
    .where(and(eq(invoices.studio_id, studioId), inArray(invoices.organization_id, orgIds), eq(invoices.status, "autorizada"), gte(invoices.issue_date, from), lte(invoices.issue_date, to)))
    .groupBy(invoices.cuit, invoices.cbte_type);
  const yearRows = await db()
    .select({ cuit: invoices.cuit, type: invoices.cbte_type, total: sql<string>`sum(${invoices.total} * ${invoices.exchange_rate})` })
    .from(invoices)
    .where(and(eq(invoices.studio_id, studioId), inArray(invoices.organization_id, orgIds), eq(invoices.status, "autorizada"), gte(invoices.issue_date, from12), lte(invoices.issue_date, to)))
    .groupBy(invoices.cuit, invoices.cbte_type);
  const states = await db()
    .select({ cuit: invoices.cuit, status: invoices.status, n: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.studio_id, studioId), inArray(invoices.organization_id, orgIds), inArray(invoices.status, ["borrador", "rechazada", "error", "en_cola"])))
    .groupBy(invoices.cuit, invoices.status);
  const { currentScale } = await import("@/modules/arca/server");
  const scale = ((await currentScale()).categories as ScaleCategory[]).slice().sort((a, b) => a.maxIncome - b.maxIncome);
  const sign = (t: number) => (CBTE_TYPES[t]?.kind === "nota_credito" ? -1 : 1);
  return ents.map(({ e, orgName }): PanelRow => {
    const cuit = (e.cuit ?? "").replace(/\D/g, "");
    const mine = monthRows.filter((r) => r.cuit === cuit);
    const income12m = yearRows.filter((r) => r.cuit === cuit).reduce((t, r) => t + sign(r.type) * Number(r.total), 0);
    const st = (s: string) => states.find((x) => x.cuit === cuit && x.status === s)?.n ?? 0;
    let light: string | null = null;
    let used: number | null = null;
    if (e.regime === "monotributo") {
      const cat = scale.find((c) => c.letter === (e.category ?? "").toUpperCase());
      const top = scale[scale.length - 1];
      if (top && income12m > top.maxIncome) light = "excluido";
      else if (cat) {
        used = income12m / cat.maxIncome;
        light = used >= 0.9 ? "rojo" : used >= 0.7 ? "amarillo" : "verde";
      }
    }
    return {
      entityId: e.id,
      organizationId: e.organization_id,
      organizationName: orgName,
      businessName: e.business_name,
      cuit,
      regime: e.regime,
      category: e.category,
      month: { count: mine.filter((r) => sign(r.type) > 0).reduce((t, r) => t + r.n, 0), total: Math.round(mine.reduce((t, r) => t + sign(r.type) * Number(r.total), 0) * 100) / 100 },
      drafts: st("borrador"),
      problems: st("rechazada") + st("error"),
      queued: st("en_cola"),
      income12m: Math.round(income12m * 100) / 100,
      light,
      used,
    };
  });
}
