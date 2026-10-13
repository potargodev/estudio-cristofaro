import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { faro_settings, inflation_adjustments, inflation_indexes, journal_entries, ledger_accounts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { safeFetch } from "@/lib/safe-fetch";
import { fiscalYearOf } from "./core";
import { adjustmentLines, missingMonths, neededMonths, parseSeries, restate, type IndexSeries, type RestatedAccount } from "./inflacion";
import { suggestMonetary } from "./plan";
import { AccountingError, accountsOf, bookEntries, createEntry, rolesOf, settingsOf, trialOf, uuidFrom, type Scope } from "./server";

// Ajuste por inflación contable (A2): índices de la FACPCE (Faro Manager, con
// fuente configurable y carga manual; la organización puede completar meses
// a mano), clasificación monetaria editable, reexpresión, RECPAM y asiento
// en borrador. Faro arma el papel de trabajo; el contador decide (§1).

type Actor = { id: string; email: string; name?: string };
const db = () => getDb();
const SERIES = "facpce";
const SOURCE_KEY = "inflacion.fuente";

// ───────────── Índices (Faro Manager) ─────────────

export async function platformIndexes() {
  return db().select().from(inflation_indexes).where(eq(inflation_indexes.series, SERIES)).orderBy(asc(inflation_indexes.month));
}

export async function saveIndexes(actor: Actor, text: string, source: string) {
  const { rows, errors } = parseSeries(text);
  if (!rows.length || errors.length) throw new AccountingError(errors.length ? `Revisá estas filas (AAAA-MM;valor): ${errors.slice(0, 3).join(" · ")}` : "Pegá al menos un mes.");
  const src = source.trim() || "FACPCE · Res. JG 539/18 (IPIM hasta 2016, IPC desde 2017)";
  for (const r of rows) {
    const v = { series: SERIES, month: r.month, value: String(r.value), source: src, updated_by: actor.id };
    await db().insert(inflation_indexes).values(v).onConflictDoUpdate({ target: [inflation_indexes.series, inflation_indexes.month], set: { value: v.value, source: src, updated_by: actor.id, updated_at: new Date() } });
  }
  await audit({ studioId: null, actor, action: "faro.indices_inflacion", metadata: { meses: rows.length, desde: rows[0].month, hasta: rows[rows.length - 1].month, fuente: src } });
  return rows.length;
}

export async function indexSource(): Promise<{ url: string; name: string } | null> {
  const [r] = await db().select().from(faro_settings).where(eq(faro_settings.key, SOURCE_KEY));
  return (r?.value as { url: string; name: string } | undefined) ?? null;
}

export async function setIndexSource(actor: Actor, url: string, name: string) {
  const u = url.trim();
  if (u && !/^https?:\/\//.test(u)) throw new AccountingError("La fuente es una dirección que empieza con http:// o https://.");
  if (!u) await db().delete(faro_settings).where(eq(faro_settings.key, SOURCE_KEY));
  else await db().insert(faro_settings).values({ key: SOURCE_KEY, value: { url: u, name: name.trim() || u }, updated_by: actor.id }).onConflictDoUpdate({ target: faro_settings.key, set: { value: { url: u, name: name.trim() || u }, updated_by: actor.id } });
  await audit({ studioId: null, actor, action: "faro.indices_fuente", metadata: { url: u || null } });
}

/** Trae la serie de la fuente configurada (CSV «AAAA-MM;valor») y la guarda */
export async function fetchIndexes(actor: Actor) {
  const src = await indexSource();
  if (!src) throw new AccountingError("Configurá primero la fuente de los índices.");
  let text: string;
  try {
    const res = await safeFetch(src.url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    throw new AccountingError(`No pudimos leer la fuente (${(e as Error).message}). Cargá la serie a mano.`);
  }
  return saveIndexes(actor, text, src.name);
}

// ───────────── Ajuste de una organización ─────────────

async function yearOf(s: Scope, end: string) {
  const st = await settingsOf(s);
  const y = fiscalYearOf(end, st.year_end);
  if (y.end !== end) throw new AccountingError(`El ejercicio cierra el ${st.year_end.split("-").reverse().join("/")}: elegí esa fecha.`);
  return y;
}

async function adjustmentOf(s: Scope, end: string) {
  const [r] = await db()
    .select()
    .from(inflation_adjustments)
    .where(and(eq(inflation_adjustments.studio_id, s.studioId), eq(inflation_adjustments.organization_id, s.organizationId), eq(inflation_adjustments.year_end, end)));
  return r ?? null;
}

/** Índices del ejercicio: los de la plataforma y, encima, los cargados a mano para la organización */
async function seriesFor(s: Scope, end: string) {
  const series: IndexSeries = new Map();
  const used: Record<string, { value: number; source: string }> = {};
  for (const r of await platformIndexes()) {
    series.set(r.month, Number(r.value));
    used[r.month] = { value: Number(r.value), source: r.source };
  }
  const own = await adjustmentOf(s, end);
  for (const [m, v] of Object.entries(own?.indexes ?? {})) {
    if (v.source !== "manual") continue;
    series.set(m, v.value);
    used[m] = v;
  }
  return { series, used };
}

/** Carga a mano índices de meses que faltan (o que el estudio quiere usar distintos) para esta organización */
export async function saveOwnIndexes(s: Scope, actor: Actor, end: string, text: string) {
  await accountsOf(s); // valida que la organización sea del estudio
  const y = await yearOf(s, end);
  const { rows, errors } = parseSeries(text);
  if (!rows.length || errors.length) throw new AccountingError(errors.length ? `Revisá estas filas (AAAA-MM;valor): ${errors.slice(0, 3).join(" · ")}` : "Pegá al menos un mes.");
  const own = await adjustmentOf(s, end);
  const indexes = { ...(own?.indexes ?? {}) };
  for (const r of rows) indexes[r.month] = { value: r.value, source: "manual" };
  await db()
    .insert(inflation_adjustments)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, year_start: y.start, year_end: y.end, indexes, created_by: actor.id })
    .onConflictDoUpdate({ target: [inflation_adjustments.organization_id, inflation_adjustments.year_end], set: { indexes, updated_at: new Date() } });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.indices_manuales", entityType: "ajuste_inflacion", entityId: end, metadata: { meses: rows.map((r) => r.month) } });
  return rows.length;
}

/** Clasificación monetaria: la del plan, con la sugerencia de Faro al lado */
export async function classification(s: Scope) {
  const acc = await accountsOf(s);
  return acc.filter((a) => a.imputable).map((a) => ({ code: a.code, name: a.name, kind: a.kind, monetary: a.monetary, suggested: suggestMonetary(a.kind, a.name), role: a.role }));
}

export async function setClassification(s: Scope, actor: Actor, monetary: Set<string>) {
  const acc = await accountsOf(s);
  const changed: string[] = [];
  for (const a of acc) {
    if (!a.imputable) continue;
    const m = monetary.has(a.code);
    if (m === a.monetary) continue;
    await db().update(ledger_accounts).set({ monetary: m }).where(and(eq(ledger_accounts.id, a.id), eq(ledger_accounts.organization_id, s.organizationId)));
    changed.push(`${a.code} ${m ? "monetaria" : "no monetaria"}`);
  }
  if (changed.length) await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "contabilidad.clasificacion_monetaria", entityType: "plan", metadata: { cambios: changed.slice(0, 50) } });
  return changed.length;
}

