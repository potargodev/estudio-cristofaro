import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, max, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounting_settings,
  bank_movements,
  connections,
  external_records,
  fiscal_years,
  fixed_assets,
  invoices,
  journal_entries,
  journal_templates,
  ledger_accounts,
  organization_industries,
  organizations,
  payroll_runs,
  smart_documents,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { todayAR } from "@/lib/format";
import { CBTE_TYPES } from "@/modules/arca/config";
import { asExtraction } from "@/modules/smart-docs/core";
import { aging, closingEntries, depreciation, depreciationBetween, fiscalYearOf, fxDifference, ledger, statements, trialBalance, validateLines, EntryError, type Account, type Entry, type Line, type OpenItem } from "./core";
import { compareCodes, planFor, templateForIndustry, type AccountKind } from "./plan";

// Contabilidad general nativa (A1, principios §22): plan de cuentas por
// organización, asientos (manuales, modelos y automáticos con su origen),
// libros, estados contables, bienes de uso, cuentas corrientes, moneda
// extranjera y cierre de ejercicio con bloqueo de períodos. Todo recibe el
// alcance ya validado y lo sensible queda en la auditoría.

export interface Scope {
  studioId: string;
  organizationId: string;
}
type Actor = { id: string; email: string; name?: string };
export class AccountingError extends Error {}

const db = () => getDb();
const where = (s: Scope) => and(eq(ledger_accounts.studio_id, s.studioId), eq(ledger_accounts.organization_id, s.organizationId));
const entryWhere = (s: Scope) => and(eq(journal_entries.studio_id, s.studioId), eq(journal_entries.organization_id, s.organizationId));

/** UUID determinístico a partir de un texto (origen de asientos que no tienen una fila propia: amortización de un período, diferencia de cambio de una cuenta) */
function uuidFrom(text: string) {
  const h = createHash("md5").update(text).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ───────────── Configuración y plan ─────────────

export async function settingsOf(s: Scope) {
  const [row] = await db().select().from(accounting_settings).where(and(eq(accounting_settings.organization_id, s.organizationId), eq(accounting_settings.studio_id, s.studioId)));
  return row ?? { organization_id: s.organizationId, studio_id: s.studioId, template: "general", year_end: "12-31", locked_until: null, updated_by: null, updated_at: new Date() };
}

/** El plan de la organización; la primera vez se crea con la plantilla de su rubro */
export async function accountsOf(s: Scope): Promise<(Account & { id: string; external_codes: Record<string, string>; active: boolean })[]> {
  const rows = await db().select().from(ledger_accounts).where(where(s));
  if (rows.length) return rows.map((r) => ({ ...r, kind: r.kind as AccountKind })).sort((a, b) => compareCodes(a.code, b.code));
  // Defensa en profundidad: nunca se crea un plan para una organización de otro estudio
  const [own] = await db().select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, s.organizationId), eq(organizations.studio_id, s.studioId)));
  if (!own) throw new AccountingError("Esa organización no es de este estudio.");
  await createPlan(s, null);
  return accountsOf(s);
}

async function createPlan(s: Scope, template: string | null) {
  let t = template;
  if (!t) {
    const [ind] = await db().select({ key: organization_industries.industry_key }).from(organization_industries).where(eq(organization_industries.organization_id, s.organizationId)).limit(1);
    t = templateForIndustry(ind?.key);
  }
  await db()
    .insert(ledger_accounts)
    .values(planFor(t).map((a) => ({ ...a, studio_id: s.studioId, organization_id: s.organizationId })))
    .onConflictDoNothing();
  await db()
    .insert(accounting_settings)
    .values({ organization_id: s.organizationId, studio_id: s.studioId, template: t })
    .onConflictDoNothing();
}

/** Cambia la plantilla: suma las cuentas que falten de la nueva (no borra ni pisa las que ya existen) */
export async function applyTemplate(s: Scope, actor: Actor, template: string) {
  if (!planFor(template).length) throw new AccountingError("Esa plantilla no existe.");
  await accountsOf(s);
  await createPlan(s, template);
  await db().update(accounting_settings).set({ template, updated_by: actor.id, updated_at: new Date() }).where(eq(accounting_settings.organization_id, s.organizationId));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.plantilla", entityType: "organizacion", entityId: s.organizationId, metadata: { plantilla: template } });
}

interface AccountInput {
  code: string;
  name: string;
  kind: AccountKind;
  imputable: boolean;
  monetary: boolean;
  currency: string;
}

export async function saveAccount(s: Scope, actor: Actor, i: AccountInput, id?: string | null) {
  const code = i.code.trim();
  if (!/^\d+(\.\d+)*$/.test(code)) throw new AccountingError("El código va con números separados por puntos (por ejemplo 1.1.01.04).");
  if (!i.name.trim()) throw new AccountingError("Poné el nombre de la cuenta.");
  if (!["activo", "pasivo", "patrimonio", "ingreso", "egreso"].includes(i.kind)) throw new AccountingError("Tipo de cuenta inválido.");
  const values = { code, name: i.name.trim().slice(0, 120), kind: i.kind, imputable: i.imputable, monetary: i.monetary, currency: i.currency === "USD" ? "USD" : "ARS" };
  const [dup] = await db()
    .select({ id: ledger_accounts.id })
    .from(ledger_accounts)
    .where(and(where(s), eq(ledger_accounts.code, code)));
  if (dup && dup.id !== id) throw new AccountingError(`Ya hay una cuenta con el código ${code}.`);
  if (id) {
    const [row] = await db()
      .update(ledger_accounts)
      .set({ ...values, updated_at: new Date() })
      .where(and(where(s), eq(ledger_accounts.id, id)))
      .returning({ id: ledger_accounts.id });
    if (!row) throw new AccountingError("Esa cuenta no es de esta organización.");
  } else await db().insert(ledger_accounts).values({ ...values, studio_id: s.studioId, organization_id: s.organizationId });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: id ? "contabilidad.cuenta_editar" : "contabilidad.cuenta_crear", entityType: "cuenta", entityId: code, metadata: values });
}

