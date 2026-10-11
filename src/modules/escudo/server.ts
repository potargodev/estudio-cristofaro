import "server-only";
import { and, count, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { box_entries, derivation_rules, derivation_suggestions, employees, invoices, professional_tasks, studios, users } from "@/db/schema";
import { money } from "@/modules/bitacora/catalog";
import { audit } from "@/lib/audit";
import { ownOrganization } from "@/lib/faro/tenants";
import { CHANGA_CONTEXT, DERIVATION_RULES, matchProfessionalTask, PROFESSIONAL_TASKS, type DerivationRule, type ProfessionalTask, type RuleKey, type ValidationState } from "./catalog";

// Escudo de responsabilidad del lado del servidor: la lista de tareas de
// matriculados y las reglas de derivación vigentes (configuración del Faro
// Manager sobre los valores por defecto), y las sugerencias de sumar un
// contador de cada persona. Una sugerencia se puede descartar y vuelve a
// aparecer pasados los días de la regla si la condición sigue.

const db = () => getDb();
const DAY = 86400000;
type Actor = { id: string; email?: string | null };
export type Suggestion = typeof derivation_suggestions.$inferSelect;

export class EscudoError extends Error {}

/** Tareas vigentes (base sobre los valores por defecto) */
export async function getProfessionalTasks(): Promise<ProfessionalTask[]> {
  const rows = await db().select().from(professional_tasks);
  const out = PROFESSIONAL_TASKS.map((t) => {
    const r = rows.find((x) => x.key === t.key);
    return r ? { key: r.key, title: r.title, description: r.description, keywords: r.keywords, active: r.active, validation: r.validation as ValidationState, validatedBy: r.validated_by } : t;
  });
  for (const r of rows.filter((x) => !PROFESSIONAL_TASKS.some((t) => t.key === x.key)).sort((a, b) => a.position - b.position))
    out.push({ key: r.key, title: r.title, description: r.description, keywords: r.keywords, active: r.active, validation: r.validation as ValidationState, validatedBy: r.validated_by });
  return out;
}

/** Reglas vigentes (base sobre los valores por defecto) */
export async function getDerivationRules(): Promise<DerivationRule[]> {
  const rows = await db().select().from(derivation_rules);
  return DERIVATION_RULES.map((d) => {
    const r = rows.find((x) => x.key === d.key);
    if (!r) return d;
    return { ...d, title: r.title, message: r.message, need: r.need, threshold: r.threshold == null ? null : Number(r.threshold), snoozeDays: r.snooze_days, active: r.active, validation: r.validation as ValidationState, validatedBy: r.validated_by };
  });
}

export async function ruleOf(key: RuleKey) {
  return (await getDerivationRules()).find((r) => r.key === key)!;
}

/** ¿El texto toca una tarea de matriculado de la lista vigente? */
export async function professionalTaskIn(text: string) {
  return matchProfessionalTask(text, await getProfessionalTasks());
}

const cleanKeywords = (s: string) =>
  [...new Set(s.split(/[,\n]/).map((k) => k.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")).filter((k) => k.length >= 3))].slice(0, 40);

/** Faro Manager: alta o edición de una tarea de matriculado */
export async function saveProfessionalTask(actor: Actor, input: { key: string; title: string; description: string; keywords: string; active: boolean; validation: ValidationState; validatedBy: string | null }) {
  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40);
  if (key.length < 3) throw new EscudoError("La clave tiene que tener al menos 3 letras.");
  const title = input.title.trim().slice(0, 160);
  if (title.length < 3) throw new EscudoError("Completá el título.");
  const keywords = cleanKeywords(input.keywords);
  if (!keywords.length) throw new EscudoError("Cargá al menos una frase que la identifique (3 letras o más).");
  if (input.validation === "validada" && !input.validatedBy?.trim()) throw new EscudoError("Para marcarla validada, cargá el nombre y la matrícula del contador que la validó.");
  const values = { title, description: input.description.trim().slice(0, 600), keywords, active: input.active, validation: input.validation, validated_by: input.validation === "validada" ? input.validatedBy!.trim().slice(0, 160) : null, updated_by: actor.id };
  const position = PROFESSIONAL_TASKS.findIndex((t) => t.key === key);
  await db().insert(professional_tasks).values({ key, position: position < 0 ? 100 : position, ...values }).onConflictDoUpdate({ target: professional_tasks.key, set: values });
  await audit({ studioId: null, actor, action: "faro.escudo_tarea", entityType: "tarea_matriculado", entityId: key, metadata: { activa: input.active, validacion: input.validation, frases: keywords.length } });
  return key;
}

/** Faro Manager: edición de una regla de derivación */
export async function saveDerivationRule(actor: Actor, key: string, input: { title: string; message: string; need: string; threshold: number | null; snoozeDays: number; active: boolean; validation: ValidationState; validatedBy: string | null }) {
  const base = DERIVATION_RULES.find((r) => r.key === key);
  if (!base) throw new EscudoError("Esa regla no existe.");
  if (base.threshold != null && (input.threshold == null || !(input.threshold > 0))) throw new EscudoError("El umbral tiene que ser un número mayor que cero.");
  if (input.validation === "validada" && !input.validatedBy?.trim()) throw new EscudoError("Para marcarla validada, cargá el nombre y la matrícula del contador que la validó.");
  const values = {
    title: input.title.trim().slice(0, 160) || base.title,
    message: input.message.trim().slice(0, 600) || base.message,
    need: input.need.trim().slice(0, 200) || base.need,
    threshold: base.threshold == null ? null : String(input.threshold),
    snooze_days: Math.min(365, Math.max(1, Math.round(input.snoozeDays) || base.snoozeDays)),
    active: input.active,
    validation: input.validation,
    validated_by: input.validation === "validada" ? input.validatedBy!.trim().slice(0, 160) : null,
    updated_by: actor.id,
  };
  await db().insert(derivation_rules).values({ key, ...values }).onConflictDoUpdate({ target: derivation_rules.key, set: values });
  await audit({ studioId: null, actor, action: "faro.escudo_regla", entityType: "regla_derivacion", entityId: key, metadata: { umbral: values.threshold, activa: input.active, validacion: input.validation } });
}

/**
 * Se cumple una regla para una persona: crea la sugerencia o la actualiza.
 * Si estaba descartada, vuelve recién cuando pasan los días de la regla.
 */
export async function suggest(userId: string, key: RuleKey, why: string, data: Record<string, unknown> = {}) {
  const rule = await ruleOf(key);
  if (!rule.active) return null;
  const context = { need: rule.need, why: why.slice(0, 600), data };
  const [existing] = await db().select().from(derivation_suggestions).where(and(eq(derivation_suggestions.user_id, userId), eq(derivation_suggestions.rule_key, key)));
  if (!existing) {
    const [row] = await db().insert(derivation_suggestions).values({ user_id: userId, rule_key: key, context }).onConflictDoNothing().returning();
    if (row) await audit({ studioId: await tenantOf(userId), actor: { id: userId }, action: "escudo.sugerencia", entityType: "derivacion", entityId: row.id, metadata: { regla: key } });
    return row ?? null;
  }
  const back = existing.status !== "activa" && (!existing.snoozed_until || existing.snoozed_until <= new Date());
  const [row] = await db()
    .update(derivation_suggestions)
    .set({ context, ...(back ? { status: "activa", snoozed_until: null, triggered_at: new Date() } : {}) })
    .where(eq(derivation_suggestions.id, existing.id))
    .returning();
  return row;
}

async function tenantOf(userId: string) {
  const [u] = await db().select({ studioId: users.studioId }).from(users).where(eq(users.id, userId));
  return u?.studioId ?? null;
}

/** Sugerencias visibles de la persona (activas) */
export async function activeSuggestions(userId: string) {
  const [rows, rules] = await Promise.all([db().select().from(derivation_suggestions).where(and(eq(derivation_suggestions.user_id, userId), eq(derivation_suggestions.status, "activa"))), getDerivationRules()]);
  return rows
    .map((s) => ({ ...s, rule: rules.find((r) => r.key === s.rule_key) }))
    .filter((s): s is Suggestion & { rule: DerivationRule } => !!s.rule && s.rule.active)
    .sort((a, b) => b.triggered_at.getTime() - a.triggered_at.getTime());
}

/** Descartar: se esconde y vuelve pasados los días de la regla (solo la propia persona) */
export async function dismissSuggestion(userId: string, id: string) {
  const [s] = await db().select().from(derivation_suggestions).where(and(eq(derivation_suggestions.id, id), eq(derivation_suggestions.user_id, userId)));
  if (!s) return false;
  const rule = await ruleOf(s.rule_key as RuleKey);
  await db().update(derivation_suggestions).set({ status: "descartada", snoozed_until: new Date(Date.now() + (rule?.snoozeDays ?? 30) * DAY) }).where(eq(derivation_suggestions.id, s.id));
  return true;
}

/** Sugerencia propia (para armar el contexto en la Red); null si no es de la persona */
export async function ownSuggestion(userId: string, id: string | undefined | null) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [s] = await db().select().from(derivation_suggestions).where(and(eq(derivation_suggestions.id, id), eq(derivation_suggestions.user_id, userId)));
  return s ?? null;
}

/** La persona mandó el pedido a un estudio con el contexto armado */
export async function markSuggestionSent(userId: string, id: string) {
  const s = await ownSuggestion(userId, id);
  if (!s) return;
  await db().update(derivation_suggestions).set({ status: "enviada" }).where(eq(derivation_suggestions.id, s.id));
}

/** Texto del pedido a la Red con el contexto armado (qué necesita y por qué) */
export function contextMessage(s: Pick<Suggestion, "context">) {
  return `Qué necesito: ${s.context.need}.\nPor qué: ${s.context.why}\n\n(Llegué desde Faro con este contexto armado.)`;
}

/**
 * La foto real de la changa (§13): lo cobrado sin facturar en la caja de
 * negocio en los últimos 12 meses y si la cuenta tiene un régimen inscripto.
 */
export async function grayZone(user: { id: string; studioId: string; tenantKind: string }) {
  const { businessBoxOf } = await import("@/modules/cajas/server");
  const box = await businessBoxOf(user.id);
  if (!box) return null;
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const rows = await db()
    .select({ amount: box_entries.amount, date: box_entries.date })
    .from(box_entries)
    .where(and(eq(box_entries.box_id, box.id), eq(box_entries.kind, "ingreso"), eq(box_entries.invoiced, false), eq(box_entries.currency, "ARS"), isNull(box_entries.deleted_at), gte(box_entries.date, since)));
  const [t] = await db().select({ kind: studios.kind, regime: studios.tax_regime, cuit: studios.cuit }).from(studios).where(eq(studios.id, user.studioId));
  const withoutRegime = !t?.regime;
  return { boxId: box.id, total: rows.reduce((s, r) => s + r.amount, 0), months: new Set(rows.map((r) => r.date.slice(0, 7))).size, withoutRegime };
}

/**
 * Evalúa las reglas que se pueden calcular con los datos de la cuenta
 * (monotributo, empleados, facturación al exterior y actividades). Las que
 * dependen de un momento (simulación, preguntas al Vigía, changa) se
 * disparan donde ocurren.
 */
export async function evaluateDerivations(user: { id: string; role: string; studioId: string; tenantKind: string }) {
  if (user.role !== "titular" || user.tenantKind === "studio") return;
  const rules = await getDerivationRules();
  const on = (k: RuleKey) => rules.find((r) => r.key === k && r.active);
  const own = await ownOrganization(user.studioId);
  if (!own) return;
  const emp = on("primer_empleado");
  if (emp) {
    const [{ n }] = await db().select({ n: count() }).from(employees).where(and(eq(employees.studio_id, user.studioId), eq(employees.organization_id, own.id)));
    if (n >= (emp.threshold ?? 1)) await suggest(user.id, "primer_empleado", `Según lo que cargaste, tenés ${n} ${n === 1 ? "empleado" : "empleados"} en tu cuenta.`, { empleados: n });
  }
  const ext = on("facturacion_exterior");
  if (ext) {
    const [{ n }] = await db()
      .select({ n: count() })
      .from(invoices)
      .where(and(eq(invoices.studio_id, user.studioId), inArray(invoices.cbte_type, [19, 20, 21]), inArray(invoices.status, ["borrador", "autorizando", "autorizada"])));
    if (n >= (ext.threshold ?? 1)) await suggest(user.id, "facturacion_exterior", `Según lo que cargaste, tenés ${n} ${n === 1 ? "comprobante E" : "comprobantes E"} (exportación).`, { comprobantes_e: n });
  }
  // §13: la changa en zona gris. Sin monotributo, lo cobrado sin facturar en la caja de negocio ya es una actividad
  const changa = on("changa_actividad");
  if (changa) {
    const g = await grayZone(user);
    if (g && g.withoutRegime && g.total >= (changa.threshold ?? 1_500_000) * 100)
      await suggest(user.id, "changa_actividad", `Según lo que registraste, en los últimos 12 meses cobraste ${money(g.total)} sin facturar en tu caja de negocio, en ${g.months} ${g.months === 1 ? "mes" : "meses"}. Eso ya es una actividad.`, { sin_facturar: g.total / 100, meses: g.months, contexto: CHANGA_CONTEXT });
  }
  if (user.tenantKind !== "personal") return;
  const { personalIssuer, semaforoFor, latestSituation } = await import("@/modules/arca/server");
  const scope = await personalIssuer(user as never).catch(() => null);
  if (!scope) return;
  const mono = on("monotributo_tope");
  if (mono) {
    const s = await semaforoFor(scope).catch(() => null);
    if (s && (s.excluded || (s.used != null && s.used >= (mono.threshold ?? 0.8))))
      await suggest(user.id, "monotributo_tope", s.message, { usado: s.used == null ? null : Math.round(s.used * 100), categoria: s.category, facturado_12_meses: s.income12m, exclusion: s.excluded });
  }
  const act = on("varias_actividades");
  if (act) {
    const last = await latestSituation(scope);
    const n = ((last?.data as { activities?: unknown[] } | null)?.activities ?? []).length;
    if (last && last.validation !== "error" && n > (act.threshold ?? 1)) await suggest(user.id, "varias_actividades", `Según tu constancia de ARCA, tenés ${n} actividades inscriptas.`, { actividades: n });
  }
}
