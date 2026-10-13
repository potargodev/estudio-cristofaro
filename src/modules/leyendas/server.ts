import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { invoice_settings, invoices, legend_rules, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { notify } from "@/modules/notifications/server";
import { CBTE_TYPES } from "@/modules/arca/config";
import { affects, asProfile, CONDITIONS, LEGEND_RULES, legendsFor, type LegendProfile, type LegendRule, type LegendStatus } from "./catalog";

// Leyendas obligatorias del lado del servidor (§2.q etapa 5): el catálogo
// vigente (Faro Manager sobre los valores por defecto), las leyendas de un
// comprobante y el perfil de cada emisor. Cuando el Faro Manager cambia una
// norma, avisa a los dueños de los tenants a los que les puede tocar.

const db = () => getDb();
type Actor = { id: string; email?: string | null };
type Invoice = typeof invoices.$inferSelect;
type Scope = { studioId: string; organizationId: string; cuit: string };

export class LegendError extends Error {}

const fromRow = (r: typeof legend_rules.$inferSelect): LegendRule => ({
  key: r.key,
  jurisdiction: r.jurisdiction,
  title: r.title,
  template: r.template,
  condition: r.condition,
  source: r.source,
  sourceUrl: r.source_url,
  status: r.status as LegendStatus,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  active: r.active,
  version: r.version,
  note: r.note,
});

/** Catálogo vigente: el base con lo que editó el Faro Manager, más las reglas nuevas */
export async function getLegendRules(): Promise<(LegendRule & { history: Record<string, unknown>[] })[]> {
  const rows = await db().select().from(legend_rules);
  const out = LEGEND_RULES.map((b) => {
    const r = rows.find((x) => x.key === b.key);
    return r ? { ...fromRow(r), history: r.history } : { ...b, history: [] };
  });
  for (const r of rows.filter((x) => !LEGEND_RULES.some((b) => b.key === x.key)).sort((a, b) => a.created_at.getTime() - b.created_at.getTime())) out.push({ ...fromRow(r), history: r.history });
  return out;
}

/** Datos del comprobante que usa el motor */
function invoiceFacts(inv: Pick<Invoice, "cbte_type" | "customer_iva_condition" | "issue_date" | "net" | "iva" | "total">, issuerIva: string) {
  const t = CBTE_TYPES[inv.cbte_type];
  return { letter: t?.letter ?? "C", fce: !!t?.fce, kind: t?.kind ?? "factura", issuerIva, customerIva: inv.customer_iva_condition, issueDate: inv.issue_date, net: Number(inv.net), iva: Number(inv.iva), total: Number(inv.total) } as const;
}

/** Las leyendas que lleva un comprobante con el perfil del emisor */
export async function legendsForInvoice(inv: Pick<Invoice, "cbte_type" | "customer_iva_condition" | "issue_date" | "net" | "iva" | "total">, settings: { iva_condition: string; legend_profile: unknown } | null) {
  return legendsFor(invoiceFacts(inv, settings?.iva_condition ?? "monotributo"), asProfile(settings?.legend_profile), await getLegendRules());
}

export async function legendProfileOf(scope: Scope): Promise<LegendProfile> {
  const [s] = await db()
    .select({ p: invoice_settings.legend_profile })
    .from(invoice_settings)
    .where(and(eq(invoice_settings.organization_id, scope.organizationId), eq(invoice_settings.studio_id, scope.studioId), eq(invoice_settings.cuit, scope.cuit)));
  return asProfile(s?.p);
}

/** Perfil de leyendas del emisor (se carga una vez; los datos del emisor tienen que existir) */
export async function saveLegendProfile(scope: Scope, input: Partial<LegendProfile>, actor: Actor) {
  const profile = asProfile(input);
  if ((profile.isibCaba === "local" || profile.isibCaba === "convenio") && !profile.isibExento && profile.isibAlicuota == null)
    throw new LegendError("Cargá la alícuota de Ingresos Brutos de CABA (si tenés varias, la menor).");
  const [r] = await db()
    .update(invoice_settings)
    .set({ legend_profile: profile as unknown as Record<string, unknown> })
    .where(and(eq(invoice_settings.organization_id, scope.organizationId), eq(invoice_settings.studio_id, scope.studioId), eq(invoice_settings.cuit, scope.cuit)))
    .returning({ id: invoice_settings.id });
  if (!r) throw new LegendError("Primero guardá los datos del emisor.");
  await audit({ studioId: scope.studioId, organizationId: scope.organizationId, actor, action: "facturacion.leyendas", entityType: "emisor", entityId: scope.organizationId, metadata: { isib_caba: profile.isibCaba, alicuota: profile.isibAlicuota, retencion: profile.sujetaRetencion } });
  return profile;
}

const isDate = (s: string | null | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

interface LegendRuleInput {
  key: string;
  jurisdiction: string;
  title: string;
  template: string;
  condition: string;
  source: string;
  sourceUrl: string | null;
  status: LegendStatus;
  validFrom: string;
  validTo: string | null;
  active: boolean;
  note: string | null;
  /** Qué cambió (va en la historia y en el aviso) */
  change: string | null;
  notifyAffected: boolean;
}

/** Faro Manager: alta o edición de una regla, con versión, historia, auditoría y aviso a los afectados */
export async function saveLegendRule(actor: Actor, i: LegendRuleInput) {
  const key = i.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
  if (key.length < 3) throw new LegendError("La clave tiene que tener al menos 3 letras.");
  if (!CONDITIONS[i.condition]) throw new LegendError("Elegí cuándo se aplica.");
  const title = i.title.trim().slice(0, 160);
  const template = i.template.replace(/\r/g, "").trim().slice(0, 600);
  if (title.length < 3 || template.length < 3) throw new LegendError("Completá el título y el texto de la leyenda.");
  if (!["vigente", "a_validar", "derogada"].includes(i.status)) throw new LegendError("Estado inválido.");
  if (!isDate(i.validFrom) || (i.validTo && !isDate(i.validTo)) || (i.validTo && i.validTo < i.validFrom)) throw new LegendError("Revisá las fechas de vigencia.");
  if (i.status === "vigente" && !i.source.trim()) throw new LegendError("Para marcarla vigente, citá la norma.");
  if (i.sourceUrl && !/^https:\/\/[^\s]+$/.test(i.sourceUrl)) throw new LegendError("El enlace a la norma tiene que empezar con https://");
  const prev = (await getLegendRules()).find((r) => r.key === key);
  const changed = !prev || prev.template !== template || prev.status !== i.status || prev.validFrom !== i.validFrom || (prev.validTo ?? null) !== (i.validTo || null) || prev.active !== i.active || prev.condition !== i.condition;
  const version = prev ? prev.version + (changed ? 1 : 0) : 1;
  const history = prev && changed ? [...prev.history, { version: prev.version, template: prev.template, status: prev.status, valid_from: prev.validFrom, valid_to: prev.validTo, changed_at: new Date().toISOString(), change: i.change?.slice(0, 300) || null }].slice(-20) : (prev?.history ?? []);
  const values = {
    jurisdiction: i.jurisdiction.trim().slice(0, 60) || "Nacional",
    title,
    template,
    condition: i.condition,
    source: i.source.trim().slice(0, 600),
    source_url: i.sourceUrl?.trim() || null,
    status: i.status,
    valid_from: i.validFrom,
    valid_to: i.validTo || null,
    active: i.active,
    version,
    note: i.note?.trim().slice(0, 300) || null,
    history,
    updated_by: actor.id,
  };
  await db().insert(legend_rules).values({ key, ...values }).onConflictDoUpdate({ target: legend_rules.key, set: values });
  await audit({ studioId: null, actor, action: "faro.leyenda", entityType: "leyenda", entityId: key, metadata: { version, estado: i.status, desde: i.validFrom, cambio: i.change ?? null, aviso: i.notifyAffected && changed } });
  const notified = i.notifyAffected && changed ? await notifyAffected({ key, condition: i.condition, title, change: i.change }) : 0;
  return { key, version, notified };
}

/**
 * Avisa a los dueños de los tenants que tienen un emisor al que le puede
 * tocar la regla (según su perfil de leyendas y su condición frente al IVA).
 * Un aviso por persona, aunque tenga varios emisores alcanzados.
 */
async function notifyAffected(r: { key: string; condition: string; title: string; change: string | null }) {
  const issuers = await db().select({ studioId: invoice_settings.studio_id, iva: invoice_settings.iva_condition, p: invoice_settings.legend_profile }).from(invoice_settings);
  const studioIds = [...new Set(issuers.filter((s) => affects(r, asProfile(s.p), s.iva)).map((s) => s.studioId))];
  if (!studioIds.length) return 0;
  const owners = await db()
    .select({ id: users.id, kind: studios.kind })
    .from(users)
    .innerJoin(studios, eq(studios.id, users.studioId))
    .where(and(inArray(users.studioId, studioIds), inArray(users.role, ["dueno", "titular"]), eq(users.active, true)));
  await notify(
    owners.map((o) => o.id),
    { kind: "fiscal", title: `Cambió una leyenda obligatoria: ${r.title}`, body: `${r.change?.trim() || "Faro actualizó el texto o la vigencia."} Faro la imprime sola en tus comprobantes; revisá tu perfil de leyendas.`, href: "/ayuda/facturacion/leyendas-obligatorias", refId: null },
  );
  return owners.length;
}