interface Preview {
  start: string;
  end: string;
  missing: string[];
  used: Record<string, { value: number; source: string }>;
  months: string[];
  rows: RestatedAccount[];
  lines: { account: string; code: string; debit: number; credit: number }[];
  recpam: number;
  /** Nominal y homogéneo, cuenta por cuenta (saldo debe − haber al cierre) */
  compare: { code: string; name: string; kind: string; nominal: number; homogeneous: number }[];
  entry: { id: string; status: string; number: number | null } | null;
}

/** Calcula el ajuste del ejercicio sin guardar nada */
export async function previewAdjustment(s: Scope, end: string): Promise<Preview> {
  await accountsOf(s); // valida que la organización sea del estudio
  const { start } = await yearOf(s, end);
  const { series, used } = await seriesFor(s, end);
  const missing = missingMonths(series, start, end);
  const months = neededMonths(start, end);
  const own = await adjustmentOf(s, end);
  const entry = own?.entry_id ? ((await db().select({ id: journal_entries.id, status: journal_entries.status, number: journal_entries.number }).from(journal_entries).where(eq(journal_entries.id, own.entry_id)))[0] ?? null) : null;
  const base = { start, end, missing, used, months, entry: entry && entry.status !== "anulado" ? entry : null };
  if (missing.length) return { ...base, rows: [], lines: [], recpam: 0, compare: [] };
  const { entries, accounts } = await bookEntries(s);
  const rows = restate(entries, accounts, series, start, end);
  const roles = await rolesOf(s);
  const recpamAcc = roles.get("recpam");
  if (!recpamAcc) throw new AccountingError("Falta en el plan la cuenta del RECPAM (rol «recpam»).");
  const { lines, recpam } = adjustmentLines(rows, { capital: roles.get("capital")?.code, ajusteCapital: roles.get("ajuste_capital"), recpam: recpamAcc });
  // Nominal (sin el ajuste ya registrado) y homogéneo
  const trial = await trialOf(s, null, end);
  const registeredAdj = new Map<string, number>();
  for (const e of entries) if (e.source === "ajuste_inflacion" && e.status === "registrado" && e.date >= start && e.date <= end) for (const l of e.lines) if (l.code) registeredAdj.set(l.code, (registeredAdj.get(l.code) ?? 0) + l.debit - l.credit);
  const delta = new Map<string, number>();
  for (const l of lines) delta.set(l.code, (delta.get(l.code) ?? 0) + l.debit - l.credit);
  const codes = new Set([...trial.rows.map((r) => r.code), ...delta.keys()]);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const trialBy = new Map(trial.rows.map((r) => [r.code, r.balance]));
  const compare = [...codes]
    .map((code) => {
      const nominal = (trialBy.get(code) ?? 0) - (registeredAdj.get(code) ?? 0);
      return { code, name: byCode.get(code)?.name ?? code, kind: byCode.get(code)?.kind ?? "", nominal, homogeneous: nominal + (delta.get(code) ?? 0) };
    })
    .filter((r) => r.nominal || r.homogeneous)
    .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  return { ...base, rows, lines, recpam, compare };
}