/** Mapeo de una cuenta a su código en un sistema conectado (para espejar y publicar) */
export async function mapAccount(s: Scope, actor: Actor, accountId: string, system: string, external: string) {
  const [acc] = await db().select().from(ledger_accounts).where(and(where(s), eq(ledger_accounts.id, accountId)));
  if (!acc) throw new AccountingError("Esa cuenta no es de esta organización.");
  const codes = { ...acc.external_codes };
  if (external.trim()) codes[system] = external.trim().slice(0, 60);
  else delete codes[system];
  await db().update(ledger_accounts).set({ external_codes: codes, updated_at: new Date() }).where(eq(ledger_accounts.id, acc.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.cuenta_mapeo", entityType: "cuenta", entityId: acc.code, metadata: { sistema: system, codigo: external } });
}

// ───────────── Bloqueo de períodos ─────────────

async function assertOpen(s: Scope, date: string) {
  const st = await settingsOf(s);
  if (st.locked_until && date <= st.locked_until) throw new AccountingError(`El período hasta el ${st.locked_until.split("-").reverse().join("/")} está cerrado: reabrilo para cambiar asientos de esa fecha.`);
}

export async function setLock(s: Scope, actor: Actor, until: string | null) {
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new AccountingError("Fecha inválida.");
  await accountsOf(s);
  const before = (await settingsOf(s)).locked_until;
  await db().update(accounting_settings).set({ locked_until: until, updated_by: actor.id, updated_at: new Date() }).where(eq(accounting_settings.organization_id, s.organizationId));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: until && (!before || until > before) ? "contabilidad.bloquear" : "contabilidad.reabrir_periodo", entityType: "organizacion", entityId: s.organizationId, metadata: { antes: before, ahora: until } });
}

// ───────────── Asientos ─────────────

/** Completa el código o el nombre de cada línea contra el plan; una cuenta que no existe o no es imputable no pasa */
async function resolveLines(s: Scope, lines: Line[]) {
  const accounts = await accountsOf(s);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  return lines.map((l) => {
    const a = (l.code ? byCode.get(l.code) : undefined) ?? byName.get(l.account.trim().toLowerCase());
    if (!a) throw new AccountingError(`La cuenta «${l.code ?? l.account}» no está en el plan.`);
    if (!a.imputable) throw new AccountingError(`«${a.name}» es una cuenta de título: no recibe imputaciones.`);
    return { ...l, code: a.code, account: a.name };
  });
}

interface EntryInput {
  date: string;
  concept: string;
  lines: Line[];
  source?: string;
  sourceId?: string | null;
  register?: boolean;
}

export async function createEntry(s: Scope, actor: Actor | null, i: EntryInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) throw new AccountingError("Fecha inválida.");
  if (!i.concept.trim()) throw new AccountingError("Poné el concepto del asiento.");
  await assertOpen(s, i.date);
  const lines = await resolveLines(s, i.lines.filter((l) => l.debit || l.credit));
  try {
    validateLines(lines);
  } catch (e) {
    if (e instanceof EntryError) throw new AccountingError(e.message);
    throw e;
  }
  const [row] = await db()
    .insert(journal_entries)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, date: i.date, concept: i.concept.trim().slice(0, 300), lines, status: "borrador", source: i.source ?? "manual", source_id: i.sourceId ?? null, created_by: actor?.id ?? null })
    .onConflictDoNothing()
    .returning();
  if (!row) return null; // ya había un asiento con ese origen (idempotente)
  if (i.register) await registerEntry(s, actor, row.id);
  if (actor && (i.source ?? "manual") === "manual") await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.asiento_crear", entityType: "asiento", entityId: row.id, metadata: { fecha: i.date, concepto: i.concept } });
  return row;
}