/** Arma (o rearma) el asiento de ajuste en borrador y guarda el papel de trabajo */
export async function runAdjustment(s: Scope, actor: Actor | null, end: string) {
  const p = await previewAdjustment(s, end);
  if (p.missing.length) throw new AccountingError(`Faltan los índices de ${p.missing.join(", ")}: cargalos a mano o pedí que se actualice la serie.`);
  if (p.entry?.status === "registrado") throw new AccountingError("El asiento de ajuste de este ejercicio ya está registrado: anulalo para rehacerlo.");
  if (p.entry) await db().delete(journal_entries).where(and(eq(journal_entries.id, p.entry.id), eq(journal_entries.status, "borrador"), eq(journal_entries.organization_id, s.organizationId)));
  if (!p.lines.length) throw new AccountingError("No hay partidas no monetarias para reexpresar en el ejercicio.");
  const row = await createEntry(s, actor, { date: end, concept: `Ajuste por inflación del ejercicio ${p.start.slice(0, 4)}${p.start.slice(0, 4) !== end.slice(0, 4) ? `/${end.slice(0, 4)}` : ""} (RT 6)`, lines: p.lines, source: "ajuste_inflacion", sourceId: uuidFrom(`inflacion:${s.organizationId}:${end}`) });
  const indexes = Object.fromEntries(p.months.map((m) => [m, p.used[m]]));
  await db()
    .insert(inflation_adjustments)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, year_start: p.start, year_end: end, indexes, rows: p.rows, recpam: p.recpam, entry_id: row?.id ?? null, created_by: actor?.id ?? null })
    .onConflictDoUpdate({ target: [inflation_adjustments.organization_id, inflation_adjustments.year_end], set: { indexes, rows: p.rows, recpam: p.recpam, entry_id: row?.id ?? null, updated_at: new Date() } });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, actorLabel: actor ? undefined : "Agente contable", action: "contabilidad.ajuste_inflacion", entityType: "ajuste_inflacion", entityId: end, metadata: { desde: p.start, hasta: end, recpam: p.recpam / 100, cuentas: p.rows.filter((r) => !r.monetary).length } });
  return { ...p, entryId: row?.id ?? null };
}