/** Registra un borrador: le da el número correlativo de la organización */
export async function registerEntry(s: Scope, actor: Actor | null, id: string) {
  const [e] = await db().select().from(journal_entries).where(and(entryWhere(s), eq(journal_entries.id, id)));
  if (!e) throw new AccountingError("Ese asiento no es de esta organización.");
  if (e.status !== "borrador") return e;
  await assertOpen(s, e.date);
  // Número correlativo: un solo registro a la vez por organización
  return db().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`asientos:${s.organizationId}`}))`);
    const [{ n }] = await tx.select({ n: max(journal_entries.number) }).from(journal_entries).where(entryWhere(s));
    const [row] = await tx
      .update(journal_entries)
      .set({ status: "registrado", number: (n ?? 0) + 1, registered_by: actor?.id ?? null, registered_at: new Date() })
      .where(eq(journal_entries.id, e.id))
      .returning();
    return row;
  });
}

/** Registra todos los borradores de un período (los automáticos se revisan y se registran juntos) */
export async function registerDrafts(s: Scope, actor: Actor, from: string, to: string) {
  const drafts = await db()
    .select({ id: journal_entries.id })
    .from(journal_entries)
    .where(and(entryWhere(s), eq(journal_entries.status, "borrador"), gte(journal_entries.date, from), lte(journal_entries.date, to)))
    .orderBy(asc(journal_entries.date), asc(journal_entries.created_at));
  for (const d of drafts) await registerEntry(s, actor, d.id);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.registrar_borradores", entityType: "organizacion", entityId: s.organizationId, metadata: { desde: from, hasta: to, asientos: drafts.length } });
  return drafts.length;
}

/** Un borrador se borra; un asiento registrado se anula (queda, tachado) */
export async function voidEntry(s: Scope, actor: Actor, id: string) {
  const [e] = await db().select().from(journal_entries).where(and(entryWhere(s), eq(journal_entries.id, id)));
  if (!e) throw new AccountingError("Ese asiento no es de esta organización.");
  await assertOpen(s, e.date);
  if (["refundicion", "cierre", "apertura"].includes(e.source)) throw new AccountingError("Los asientos de cierre se deshacen reabriendo el ejercicio.");
  if (e.status === "borrador") await db().delete(journal_entries).where(eq(journal_entries.id, e.id));
  else await db().update(journal_entries).set({ status: "anulado" }).where(eq(journal_entries.id, e.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.asiento_anular", entityType: "asiento", entityId: e.id, metadata: { numero: e.number, fecha: e.date, origen: e.source } });
}

export async function listEntries(s: Scope, f: { from?: string | null; to?: string | null; status?: string | null; source?: string | null; limit?: number } = {}) {
  return db()
    .select()
    .from(journal_entries)
    .where(and(entryWhere(s), f.from ? gte(journal_entries.date, f.from) : undefined, f.to ? lte(journal_entries.date, f.to) : undefined, f.status ? eq(journal_entries.status, f.status) : undefined, f.source ? eq(journal_entries.source, f.source) : undefined))
    .orderBy(desc(journal_entries.date), desc(journal_entries.number))
    .limit(f.limit ?? 200);
}

// ───────────── Modelos ─────────────

export async function listTemplates(s: Scope) {
  return db().select().from(journal_templates).where(and(eq(journal_templates.studio_id, s.studioId), eq(journal_templates.organization_id, s.organizationId))).orderBy(asc(journal_templates.name));
}

export async function saveTemplate(s: Scope, actor: Actor, i: { name: string; concept: string; lines: { code: string; side: "debe" | "haber"; amount: number | null }[] }) {
  if (!i.name.trim()) throw new AccountingError("Poné el nombre del modelo.");
  const accounts = await accountsOf(s);
  for (const l of i.lines) if (!accounts.some((a) => a.code === l.code && a.imputable)) throw new AccountingError(`La cuenta ${l.code} no está en el plan o no es imputable.`);
  if (i.lines.length < 2 || !i.lines.some((l) => l.side === "debe") || !i.lines.some((l) => l.side === "haber")) throw new AccountingError("Un modelo lleva al menos una cuenta al debe y una al haber.");
  const [row] = await db()
    .insert(journal_templates)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, name: i.name.trim().slice(0, 80), concept: i.concept.trim().slice(0, 200) || i.name.trim(), lines: i.lines, created_by: actor.id })
    .returning();
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.modelo", entityType: "modelo", entityId: row.id, metadata: { nombre: row.name } });
  return row;
}

/** Usa un modelo: importes del modelo o los que se pasan (por código de cuenta) */
export async function entryFromTemplate(s: Scope, actor: Actor, id: string, date: string, amounts: Record<string, number> = {}) {
  const [t] = await db()
    .select()
    .from(journal_templates)
    .where(and(eq(journal_templates.id, id), eq(journal_templates.studio_id, s.studioId), eq(journal_templates.organization_id, s.organizationId)));
  if (!t) throw new AccountingError("Ese modelo no es de esta organización.");
  const lines = t.lines.map((l) => {
    const v = amounts[l.code] ?? l.amount ?? 0;
    return { account: l.code, code: l.code, debit: l.side === "debe" ? v : 0, credit: l.side === "haber" ? v : 0 };
  });
  return createEntry(s, actor, { date, concept: t.concept, lines, source: "manual" });
}

// ───────────── Asientos automáticos ─────────────

const CREDIT_NOTES = new Set([3, 8, 13, 53, 203, 208, 213]);

type Roles = Map<string, { code: string; name: string }>;
async function rolesOf(s: Scope): Promise<Roles> {
  const accounts = await accountsOf(s);
  return new Map(accounts.filter((a) => a.role).map((a) => [a.role!, { code: a.code, name: a.name }]));
}
function L(roles: Roles, role: string, debit: number, credit: number, extra: Partial<Line> = {}): Line {
  const a = roles.get(role);
  if (!a) throw new AccountingError(`Falta en el plan una cuenta con el rol «${role}».`);
  return { account: a.name, code: a.code, debit: Math.round(debit), credit: Math.round(credit), ...extra };
}
/** Invierte un asiento (notas de crédito) */
const flip = (lines: Line[]) => lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
/** Quita líneas en cero y junta las de la misma cuenta y lado */
function tidy(lines: Line[]) {
  const out = new Map<string, Line>();
  for (const l of lines) {
    if (!l.debit && !l.credit) continue;
    const k = `${l.code}:${l.debit ? "d" : "c"}`;
    const prev = out.get(k);
    if (prev) {
      prev.debit += l.debit;
      prev.credit += l.credit;
    } else out.set(k, { ...l });
  }
  return [...out.values()];
}

/** ¿Los asientos automáticos se registran solos? (interruptor «contabilidad.asientos», auditado y con pausa) */
async function autoRegister(s: Scope) {
  const { automationAllows } = await import("@/modules/agent/automations");
  return automationAllows(s.studioId, s.organizationId, "contabilidad.asientos");
}

function invoiceLines(roles: Roles, inv: { cbte_type: number; currency: string; exchange_rate: string; net: string; iva: string; exempt: string; total: string; number: number | null; point_of_sale: number }) {
  const rate = inv.currency === "PES" ? 1 : Number(inv.exchange_rate) || 1;
  const c = (v: string) => Math.round(Number(v) * 100 * rate);
  const usd = inv.currency !== "PES";
  const lines = [
    L(roles, usd && roles.has("deudores_usd") ? "deudores_usd" : "deudores", c(inv.total), 0, usd ? { foreign: { currency: "USD", amount: Math.round(Number(inv.total) * 100), rate } } : {}),
    L(roles, "ventas", 0, c(inv.net) + c(inv.exempt)),
    L(roles, "iva_debito", 0, c(inv.iva)),
  ];
  // Redondeo de la conversión: va a ventas
  const diff = lines[0].debit - lines[1].credit - lines[2].credit;
  lines[1].credit += diff;
  return CREDIT_NOTES.has(inv.cbte_type) ? flip(lines) : lines;
}

function purchaseLines(roles: Roles, e: ReturnType<typeof asExtraction>, account: { code: string; name: string } | null) {
  if (!e) return null;
  const c = (v: number | null | undefined) => Math.round((v ?? 0) * 100);
  const discrimina = e.letra === "A" || e.letra === "M";
  const iva = e.iva.reduce((t, x) => t + c(x.importe), 0);
  const gasto = account ? { account: account.name, code: account.code } : null;
  const lines: Line[] = [];
  const base = c(e.neto_gravado) + c(e.no_gravado) + c(e.exento) + (discrimina ? 0 : iva);
  lines.push(gasto ? { ...gasto, debit: base, credit: 0 } : L(roles, "compras", base, 0));
  if (discrimina) lines.push(L(roles, "iva_credito", iva, 0));
  for (const p of e.percepciones) {
    const role = p.tipo === "iva" ? "percepciones_iva" : p.tipo === "iibb" ? "percepciones_iibb" : p.tipo === "ganancias" ? "percepciones_ganancias" : null;
    lines.push(role ? L(roles, role, c(p.importe), 0, { detail: p.jurisdiccion ?? p.concepto }) : gasto ? { ...gasto, debit: c(p.importe), credit: 0, detail: p.concepto } : L(roles, "compras", c(p.importe), 0, { detail: p.concepto }));
  }
  const debit = lines.reduce((t, l) => t + l.debit, 0);
  const total = c(e.total) || debit;
  // Si el total impreso no coincide con la suma (redondeos de la lectura), la diferencia va al gasto
  lines[0].debit += total - debit;
  lines.push(L(roles, "proveedores", 0, total));
  return e.tipo_documento === "nota_credito" ? flip(tidy(lines)) : tidy(lines);
}

function payrollLines(roles: Roles, t: { rem: number; norem: number; desc: number; net: number; contrib: number }) {
  // Centavos: bruto (remunerativo + no remunerativo) y contribuciones al debe; neto, aportes y contribuciones a pagar y otras retenciones al haber
  return tidy([
    L(roles, "sueldos", t.rem + t.norem, 0),
    L(roles, "cargas_sociales", t.contrib, 0),
    L(roles, "sueldos_a_pagar", 0, t.net),
    L(roles, "cargas_a_pagar", 0, t.contrib + Math.min(t.desc, t.rem + t.norem - t.net)),
    L(roles, "retenciones_empleados", 0, Math.max(0, t.rem + t.norem - t.net - t.desc)),
  ]);
}

interface GenerateResult {
  facturas: number;
  compras: number;
  sueldos: number;
  cobros: number;
  pagos: number;
  bancos: number;
  errores: string[];
}

/**
 * Genera los asientos automáticos de un período, cada uno con su origen
 * (idempotente: un asiento por origen). Quedan en borrador para revisar,
 * salvo que la organización haya activado el interruptor
 * «contabilidad.asientos». Si la contabilidad la maneja otro sistema
 * conectado, no se generan: se espejan sus asientos.
 */
export async function generateEntries(s: Scope, actor: Actor | null, from: string, to: string): Promise<GenerateResult> {
  const { sourceOf } = await import("@/modules/adapters/server");
  const owner = await sourceOf(s, "contabilidad");
  if (owner !== "faro") throw new AccountingError("La contabilidad de esta organización la maneja un sistema conectado: sus asientos se espejan desde allá (Sistemas conectados).");
  const roles = await rolesOf(s);
  const register = await autoRegister(s);
  const accounts = await accountsOf(s);
  const out: GenerateResult = { facturas: 0, compras: 0, sueldos: 0, cobros: 0, pagos: 0, bancos: 0, errores: [] };
  const add = async (key: keyof Omit<GenerateResult, "errores">, i: EntryInput) => {
    try {
      const row = await createEntry(s, actor, { ...i, register });
      if (row) out[key]++;
    } catch (e) {
      if (e instanceof AccountingError) out.errores.push(`${i.concept}: ${e.message}`);
      else throw e;
    }
  };
  // Facturas emitidas (y notas de crédito)
  const invs = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), eq(invoices.status, "autorizada"), gte(invoices.issue_date, from), lte(invoices.issue_date, to)));
  for (const inv of invs) {
    const label = `${CBTE_TYPES[inv.cbte_type as keyof typeof CBTE_TYPES]?.label ?? "Comprobante"} ${String(inv.point_of_sale).padStart(5, "0")}-${String(inv.number ?? 0).padStart(8, "0")} · ${inv.customer_name}`;
    await add("facturas", { date: inv.issue_date, concept: label, lines: invoiceLines(roles, inv), source: "factura", sourceId: inv.id });
  }
  // Cobros: factura marcada como cobrada (Mercado Pago o a mano)
  const paid = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), eq(invoices.status, "autorizada"), isNotNull(invoices.paid_at), gte(sql`(${invoices.paid_at} at time zone 'America/Argentina/Buenos_Aires')::date`, from), lte(sql`(${invoices.paid_at} at time zone 'America/Argentina/Buenos_Aires')::date`, to)));
  for (const inv of paid) {
    if (CREDIT_NOTES.has(inv.cbte_type)) continue;
    const amount = Math.round(Number(inv.total) * 100 * (inv.currency === "PES" ? 1 : Number(inv.exchange_rate) || 1));
    const day = new Date(inv.paid_at!.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    await add("cobros", { date: day, concept: `Cobro de ${inv.customer_name}`, lines: [L(roles, "banco", amount, 0), L(roles, "deudores", 0, amount)], source: "cobro", sourceId: inv.id });
  }
  // Compras confirmadas en la lectura
  const docs = await db()
    .select()
    .from(smart_documents)
    .where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.status, "confirmado"), inArray(smart_documents.kind, ["factura", "ticket", "nota_credito", "nota_debito"])));
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  for (const d of docs) {
    const e = asExtraction(d.extracted);
    const date = e?.fecha;
    if (!e || !date || date < from || date > to) continue;
    const acc = d.account ? (byName.get(d.account.toLowerCase()) ?? null) : null;
    const lines = purchaseLines(roles, e, acc ? { code: acc.code, name: acc.name } : null);
    if (lines) await add("compras", { date, concept: `Compra ${e.letra ?? ""} ${e.punto_venta ?? ""}-${e.numero ?? ""} · ${e.razon_social_emisor ?? "Proveedor"}`.replace(/\s+/g, " "), lines, source: "compra", sourceId: d.id });
  }
  // Sueldos: liquidaciones aprobadas o publicadas
  const runs = await db()
    .select()
    .from(payroll_runs)
    .where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), inArray(payroll_runs.status, ["aprobada", "publicada"]), gte(payroll_runs.pay_date, from), lte(payroll_runs.pay_date, to)));
  for (const r of runs) await add("sueldos", { date: r.pay_date, concept: `Sueldos ${r.kind} ${r.period}`, lines: payrollLines(roles, r.totals), source: "sueldos", sourceId: r.id });
  // Pagos a proveedores e impuestos y comisiones bancarias (de la conciliación)
  const movs = await db()
    .select()
    .from(bank_movements)
    .where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId), gte(bank_movements.date, from), lte(bank_movements.date, to)));
  for (const m of movs) {
    const amount = Math.abs(m.amount);
    if (m.status === "conciliado" && m.match_type === "comprobante_recibido" && m.amount < 0) {
      await add("pagos", { date: m.date, concept: `Pago · ${m.description}`, lines: [L(roles, "proveedores", amount, 0), L(roles, "banco", 0, amount)], source: "pago", sourceId: m.id });
      continue;
    }
    const tax = bankTaxRole(m.description, m.cls);
    if (tax && m.amount < 0 && m.status !== "ignorado") await add("bancos", { date: m.date, concept: `${tax.label} · ${m.description}`, lines: [L(roles, tax.role, amount, 0), L(roles, "banco", 0, amount)], source: "banco", sourceId: m.id });
  }
  if (actor) await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.generar", entityType: "organizacion", entityId: s.organizationId, metadata: { desde: from, hasta: to, ...out, errores: out.errores.length, registrados: register } });
  return out;
}

/**
 * Débitos del banco que son impuestos o retenciones (A3): impuesto a los
 * débitos y créditos (la parte computable como pago a cuenta la define el
 * contador: se registra entera como pago a cuenta y él la reclasifica),
 * retenciones SIRCREB de ingresos brutos y comisiones.
 */
function bankTaxRole(description: string, cls: string): { role: string; label: string } | null {
  const d = description.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (/sircreb|ret(\.|encion)? ?(ii\.?bb|iibb|ingresos brutos)|rg ?(arba|agip)/.test(d)) return { role: "sircreb", label: "Retención SIRCREB" };
  if (/(imp(\.|uesto)?|ley) ?(25\.?413|deb(\.|ito)?s? ?(y|\/) ?cred|s\/deb|s\/cred)|impuesto a los debitos|impuesto a los creditos|ley 25413|idcb/.test(d)) return { role: "impuesto_debcred", label: "Impuesto a los débitos y créditos" };
  if (cls === "comision") return { role: "gastos_bancarios", label: "Comisión bancaria" };
  return null;
}

// ───────────── Libros y estados ─────────────

/** Asientos para los libros: los registrados de Faro y, si manda un sistema conectado, sus asientos espejados */
async function bookEntries(s: Scope): Promise<{ entries: Entry[]; accounts: Account[]; mirrored: boolean }> {
  const accounts = await accountsOf(s);
  const rows = await db()
    .select()
    .from(journal_entries)
    .where(and(entryWhere(s), ne(journal_entries.status, "borrador")));
  const entries: Entry[] = rows.map((r) => ({ id: r.id, date: r.date, number: r.number, concept: r.concept, status: r.status, source: r.source, lines: r.lines }));
  const { sourceOf } = await import("@/modules/adapters/server");
  const owner = await sourceOf(s, "contabilidad");
  if (owner === "faro") return { entries, accounts, mirrored: false };
  // Asientos espejados: las cuentas del otro sistema se traducen con el mapeo del plan
  const byExternal = new Map(accounts.flatMap((a) => Object.entries(a.external_codes ?? {}).filter(([sys]) => sys === owner).map(([, c]) => [c, a])));
  const ext = await db()
    .select({ r: external_records })
    .from(external_records)
    .innerJoin(connections, eq(connections.id, external_records.connection_id))
    .where(and(eq(external_records.studio_id, s.studioId), eq(external_records.organization_id, s.organizationId), eq(external_records.resource, "asientos"), eq(connections.connector, owner)));
  for (const { r } of ext) {
    const raw = r.raw as { asientoContableManualItem?: { cuenta?: { codigo?: string; nombre?: string }; debeHaber?: number; importe?: number }[] };
    const lines: Line[] = (raw.asientoContableManualItem ?? []).map((it) => {
      const a = byExternal.get(it.cuenta?.codigo ?? "");
      const v = Math.round((Number(it.importe) || 0) * 100);
      return { account: a?.name ?? it.cuenta?.nombre ?? "Sin mapear", code: a?.code, debit: it.debeHaber === 1 ? v : 0, credit: it.debeHaber === 1 ? 0 : v };
    });
    if (lines.length) entries.push({ id: r.id, date: r.record_date ?? todayAR(), number: null, concept: `${r.name ?? "Asiento"} (de ${owner})`, status: "registrado", source: `espejo:${owner}`, lines });
  }
  return { entries, accounts, mirrored: true };
}

export async function trialOf(s: Scope, from: string | null, to: string) {
  const { entries, accounts, mirrored } = await bookEntries(s);
  return { ...trialBalance(entries, accounts, from, to), mirrored };
}

export async function statementsOf(s: Scope, from: string, to: string) {
  const { entries, accounts } = await bookEntries(s);
  // Situación patrimonial: saldos acumulados a la fecha; resultados: los del ejercicio
  const balance = statements(trialBalance(entries, accounts, null, to).rows);
  const results = statements(trialBalance(entries, accounts, from, to).rows);
  return { situacion: balance.situacion, resultados: results.resultados, cierra: balance.cierra, sinCuenta: balance.sinCuenta };
}

export async function ledgerOf(s: Scope, code: string, from: string | null, to: string) {
  const { entries, accounts } = await bookEntries(s);
  const account = accounts.find((a) => a.code === code);
  if (!account) throw new AccountingError("Esa cuenta no está en el plan.");
  return { account, ...ledger(entries, accounts, code, from, to) };
}

export async function journalOf(s: Scope, from: string, to: string) {
  const { entries } = await bookEntries(s);
  return entries
    .filter((e) => e.status === "registrado" && e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? 0) - (b.number ?? 0));
}

// ───────────── Cuentas corrientes ─────────────

export async function receivables(s: Scope, today = todayAR()) {
  const rows = await db()
    .select()
    .from(invoices)
    .where(and(eq(invoices.studio_id, s.studioId), eq(invoices.organization_id, s.organizationId), eq(invoices.status, "autorizada")));
  const items: OpenItem[] = [];
  const credits = new Map<string, number>();
  for (const r of rows) {
    const amount = Math.round(Number(r.total) * 100 * (r.currency === "PES" ? 1 : Number(r.exchange_rate) || 1));
    const party = r.customer_name;
    if (CREDIT_NOTES.has(r.cbte_type)) {
      credits.set(party, (credits.get(party) ?? 0) + amount);
      continue;
    }
    if (r.paid_at) continue;
    items.push({ party, doc: `${String(r.point_of_sale).padStart(5, "0")}-${String(r.number ?? 0).padStart(8, "0")}`, date: r.issue_date, due: r.payment_due, amount });
  }
  // Las notas de crédito sin aplicar bajan la deuda del cliente (sobre lo más viejo)
  for (const it of items.sort((a, b) => a.date.localeCompare(b.date))) {
    const c = credits.get(it.party) ?? 0;
    if (!c) continue;
    const used = Math.min(c, it.amount);
    it.amount -= used;
    credits.set(it.party, c - used);
  }
  return aging(items, today);
}

export async function payables(s: Scope, today = todayAR()) {
  const [docs, paidIds] = await Promise.all([
    db()
      .select()
      .from(smart_documents)
      .where(and(eq(smart_documents.studio_id, s.studioId), eq(smart_documents.organization_id, s.organizationId), eq(smart_documents.status, "confirmado"), inArray(smart_documents.kind, ["factura", "nota_debito"]))),
    db()
      .select({ id: bank_movements.match_id })
      .from(bank_movements)
      .where(and(eq(bank_movements.studio_id, s.studioId), eq(bank_movements.organization_id, s.organizationId), eq(bank_movements.status, "conciliado"), eq(bank_movements.match_type, "comprobante_recibido"))),
  ]);
  const paid = new Set(paidIds.map((p) => p.id));
  const items: OpenItem[] = [];
  for (const d of docs) {
    if (paid.has(d.id)) continue;
    const e = asExtraction(d.extracted);
    if (!e?.fecha || !e.total) continue;
    items.push({ party: e.razon_social_emisor ?? e.cuit_emisor ?? "Proveedor", doc: `${e.letra ?? ""} ${e.punto_venta ?? ""}-${e.numero ?? ""}`.trim(), date: e.fecha, due: null, amount: Math.round(e.total * 100) });
  }
  return aging(items, today);
}

// ───────────── Bienes de uso ─────────────

export async function listAssets(s: Scope, at = todayAR()) {
  const rows = await db().select().from(fixed_assets).where(and(eq(fixed_assets.studio_id, s.studioId), eq(fixed_assets.organization_id, s.organizationId))).orderBy(asc(fixed_assets.acquired_on));
  return rows.map((r) => ({ ...r, ...depreciation({ cost: r.cost, residual: r.residual, lifeMonths: r.life_months, acquiredOn: r.acquired_on, disposedOn: r.disposed_on }, at) }));
}

export async function saveAsset(s: Scope, actor: Actor, i: { name: string; accountCode: string; acquiredOn: string; cost: number; residual: number; lifeMonths: number }) {
  if (!i.name.trim()) throw new AccountingError("Poné el nombre del bien.");
  if (!(i.cost > 0) || !(i.lifeMonths > 0) || i.residual < 0 || i.residual >= i.cost) throw new AccountingError("Revisá el costo, el valor residual y la vida útil (en meses).");
  const accounts = await accountsOf(s);
  if (!accounts.some((a) => a.code === i.accountCode && a.imputable && a.kind === "activo")) throw new AccountingError("Elegí una cuenta de bienes de uso del plan.");
  await assertOpen(s, i.acquiredOn);
  const [row] = await db()
    .insert(fixed_assets)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, name: i.name.trim().slice(0, 120), account_code: i.accountCode, acquired_on: i.acquiredOn, cost: i.cost, residual: i.residual, life_months: i.lifeMonths, created_by: actor.id })
    .returning();
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.bien_uso", entityType: "bien_uso", entityId: row.id, metadata: { nombre: row.name, costo: i.cost / 100 } });
  return row;
}

/** Asiento de amortización de un período (uno por período: idempotente) */
export async function depreciationEntry(s: Scope, actor: Actor, from: string, to: string) {
  const roles = await rolesOf(s);
  const assets = await db().select().from(fixed_assets).where(and(eq(fixed_assets.studio_id, s.studioId), eq(fixed_assets.organization_id, s.organizationId)));
  const total = assets.reduce((t, a) => t + Math.max(0, depreciationBetween({ cost: a.cost, residual: a.residual, lifeMonths: a.life_months, acquiredOn: a.acquired_on, disposedOn: a.disposed_on }, from, to)), 0);
  if (!total) throw new AccountingError("No hay amortizaciones para ese período.");
  return createEntry(s, actor, { date: to, concept: `Amortizaciones de bienes de uso del ${from.split("-").reverse().join("/")} al ${to.split("-").reverse().join("/")}`, lines: [L(roles, "amortizaciones", total, 0), L(roles, "amortizacion_acumulada", 0, total)], source: "amortizacion", sourceId: uuidFrom(`amortizacion:${s.organizationId}:${from}:${to}`) });
}

// ───────────── Moneda extranjera ─────────────

/** Saldos de las cuentas en moneda extranjera: en pesos (libro) y en la moneda (líneas con su importe original) */
export async function foreignBalances(s: Scope, at: string) {
  const { entries, accounts } = await bookEntries(s);
  const foreign = accounts.filter((a) => a.currency !== "ARS" && a.imputable);
  return foreign.map((a) => {
    let ars = 0;
    let fx = 0;
    for (const e of entries) {
      if (e.status !== "registrado" || e.date > at) continue;
      for (const l of e.lines) {
        if (l.code !== a.code) continue;
        ars += l.debit - l.credit;
        const sign = l.debit ? 1 : -1;
        fx += sign * (l.foreign?.amount ?? 0);
      }
    }
    return { account: a, ars, foreign: fx };
  });
}

/** Asiento de diferencia de cambio al tipo de cambio de cierre (uno por cuenta y fecha) */
export async function fxRevaluation(s: Scope, actor: Actor, at: string, rate: number) {
  if (!(rate > 0)) throw new AccountingError("Poné el tipo de cambio de cierre.");
  const roles = await rolesOf(s);
  const out: string[] = [];
  for (const b of await foreignBalances(s, at)) {
    const { difference } = fxDifference(b.ars, b.foreign, rate);
    if (!difference) continue;
    const debitNat = b.account.kind === "activo" || b.account.kind === "egreso";
    // Un activo que sube en pesos es ganancia; un pasivo que sube, pérdida
    const gain = debitNat ? difference > 0 : difference < 0;
    const amount = Math.abs(difference);
    const accLine: Line = { account: b.account.name, code: b.account.code, debit: difference > 0 ? amount : 0, credit: difference > 0 ? 0 : amount, foreign: { currency: b.account.currency, amount: 0, rate } };
    const resLine = L(roles, gain ? "diferencia_cambio_positiva" : "diferencia_cambio_negativa", difference > 0 ? 0 : amount, difference > 0 ? amount : 0);
    const row = await createEntry(s, actor, { date: at, concept: `Diferencia de cambio de ${b.account.name} a $ ${rate}`, lines: [accLine, resLine], source: "diferencia_cambio", sourceId: uuidFrom(`fx:${s.organizationId}:${b.account.code}:${at}`) });
    if (row) out.push(row.id);
  }
  return out.length;
}

// ───────────── Ejercicios ─────────────

export async function yearsOf(s: Scope) {
  return db().select().from(fiscal_years).where(and(eq(fiscal_years.studio_id, s.studioId), eq(fiscal_years.organization_id, s.organizationId))).orderBy(desc(fiscal_years.start));
}

/** Cierra el ejercicio que termina en `end`: refundición, cierre, apertura del siguiente y bloqueo hasta el cierre */
export async function closeYear(s: Scope, actor: Actor, end: string) {
  const st = await settingsOf(s);
  const { start, end: realEnd } = fiscalYearOf(end, st.year_end);
  if (realEnd !== end) throw new AccountingError(`El ejercicio cierra el ${st.year_end.split("-").reverse().join("/")}: elegí esa fecha.`);
  const [existing] = await db()
    .select()
    .from(fiscal_years)
    .where(and(eq(fiscal_years.organization_id, s.organizationId), eq(fiscal_years.start, start)));
  if (existing?.status === "cerrado") throw new AccountingError("Ese ejercicio ya está cerrado.");
  const [drafts] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(journal_entries)
    .where(and(entryWhere(s), eq(journal_entries.status, "borrador"), lte(journal_entries.date, end)));
  if (drafts.n) throw new AccountingError(`Hay ${drafts.n} ${drafts.n === 1 ? "asiento en borrador" : "asientos en borrador"} del ejercicio: registralos o borralos antes de cerrar.`);
  const roles = await rolesOf(s);
  const res = roles.get("resultado_ejercicio");
  if (!res) throw new AccountingError("Falta la cuenta «Resultado del ejercicio» en el plan.");
  const trial = await trialOf(s, null, end);
  const st2 = statements(trial.rows);
  if (!st2.cierra) throw new AccountingError(st2.sinCuenta.length ? "Hay líneas con cuentas que no están en el plan: corregilas antes de cerrar." : "El balance no cierra: revisá los asientos antes de cerrar.");
  // Solo los resultados del ejercicio se refunden; los patrimoniales se cierran con su saldo acumulado
  const yearTrial = await trialOf(s, start, end);
  const resultRows = yearTrial.rows.filter((r) => r.kind === "ingreso" || r.kind === "egreso");
  const c = closingEntries([...trial.rows.filter((r) => r.kind !== "ingreso" && r.kind !== "egreso"), ...resultRows], res.code, res.name);
  const ids: string[] = [];
  const next = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10);
  if (c.refund.length) ids.push((await createEntry(s, actor, { date: end, concept: `Refundición de cuentas de resultado del ejercicio ${start.slice(0, 4)}`, lines: c.refund, source: "refundicion", sourceId: uuidFrom(`refundicion:${s.organizationId}:${end}`), register: true }))!.id);
  if (c.close.length) ids.push((await createEntry(s, actor, { date: end, concept: `Asiento de cierre del ejercicio ${start.slice(0, 4)}`, lines: c.close, source: "cierre", sourceId: uuidFrom(`cierre:${s.organizationId}:${end}`), register: true }))!.id);
  const opening = c.opening.length ? await createEntry(s, actor, { date: next, concept: `Asiento de apertura del ejercicio ${next.slice(0, 4)}`, lines: c.opening, source: "apertura", sourceId: uuidFrom(`apertura:${s.organizationId}:${next}`), register: true }) : null;
  await db()
    .insert(fiscal_years)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, start, end, status: "cerrado", closing_entries: ids, opening_entry: opening?.id ?? null, closed_by: actor.id, closed_at: new Date() })
    .onConflictDoUpdate({ target: [fiscal_years.organization_id, fiscal_years.start], set: { status: "cerrado", closing_entries: ids, opening_entry: opening?.id ?? null, closed_by: actor.id, closed_at: new Date() } });
  await db().update(accounting_settings).set({ locked_until: end, updated_by: actor.id, updated_at: new Date() }).where(eq(accounting_settings.organization_id, s.organizationId));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.cierre", entityType: "ejercicio", entityId: start, metadata: { desde: start, hasta: end, resultado: st2.situacion.resultado / 100 } });
  return { start, end, result: (await statementsOf(s, start, end)).resultados.resultado };
}

/** Reabre un ejercicio cerrado: anula sus asientos de cierre y la apertura, y desbloquea (auditado) */
export async function reopenYear(s: Scope, actor: Actor, id: string, reason: string) {
  if (!reason.trim()) throw new AccountingError("Contá por qué se reabre el ejercicio: queda en la auditoría.");
  const [y] = await db()
    .select()
    .from(fiscal_years)
    .where(and(eq(fiscal_years.id, id), eq(fiscal_years.studio_id, s.studioId), eq(fiscal_years.organization_id, s.organizationId)));
  if (!y || y.status !== "cerrado") throw new AccountingError("Ese ejercicio no está cerrado.");
  const [later] = await db()
    .select({ id: fiscal_years.id })
    .from(fiscal_years)
    .where(and(eq(fiscal_years.organization_id, s.organizationId), eq(fiscal_years.status, "cerrado"), sql`${fiscal_years.start} > ${y.start}`));
  if (later) throw new AccountingError("Primero reabrí el ejercicio siguiente.");
  const ids = [...y.closing_entries, ...(y.opening_entry ? [y.opening_entry] : [])];
  if (ids.length) await db().update(journal_entries).set({ status: "anulado" }).where(and(entryWhere(s), inArray(journal_entries.id, ids)));
  const prevEnd = new Date(Date.parse(y.start) - 86400000).toISOString().slice(0, 10);
  const [prev] = await db()
    .select()
    .from(fiscal_years)
    .where(and(eq(fiscal_years.organization_id, s.organizationId), eq(fiscal_years.end, prevEnd), eq(fiscal_years.status, "cerrado")));
  await db()
    .update(accounting_settings)
    .set({ locked_until: prev ? prevEnd : null, updated_by: actor.id, updated_at: new Date() })
    .where(eq(accounting_settings.organization_id, s.organizationId));
  await db().update(fiscal_years).set({ status: "abierto", reopened_at: new Date(), closing_entries: [], opening_entry: null }).where(eq(fiscal_years.id, y.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.reabrir_ejercicio", entityType: "ejercicio", entityId: y.start, metadata: { desde: y.start, hasta: y.end, motivo: reason.slice(0, 300) } });
}

/** Período por defecto: el ejercicio en curso */
export async function currentYear(s: Scope, today = todayAR()) {
  const st = await settingsOf(s);
  return fiscalYearOf(today, st.year_end);
}
