import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { readSheet } from "read-excel-file/node";
import { getDb } from "@/db";
import { cct_scales, employee_events, employees, legal_entities, organizations, payroll_items, payroll_novelties, payroll_runs, payroll_settings, payslip_batches, payslips, users, type PayrollChange } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hasModule } from "@/lib/faro/entitlements";
import { UUID } from "@/lib/ids";
import { storeUpload } from "@/lib/uploads";
import { notify } from "@/modules/notifications/server";
import { publishBatch, type PayrollScope } from "@/modules/payroll/server";
import { cctOf, CCTS, OWN_CCT, scaleAt, type CctCategory, type CctScale } from "./convenios";
import { DEFAULT_ORG, END_REASON, liquidarFinal, liquidarMensual, liquidarSac, liquidarVacaciones, NOVELTY_LABEL, paramsAt, variations, type EndReason, type Employee, type Novelty, type NoveltyKind, type OrgPayroll, type Result } from "./core";
import { bankFiles, f931File, lsdFile, type ExportItem } from "./exportaciones";
import { receiptPdf } from "./recibo";
import { createHash } from "node:crypto";

// Liquidación de sueldos del lado del servidor (§2.q etapa 6). El alcance
// (PayrollScope) sale de la sesión como en Sueldos y empleados; acá cada query
// vuelve a filtrar por estudio y organización. Faro calcula y deja la
// liquidación en borrador; una persona la aprueba y recién ahí se publican
// los recibos para la firma (la IA propone, una persona aprueba).

const db = () => getDb();
type Actor = { id: string; email: string; name?: string };
type Run = typeof payroll_runs.$inferSelect;
export type RunKind = "mensual" | "sac" | "vacaciones" | "final";
export const RUN_KIND: Record<RunKind, string> = { mensual: "Mensual", sac: "SAC (aguinaldo)", vacaciones: "Vacaciones", final: "Liquidación final" };
export const RUN_STATUS: Record<string, string> = { borrador: "Borrador", aprobada: "Aprobada", publicada: "Publicada", reemplazada: "Reemplazada", anulada: "Anulada" };

export class LiquidacionError extends Error {}

const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
const isDate = (d: string | null | undefined) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const lastDay = (period: string) => new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5)), 0)).toISOString().slice(0, 10);

function manage(s: PayrollScope) {
  if (!s.canManage) throw new LiquidacionError("No tenés permiso para liquidar sueldos.");
}

async function requirePayroll(s: PayrollScope) {
  if (!(await hasModule(s.studioId, "payroll"))) throw new LiquidacionError("La liquidación de sueldos viene con el plan Profesional.");
}

// ───────────── Escalas, parámetros y ajustes ─────────────

export async function scaleVersions(): Promise<CctScale[]> {
  const rows = await db().select().from(cct_scales).orderBy(asc(cct_scales.cct_key), desc(cct_scales.valid_from));
  return rows.map((r) => ({ cctKey: r.cct_key, validFrom: r.valid_from, status: r.status as CctScale["status"], source: r.source, categories: r.categories }));
}

export async function settingsOf(s: PayrollScope): Promise<OrgPayroll & { payPlace: string | null; lastDeposit: string | null; saved: boolean }> {
  const [r] = await db().select().from(payroll_settings).where(and(eq(payroll_settings.organization_id, s.organizationId), eq(payroll_settings.studio_id, s.studioId)));
  if (!r) return { ...DEFAULT_ORG, payPlace: null, lastDeposit: null, saved: false };
  return { employerKind: r.employer_kind === "grande" ? "grande" : "general", artPct: Number(r.art_pct), artFixed: Number(r.art_fixed), lifeInsurance: Number(r.life_insurance), ownCategories: r.own_categories, payPlace: r.pay_place, lastDeposit: r.last_deposit, saved: true };
}

/** «COD;Nombre;Básico» por línea → categorías */
function parseCategories(text: string): CctCategory[] {
  const out: CctCategory[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const [code, name, basic] = raw.split(/[;\t]/).map((x) => x?.trim() ?? "");
    if (!code && !name) continue;
    const n = Number(String(basic).replace(/\./g, "").replace(",", "."));
    if (!code || !name || !(n > 0)) throw new LiquidacionError(`Revisá la línea «${raw.trim().slice(0, 60)}»: va código; nombre; básico.`);
    out.push({ code: code.slice(0, 12).toUpperCase(), name: name.slice(0, 80), basic: Math.round(n * 100) / 100 });
  }
  return out.slice(0, 60);
}

export async function saveSettings(s: PayrollScope, actor: Actor, i: { employerKind: string; artPct: number; artFixed: number; lifeInsurance: number; ownCategories: string; payPlace: string | null; lastDeposit: string | null }) {
  manage(s);
  if (!(i.artPct >= 0 && i.artPct <= 20) || !(i.artFixed >= 0) || !(i.lifeInsurance >= 0)) throw new LiquidacionError("Revisá la ART y el seguro de vida.");
  const values = { studio_id: s.studioId, organization_id: s.organizationId, employer_kind: i.employerKind === "grande" ? "grande" : "general", art_pct: String(i.artPct), art_fixed: String(i.artFixed), life_insurance: String(i.lifeInsurance), own_categories: parseCategories(i.ownCategories), pay_place: i.payPlace?.trim().slice(0, 120) || null, last_deposit: i.lastDeposit?.trim().slice(0, 160) || null, updated_by: actor.id };
  await db().insert(payroll_settings).values(values).onConflictDoUpdate({ target: payroll_settings.organization_id, set: values });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.parametros", entityType: "organizacion", entityId: s.organizationId, metadata: { empleador: values.employer_kind, art: i.artPct, categorias_propias: values.own_categories.length } });
}

/** Datos de liquidación del legajo (convenio, categoría, básico pactado, jornada, afiliación, CBU) */
export async function saveEmployeePayroll(s: PayrollScope, actor: Actor, employeeId: string, i: { cctKey: string; category: string; basicOverride: number | null; hours: number | null; affiliated: boolean; cbu: string | null; legajo: string | null }) {
  manage(s);
  if (!UUID.test(employeeId)) throw new LiquidacionError("Empleado inválido.");
  const cct = cctOf(i.cctKey);
  if (!cct) throw new LiquidacionError("Elegí el convenio (o «Fuera de convenio»).");
  const cbu = i.cbu?.replace(/\D/g, "") || null;
  if (cbu && cbu.length !== 22) throw new LiquidacionError("El CBU tiene 22 números.");
  if (i.basicOverride != null && !(i.basicOverride > 0)) throw new LiquidacionError("El básico pactado tiene que ser mayor a cero.");
  if (i.hours != null && !(i.hours > 0 && i.hours <= 300)) throw new LiquidacionError("Revisá las horas mensuales.");
  const [r] = await db()
    .update(employees)
    .set({ cct_key: cct.key, category: i.category.trim().toUpperCase().slice(0, 12) || null, basic_override: i.basicOverride == null ? null : String(i.basicOverride), hours: i.hours, affiliated: i.affiliated, cbu, legajo: i.legajo?.trim().slice(0, 10) || null })
    .where(and(eq(employees.id, employeeId), eq(employees.studio_id, s.studioId), eq(employees.organization_id, s.organizationId)))
    .returning({ id: employees.id });
  if (!r) throw new LiquidacionError("No encontramos ese empleado.");
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.legajo", entityType: "empleado", entityId: employeeId, metadata: { convenio: cct.key, categoria: i.category, cbu: cbu ? "cargado" : null } });
}

/** Faro Manager: nueva versión de una escala (o corrección de la misma vigencia), auditada y con aviso */
export async function saveScale(actor: Actor, i: { cctKey: string; validFrom: string; status: string; source: string; categories: string; notify: boolean }) {
  const cct = CCTS.find((c) => c.key === i.cctKey);
  if (!cct) throw new LiquidacionError("Ese convenio no existe.");
  if (!isDate(i.validFrom)) throw new LiquidacionError("Elegí desde cuándo rige.");
  if (!i.source.trim()) throw new LiquidacionError("Citá la fuente (acta, resolución o publicación del sindicato).");
  const categories = parseCategories(i.categories);
  if (!categories.length) throw new LiquidacionError("Cargá al menos una categoría.");
  const values = { cct_key: cct.key, valid_from: i.validFrom, status: i.status === "validada" ? "validada" : "a_validar", source: i.source.trim().slice(0, 400), categories, updated_by: actor.id };
  await db().insert(cct_scales).values(values).onConflictDoUpdate({ target: [cct_scales.cct_key, cct_scales.valid_from], set: values });
  await audit({ studioId: null, actor, action: "faro.escala_cct", entityType: "convenio", entityId: cct.key, metadata: { desde: i.validFrom, estado: values.status, categorias: categories.length } });
  let notified = 0;
  if (i.notify) {
    const rows = await db()
      .selectDistinct({ id: users.id })
      .from(employees)
      .innerJoin(users, and(eq(users.studioId, employees.studio_id), inArray(users.role, ["dueno", "contador"]), eq(users.active, true)))
      .where(and(eq(employees.cct_key, cct.key), eq(employees.active, true)));
    await notify(rows.map((r) => r.id), { kind: "fiscal", title: `Nueva escala de ${cct.name}`, body: `Rige desde el ${i.validFrom.split("-").reverse().join("/")}. Las liquidaciones nuevas la usan; re-liquidá los borradores del período.`, href: "/ayuda/empleados/liquidacion-de-sueldos" });
    notified = rows.length;
  }
  return { notified };
}

// ───────────── Novedades ─────────────

const KINDS = Object.keys(NOVELTY_LABEL) as NoveltyKind[];

async function ownEmployee(s: PayrollScope, id: string) {
  if (!UUID.test(id)) throw new LiquidacionError("Empleado inválido.");
  const [e] = await db().select().from(employees).where(and(eq(employees.id, id), eq(employees.studio_id, s.studioId), eq(employees.organization_id, s.organizationId)));
  if (!e) throw new LiquidacionError("Ese empleado no es de la organización.");
  return e;
}

export async function listNovelties(s: PayrollScope, period: string) {
  if (!isPeriod(period)) return [];
  return db()
    .select({ n: payroll_novelties, first: employees.first_name, last: employees.last_name })
    .from(payroll_novelties)
    .innerJoin(employees, eq(employees.id, payroll_novelties.employee_id))
    .where(and(eq(payroll_novelties.studio_id, s.studioId), eq(payroll_novelties.organization_id, s.organizationId), eq(payroll_novelties.period, period)))
    .orderBy(asc(employees.last_name), asc(payroll_novelties.created_at));
}

function cleanNovelty(i: { kind: string; quantity: number | null; amount: number | null; detail: string | null }) {
  if (!KINDS.includes(i.kind as NoveltyKind)) throw new LiquidacionError("Elegí el tipo de novedad.");
  const kind = i.kind as NoveltyKind;
  const byQty = ["horas", "horas_extra_50", "horas_extra_100", "ausencia", "licencia", "vacaciones"].includes(kind);
  if (byQty && !(Number(i.quantity) > 0 && Number(i.quantity) <= 400)) throw new LiquidacionError(`${NOVELTY_LABEL[kind]}: cargá la cantidad.`);
  if (!byQty && !(Number(i.amount) > 0)) throw new LiquidacionError(`${NOVELTY_LABEL[kind]}: cargá el importe.`);
  return { kind, quantity: byQty ? String(i.quantity) : null, amount: byQty ? null : String(i.amount), detail: i.detail?.trim().slice(0, 160) || null };
}

export async function addNovelty(s: PayrollScope, actor: Actor, i: { employeeId: string; period: string; kind: string; quantity: number | null; amount: number | null; detail: string | null }, source: "manual" | "agente" = "manual") {
  manage(s);
  if (!isPeriod(i.period)) throw new LiquidacionError("Elegí el período.");
  const e = await ownEmployee(s, i.employeeId);
  const v = cleanNovelty(i);
  const [r] = await db().insert(payroll_novelties).values({ studio_id: s.studioId, organization_id: s.organizationId, employee_id: e.id, period: i.period, ...v, source, created_by: actor.id }).returning({ id: payroll_novelties.id });
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.novedad", entityType: "empleado", entityId: e.id, metadata: { periodo: i.period, tipo: v.kind, origen: source } });
  return r.id;
}

export async function deleteNovelty(s: PayrollScope, actor: Actor, id: string) {
  manage(s);
  if (!UUID.test(id)) throw new LiquidacionError("Novedad inválida.");
  const [r] = await db().delete(payroll_novelties).where(and(eq(payroll_novelties.id, id), eq(payroll_novelties.studio_id, s.studioId), eq(payroll_novelties.organization_id, s.organizationId))).returning({ id: payroll_novelties.id, period: payroll_novelties.period });
  if (!r) throw new LiquidacionError("No encontramos esa novedad.");
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.novedad_borrada", entityType: "novedad", entityId: r.id, metadata: { periodo: r.period } });
}

const KIND_ALIASES: Record<string, NoveltyKind> = {
  horas: "horas", "horas trabajadas": "horas", "horas extra": "horas_extra_50", "horas extra 50": "horas_extra_50", "he50": "horas_extra_50", "horas extra 100": "horas_extra_100", "he100": "horas_extra_100",
  ausencia: "ausencia", ausencias: "ausencia", falta: "ausencia", faltas: "ausencia", licencia: "licencia", licencias: "licencia", vacaciones: "vacaciones",
  adelanto: "adelanto", adelantos: "adelanto", anticipo: "adelanto", embargo: "embargo", embargos: "embargo", ganancias: "ganancias",
  "concepto remunerativo": "concepto_rem", "concepto no remunerativo": "concepto_norem", descuento: "descuento",
};
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_%]/g, " ").replace(/\s+/g, " ").trim();
const toNum = (v: unknown) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const t = String(v).trim().replace(/\$/g, "");
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Importación masiva (Excel o CSV): CUIL, concepto, cantidad, importe, detalle. Devuelve lo cargado y los errores por fila */
export async function importNovelties(s: PayrollScope, actor: Actor, period: string, file: File) {
  manage(s);
  if (!isPeriod(period)) throw new LiquidacionError("Elegí el período.");
  const name = file.name.toLowerCase();
  let table: unknown[][];
  if (name.endsWith(".xlsx")) table = (await readSheet(Buffer.from(await file.arrayBuffer()))) as unknown[][];
  else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    const text = await file.text();
    const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) >= (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    table = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "")));
  } else throw new LiquidacionError("Subí un archivo .xlsx o .csv.");
  const [head, ...rows] = table;
  if (!head) throw new LiquidacionError("El archivo está vacío.");
  const h = head.map(norm);
  const col = (...names: string[]) => h.findIndex((x) => names.includes(x));
  const ci = { cuil: col("cuil", "cuit"), kind: col("concepto", "novedad", "tipo"), qty: col("cantidad", "dias", "horas"), amount: col("importe", "monto"), detail: col("detalle", "observaciones", "descripcion") };
  if (ci.cuil < 0 || ci.kind < 0) throw new LiquidacionError("El encabezado tiene que tener CUIL y concepto (y cantidad o importe).");
  const staff = await db().select({ id: employees.id, cuil: employees.cuil }).from(employees).where(and(eq(employees.studio_id, s.studioId), eq(employees.organization_id, s.organizationId)));
  const byCuil = new Map(staff.filter((e) => e.cuil).map((e) => [e.cuil!, e.id]));
  const errors: { row: number; error: string }[] = [];
  const values: (typeof payroll_novelties.$inferInsert)[] = [];
  rows.forEach((r, idx) => {
    if (!r || r.every((c) => c == null || String(c).trim() === "")) return;
    const cuil = String(r[ci.cuil] ?? "").replace(/\D/g, "");
    const emp = byCuil.get(cuil);
    const kind = KIND_ALIASES[norm(r[ci.kind])] ?? (KINDS.includes(norm(r[ci.kind]).replace(/ /g, "_") as NoveltyKind) ? (norm(r[ci.kind]).replace(/ /g, "_") as NoveltyKind) : null);
    if (!emp) return errors.push({ row: idx + 2, error: `CUIL ${cuil || "vacío"} no está en el legajo` });
    if (!kind) return errors.push({ row: idx + 2, error: `Concepto «${String(r[ci.kind] ?? "")}» desconocido` });
    try {
      const v = cleanNovelty({ kind, quantity: ci.qty >= 0 ? toNum(r[ci.qty]) : null, amount: ci.amount >= 0 ? toNum(r[ci.amount]) : null, detail: ci.detail >= 0 ? String(r[ci.detail] ?? "") : null });
      values.push({ studio_id: s.studioId, organization_id: s.organizationId, employee_id: emp, period, ...v, source: "importacion", created_by: actor.id });
    } catch (e) {
      errors.push({ row: idx + 2, error: (e as Error).message });
    }
  });
  if (values.length) await db().insert(payroll_novelties).values(values);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.novedades_importadas", entityType: "organizacion", entityId: s.organizationId, metadata: { periodo: period, cargadas: values.length, errores: errors.length, archivo: file.name.slice(0, 80) } });
  return { loaded: values.length, errors };
}

/** Trae las novedades que la organización informó en el portal (F5): horas extra y licencias del período */
export async function pullPortalNovelties(s: PayrollScope, actor: Actor, period: string) {
  manage(s);
  if (!isPeriod(period)) throw new LiquidacionError("Elegí el período.");
  const evs = await db()
    .select()
    .from(employee_events)
    .where(and(eq(employee_events.studio_id, s.studioId), eq(employee_events.organization_id, s.organizationId), inArray(employee_events.kind, ["horas_extra", "licencia"]), gte(employee_events.date, `${period}-01`), lte(employee_events.date, lastDay(period))));
  let n = 0;
  for (const ev of evs) {
    const q = Number(/(\d+(?:[.,]\d+)?)/.exec(ev.detail)?.[1]?.replace(",", ".") ?? NaN);
    if (!(q > 0)) continue;
    const kind: NoveltyKind = ev.kind === "horas_extra" ? (/100/.test(ev.detail) ? "horas_extra_100" : "horas_extra_50") : "licencia";
    const r = await db().insert(payroll_novelties).values({ studio_id: s.studioId, organization_id: s.organizationId, employee_id: ev.employee_id, period, kind, quantity: String(q), detail: ev.detail.slice(0, 160), source: "portal", ref: ev.id, created_by: actor.id }).onConflictDoNothing().returning({ id: payroll_novelties.id });
    n += r.length;
  }
  if (n) await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.novedades_portal", entityType: "organizacion", entityId: s.organizationId, metadata: { periodo: period, novedades: n } });
  return n;
}

// ───────────── Liquidar ─────────────

function employeeOf(e: typeof employees.$inferSelect): Employee {
  return { id: e.id, name: `${e.last_name}, ${e.first_name}`.replace(/^, /, ""), cuil: e.cuil, startDate: e.start_date, endDate: e.end_date, area: e.area, cctKey: e.cct_key, category: e.category, basicOverride: e.basic_override == null ? null : Number(e.basic_override), hours: e.hours, affiliated: e.affiliated, cbu: e.cbu };
}

/** Remuneraciones de las liquidaciones vigentes (aprobadas o publicadas) del semestre, por empleado */
async function semesterRemunerations(s: PayrollScope, period: string) {
  const y = period.slice(0, 4);
  const first = Number(period.slice(5)) <= 6 ? `${y}-01` : `${y}-07`;
  const rows = await db()
    .select({ emp: payroll_items.employee_id, rem: payroll_items.rem, period: payroll_runs.period })
    .from(payroll_items)
    .innerJoin(payroll_runs, eq(payroll_runs.id, payroll_items.run_id))
    .where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), eq(payroll_runs.kind, "mensual"), inArray(payroll_runs.status, ["aprobada", "publicada"]), gte(payroll_runs.period, first), lte(payroll_runs.period, period)));
  const map = new Map<string, number[]>();
  for (const r of rows) map.set(r.emp, [...(map.get(r.emp) ?? []), Number(r.rem)]);
  return map;
}

interface RunInput {
  period: string;
  kind: RunKind;
  payDate?: string | null;
  final?: { employeeId: string; endDate: string; reason: string; vacationsTaken?: number; noticeGiven?: boolean } | null;
}

async function compute(s: PayrollScope, i: RunInput) {
  const settings = await settingsOf(s);
  const versions = await scaleVersions();
  const date = i.kind === "final" && i.final ? i.final.endDate : lastDay(i.period);
  const params = paramsAt(date);
  const novelties: Novelty[] = (await listNovelties(s, i.period)).map(({ n }) => ({ employeeId: n.employee_id, kind: n.kind as NoveltyKind, quantity: n.quantity == null ? null : Number(n.quantity), amount: n.amount == null ? null : Number(n.amount), detail: n.detail }));
  const staffRows = await db().select().from(employees).where(and(eq(employees.studio_id, s.studioId), eq(employees.organization_id, s.organizationId)));
  const first = `${i.period}-01`;
  let staff = staffRows.filter((e) => (!e.start_date || e.start_date <= lastDay(i.period)) && (!e.end_date || e.end_date >= first) && (e.active || (e.end_date && e.end_date >= first)));
  if (i.kind === "final") {
    if (!i.final || !UUID.test(i.final.employeeId) || !isDate(i.final.endDate) || !(i.final.reason in END_REASON)) throw new LiquidacionError("Elegí el empleado, la fecha de egreso y el motivo.");
    staff = staffRows.filter((e) => e.id === i.final!.employeeId);
    if (!staff.length) throw new LiquidacionError("Ese empleado no es de la organización.");
  }
  if (i.kind === "vacaciones") staff = staff.filter((e) => novelties.some((n) => n.employeeId === e.id && n.kind === "vacaciones"));
  if (!staff.length) throw new LiquidacionError(i.kind === "vacaciones" ? "Nadie tiene días de vacaciones cargados como novedad en el período." : "No hay empleados para liquidar en el período.");
  const vacationsPaid = i.kind === "mensual" ? await vacationRunExists(s, i.period) : false;
  const sem = i.kind === "sac" || i.kind === "final" ? await semesterRemunerations(s, i.period) : new Map<string, number[]>();
  const scalesUsed: Record<string, { validFrom: string; status: string; source: string }> = {};
  const items = staff.map((row) => {
    const e = employeeOf(row);
    const cct = cctOf(e.cctKey);
    const scale = cct && cct.key !== OWN_CCT.key ? scaleAt(cct, date, versions) : null;
    if (cct && scale) scalesUsed[cct.key] = { validFrom: scale.validFrom, status: scale.status, source: scale.source };
    const categories = scale?.categories ?? [];
    let r: Result;
    if (i.kind === "sac") r = liquidarSac({ period: i.period, employee: e, remunerations: sem.get(e.id) ?? [], org: settings, params });
    else if (i.kind === "vacaciones") r = liquidarVacaciones({ period: i.period, employee: e, categories, novelties, org: settings, params });
    else if (i.kind === "final") {
      const rems = sem.get(e.id) ?? [];
      r = liquidarFinal({ endDate: i.final!.endDate, reason: i.final!.reason as EndReason, employee: e, categories, novelties, org: settings, params, remunerations: rems, bestMonthly: Math.max(0, ...rems), vacationsTaken: Number(i.final!.vacationsTaken) || 0, noticeGiven: !!i.final!.noticeGiven });
    } else r = liquidarMensual({ period: i.period, employee: e, categories, novelties, org: settings, params, vacationsPaid });
    if (scale?.status === "a_validar") r.warnings.push(`La escala de ${cct!.name} está a validar: revisá los básicos con el acta vigente.`);
    if (params.status === "a_validar") r.warnings.push("Topes y alícuotas de seguridad social de referencia (a validar).");
    const category = categories.find((c) => c.code === e.category) ?? settings.ownCategories.find((c) => c.code === e.category);
    return { e, row, r, snapshot: { name: e.name, cuil: e.cuil, legajo: row.legajo, startDate: e.startDate, area: e.area, cct: cct ? `${cct.name} (${cct.number})` : "—", cctKey: e.cctKey, category: category ? `${category.code} · ${category.name}` : (e.category ?? "—"), cbu: e.cbu, affiliated: e.affiliated } };
  });
  return { items, basis: { escalas: scalesUsed, parametros: { desde: params.validFrom, estado: params.status, fuente: params.source } } };
}

async function vacationRunExists(s: PayrollScope, period: string) {
  const [r] = await db().select({ id: payroll_runs.id }).from(payroll_runs).where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), eq(payroll_runs.period, period), eq(payroll_runs.kind, "vacaciones"), inArray(payroll_runs.status, ["aprobada", "publicada"])));
  return !!r;
}

const totalsOf = (items: { r: Result }[]) => ({ employees: items.length, rem: items.reduce((a, x) => a + x.r.rem, 0), norem: items.reduce((a, x) => a + x.r.norem, 0), desc: items.reduce((a, x) => a + x.r.desc, 0), net: items.reduce((a, x) => a + x.r.net, 0), contrib: items.reduce((a, x) => a + x.r.contrib, 0), cost: items.reduce((a, x) => a + x.r.cost, 0) });

async function writeItems(s: PayrollScope, runId: string, items: Awaited<ReturnType<typeof compute>>["items"]) {
  await db().delete(payroll_items).where(eq(payroll_items.run_id, runId));
  if (items.length)
    await db().insert(payroll_items).values(items.map(({ e, r, snapshot }) => ({ run_id: runId, studio_id: s.studioId, organization_id: s.organizationId, employee_id: e.id, snapshot, lines: r.lines, rem: r.rem, norem: r.norem, desc: r.desc, net: r.net, contrib: r.contrib, cost: r.cost, bases: r.bases, warnings: r.warnings })));
}

/** Conceptos que se recalculan solos (aportes y contribuciones): no se listan en el registro */
const DERIVED = new Set(["jubilacion", "pami", "obra_social", "sindicato", "solidario", "contrib_ss", "contrib_os", "contrib_sindical", "fondo_cese", "art", "seguro_vida"]);

/** Cambios por empleado entre dos cálculos (para el registro de la re-liquidación) */
function diff(before: { employee_id: string; net: number; lines: { code: string; name: string; amount: number }[]; snapshot: Record<string, unknown> }[], after: { e: Employee; r: Result }[], actor: Actor, reason: string | null): PayrollChange[] {
  const at = new Date().toISOString();
  const out: PayrollChange[] = [];
  for (const a of after) {
    const b = before.find((x) => x.employee_id === a.e.id);
    if (!b) {
      out.push({ at, actor: actor.name ?? actor.email, reason, employee: a.e.name, before: null, after: a.r.net, detail: "Se agregó a la liquidación" });
      continue;
    }
    if (Number(b.net) === a.r.net) continue;
    const changed = a.r.lines
      .filter((l) => !DERIVED.has(l.code) && (b.lines.find((x) => x.code === l.code && x.name === l.name)?.amount ?? 0) !== l.amount)
      .map((l) => l.name)
      .concat(b.lines.filter((x) => !a.r.lines.some((l) => l.code === x.code && l.name === x.name)).map((x) => `${x.name} (se quitó)`));
    out.push({ at, actor: actor.name ?? actor.email, reason, employee: a.e.name, before: Number(b.net), after: a.r.net, detail: changed.length ? `Cambió: ${[...new Set(changed)].slice(0, 6).join(", ")}` : "Cambió el neto" });
  }
  for (const b of before.filter((x) => !after.some((a) => a.e.id === x.employee_id))) out.push({ at, actor: actor.name ?? actor.email, reason, employee: String(b.snapshot.name ?? ""), before: Number(b.net), after: null, detail: "Se quitó de la liquidación" });
  return out;
}

/** Liquida el período: deja un borrador para revisar y aprobar */
export async function liquidate(s: PayrollScope, actor: Actor, i: RunInput, origin: "manual" | "agente" = "manual") {
  manage(s);
  await requirePayroll(s);
  if (!isPeriod(i.period)) throw new LiquidacionError("Elegí el período.");
  if (!(i.kind in RUN_KIND)) throw new LiquidacionError("Elegí el tipo de liquidación.");
  if (i.kind === "sac" && !["06", "12"].includes(i.period.slice(5))) throw new LiquidacionError("El SAC se liquida en junio o en diciembre (el proporcional va en la liquidación final).");
  const open = await db()
    .select({ id: payroll_runs.id, status: payroll_runs.status, final: payroll_runs.final_info })
    .from(payroll_runs)
    .where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), eq(payroll_runs.period, i.period), eq(payroll_runs.kind, i.kind), inArray(payroll_runs.status, ["borrador", "aprobada", "publicada"])));
  const clash = open.filter((r) => i.kind !== "final" || r.final?.employeeId === i.final?.employeeId);
  if (clash.some((r) => r.status === "borrador")) throw new LiquidacionError("Ya hay un borrador de este período: re-liquidalo.");
  if (clash.length) throw new LiquidacionError("Este período ya está liquidado: duplicalo para re-liquidar con un registro de cambios.");
  const { items, basis } = await compute(s, i);
  const payDate = isDate(i.payDate) ? i.payDate! : i.kind === "final" ? i.final!.endDate : lastDay(i.period);
  const [run] = await db()
    .insert(payroll_runs)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, period: i.period, kind: i.kind, pay_date: payDate, final_info: i.kind === "final" ? { employeeId: i.final!.employeeId, endDate: i.final!.endDate, reason: i.final!.reason, vacationsTaken: Number(i.final!.vacationsTaken) || 0, noticeGiven: !!i.final!.noticeGiven } : null, basis, totals: totalsOf(items), warnings: items.reduce((a, x) => a + x.r.warnings.length, 0), origin, created_by: actor.id })
    .returning();
  await writeItems(s, run.id, items);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.liquidar", entityType: "liquidacion", entityId: run.id, metadata: { periodo: i.period, tipo: i.kind, empleados: items.length, neto: run.totals.net / 100, origen: origin } });
  return run;
}

async function ownRun(s: PayrollScope, id: string) {
  if (!UUID.test(id)) throw new LiquidacionError("Liquidación inválida.");
  const [r] = await db().select().from(payroll_runs).where(and(eq(payroll_runs.id, id), eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId)));
  if (!r) throw new LiquidacionError("No encontramos esa liquidación.");
  return r;
}

const runInput = (r: Run): RunInput => ({ period: r.period, kind: r.kind as RunKind, payDate: r.pay_date, final: r.final_info });

/** Re-liquida un borrador con el legajo, las novedades y las escalas de hoy; registra qué cambió */
export async function reliquidate(s: PayrollScope, actor: Actor, id: string, reason: string | null = null) {
  manage(s);
  const run = await ownRun(s, id);
  if (run.status !== "borrador") throw new LiquidacionError("Solo se re-liquida un borrador: duplicá la liquidación aprobada.");
  const before = await db().select().from(payroll_items).where(eq(payroll_items.run_id, run.id));
  const { items, basis } = await compute(s, runInput(run));
  const changes = diff(before, items, actor, reason?.trim().slice(0, 200) || null);
  await writeItems(s, run.id, items);
  await db().update(payroll_runs).set({ basis, totals: totalsOf(items), warnings: items.reduce((a, x) => a + x.r.warnings.length, 0), changes: [...run.changes, ...changes].slice(-300) }).where(eq(payroll_runs.id, run.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.reliquidar", entityType: "liquidacion", entityId: run.id, metadata: { cambios: changes.length, motivo: reason ?? null } });
  return changes;
}

/** Duplica una liquidación aprobada o publicada en una versión nueva (borrador) y la re-liquida; al aprobarla, reemplaza a la anterior */
export async function duplicate(s: PayrollScope, actor: Actor, id: string, reason: string) {
  manage(s);
  const run = await ownRun(s, id);
  if (!["aprobada", "publicada"].includes(run.status)) throw new LiquidacionError("Se duplica una liquidación aprobada o publicada.");
  if (!reason.trim()) throw new LiquidacionError("Contá por qué se re-liquida (queda en el registro de cambios).");
  const [draft] = await db().select({ id: payroll_runs.id }).from(payroll_runs).where(and(eq(payroll_runs.parent_id, run.id), eq(payroll_runs.status, "borrador")));
  if (draft) throw new LiquidacionError("Ya hay una versión nueva en borrador de esta liquidación.");
  const before = await db().select().from(payroll_items).where(eq(payroll_items.run_id, run.id));
  const { items, basis } = await compute(s, runInput(run));
  const changes = diff(before, items, actor, reason.trim().slice(0, 200));
  const [nv] = await db()
    .insert(payroll_runs)
    .values({ studio_id: s.studioId, organization_id: s.organizationId, period: run.period, kind: run.kind, version: run.version + 1, parent_id: run.id, pay_date: run.pay_date, final_info: run.final_info, basis, totals: totalsOf(items), warnings: items.reduce((a, x) => a + x.r.warnings.length, 0), changes, origin: "manual", created_by: actor.id })
    .returning();
  await writeItems(s, nv.id, items);
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.duplicar", entityType: "liquidacion", entityId: nv.id, metadata: { de: run.id, version: nv.version, cambios: changes.length, motivo: reason.trim().slice(0, 200) } });
  return nv;
}

/** Aprobación de una persona (nunca del Agente): la deja lista para publicar recibos y exportar */
export async function approve(s: PayrollScope, actor: Actor, id: string) {
  manage(s);
  const run = await ownRun(s, id);
  if (run.status !== "borrador") throw new LiquidacionError("Esa liquidación ya no está en borrador.");
  const [r] = await db().update(payroll_runs).set({ status: "aprobada", approved_by: actor.id, approved_at: new Date() }).where(and(eq(payroll_runs.id, run.id), eq(payroll_runs.status, "borrador"))).returning();
  if (!r) throw new LiquidacionError("Esa liquidación ya no está en borrador.");
  if (run.parent_id) await db().update(payroll_runs).set({ status: "reemplazada" }).where(and(eq(payroll_runs.id, run.parent_id), eq(payroll_runs.organization_id, s.organizationId)));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.aprobar", entityType: "liquidacion", entityId: run.id, metadata: { periodo: run.period, tipo: run.kind, version: run.version, neto: run.totals.net / 100 } });
  return r;
}

export async function annul(s: PayrollScope, actor: Actor, id: string) {
  manage(s);
  const run = await ownRun(s, id);
  if (run.status === "publicada") throw new LiquidacionError("Los recibos ya se publicaron: duplicala para corregir.");
  if (!["borrador", "aprobada"].includes(run.status)) throw new LiquidacionError("Esa liquidación ya no se puede anular.");
  await db().update(payroll_runs).set({ status: "anulada" }).where(eq(payroll_runs.id, run.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.anular", entityType: "liquidacion", entityId: run.id, metadata: { periodo: run.period, tipo: run.kind } });
}

async function employer(s: PayrollScope) {
  const [org] = await db().select({ name: organizations.name }).from(organizations).where(and(eq(organizations.id, s.organizationId), eq(organizations.studio_id, s.studioId)));
  const [le] = await db().select({ cuit: legal_entities.cuit, name: legal_entities.business_name, address: legal_entities.tax_address }).from(legal_entities).where(and(eq(legal_entities.organization_id, s.organizationId), eq(legal_entities.studio_id, s.studioId))).limit(1);
  return { name: le?.name ?? org?.name ?? "", cuit: (le?.cuit ?? "").replace(/\D/g, ""), address: le?.address ?? null };
}

async function receiptFor(s: PayrollScope, run: Run, item: typeof payroll_items.$inferSelect, draft: boolean) {
  const [emp, settings] = await Promise.all([employer(s), settingsOf(s)]);
  const sn = item.snapshot as Record<string, string | null>;
  return receiptPdf({
    employer: { name: emp.name, cuit: emp.cuit, address: emp.address },
    employee: { name: String(sn.name ?? ""), cuil: String(sn.cuil ?? "—"), legajo: String(sn.legajo ?? "—"), startDate: sn.startDate ?? null, category: String(sn.category ?? "—"), cct: String(sn.cct ?? "—"), area: sn.area ?? null },
    period: run.period,
    kindLabel: RUN_KIND[run.kind as RunKind] ?? run.kind,
    payDate: run.pay_date,
    payPlace: settings.payPlace ?? "—",
    lastDeposit: settings.lastDeposit,
    lines: item.lines as Result["lines"],
    rem: Number(item.rem),
    norem: Number(item.norem),
    desc: Number(item.desc),
    net: Number(item.net),
    draft,
  });
}

/** PDF de un recibo (borrador marcado si la liquidación no está aprobada) */
export async function receiptOf(s: PayrollScope, itemId: string) {
  if (!UUID.test(itemId)) return null;
  const [it] = await db().select().from(payroll_items).where(and(eq(payroll_items.id, itemId), eq(payroll_items.studio_id, s.studioId), eq(payroll_items.organization_id, s.organizationId)));
  if (!it) return null;
  const run = await ownRun(s, it.run_id);
  return { pdf: await receiptFor(s, run, it, run.status === "borrador"), name: `recibo-${run.period}-${String((it.snapshot as Record<string, string>).cuil ?? "")}.pdf` };
}

/**
 * Publica los recibos de una liquidación aprobada: arma el PDF de cada
 * empleado, lo deja como lote de recibos (reemplaza la carga manual de F5,
 * que sigue disponible) y lo publica para la firma conforme / no conforme.
 */
export async function publish(s: PayrollScope, actor: Actor, id: string) {
  manage(s);
  const run = await ownRun(s, id);
  if (run.status !== "aprobada") throw new LiquidacionError("Primero aprobá la liquidación.");
  const items = await db().select().from(payroll_items).where(eq(payroll_items.run_id, run.id));
  const [batch] = await db().insert(payslip_batches).values({ studio_id: s.studioId, organization_id: s.organizationId, period: run.period, mode: "liquidacion", file_name: `${RUN_KIND[run.kind as RunKind] ?? run.kind} ${run.period}${run.version > 1 ? ` (versión ${run.version})` : ""}`.slice(0, 160), created_by: actor.id }).returning();
  for (const it of items) {
    const bytes = await receiptFor(s, run, it, false);
    const name = `recibo-${run.period}-${String((it.snapshot as Record<string, string>).cuil ?? it.employee_id)}.pdf`;
    const st = await storeUpload(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }), s.studioId, s.organizationId);
    await db().insert(payslips).values({ batch_id: batch.id, studio_id: s.studioId, organization_id: s.organizationId, employee_id: it.employee_id, cuil: (it.snapshot as Record<string, string | null>).cuil ?? null, period: run.period, file_name: name, storage_path: st.storagePath, size_bytes: st.sizeBytes, sha256: createHash("sha256").update(bytes).digest("hex"), match: "auto", status: "asignado" });
  }
  const n = await publishBatch(s, actor, batch.id);
  await db().update(payroll_runs).set({ status: "publicada", batch_id: batch.id }).where(eq(payroll_runs.id, run.id));
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.publicar", entityType: "liquidacion", entityId: run.id, metadata: { recibos: n, lote: batch.id } });
  return { published: n, batchId: batch.id };
}

// ───────────── Ver, exportar e informes ─────────────

export async function listRuns(s: PayrollScope) {
  return db().select().from(payroll_runs).where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId))).orderBy(desc(payroll_runs.period), desc(payroll_runs.created_at)).limit(60);
}

export async function runView(s: PayrollScope, id: string) {
  if (!UUID.test(id)) return null;
  const [run] = await db().select().from(payroll_runs).where(and(eq(payroll_runs.id, id), eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId)));
  if (!run) return null;
  const items = await db().select().from(payroll_items).where(eq(payroll_items.run_id, run.id)).orderBy(asc(sql`${payroll_items.snapshot}->>'name'`));
  return { run, items };
}

/** Informes de la liquidación: costo laboral por empleado y por área, cargas sociales, acreditaciones, nómina y variaciones */
export async function reports(s: PayrollScope, id: string) {
  const v = await runView(s, id);
  if (!v) return null;
  const { run, items } = v;
  const [prevRun] = await db()
    .select({ id: payroll_runs.id })
    .from(payroll_runs)
    .where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), eq(payroll_runs.kind, "mensual"), inArray(payroll_runs.status, ["aprobada", "publicada"]), sql`${payroll_runs.period} < ${run.period}`, ne(payroll_runs.id, run.id)))
    .orderBy(desc(payroll_runs.period))
    .limit(1);
  const prev = prevRun ? await db().select({ employeeId: payroll_items.employee_id, net: payroll_items.net, cost: payroll_items.cost }).from(payroll_items).where(eq(payroll_items.run_id, prevRun.id)) : [];
  const name = (x: typeof items[number]) => String((x.snapshot as Record<string, unknown>).name ?? "");
  const byArea = new Map<string, { area: string; employees: number; cost: number; net: number }>();
  for (const x of items) {
    const area = String((x.snapshot as Record<string, unknown>).area ?? "") || "Sin área";
    const a = byArea.get(area) ?? { area, employees: 0, cost: 0, net: 0 };
    a.employees++;
    a.cost += Number(x.cost);
    a.net += Number(x.net);
    byArea.set(area, a);
  }
  const sumCode = (codes: string[]) => items.reduce((a, x) => a + (x.lines as Result["lines"]).filter((l) => codes.includes(l.code)).reduce((b, l) => b + l.amount, 0), 0);
  return {
    run,
    byEmployee: items.map((x) => ({ id: x.id, employeeId: x.employee_id, name: name(x), area: String((x.snapshot as Record<string, unknown>).area ?? "") || "Sin área", rem: Number(x.rem), norem: Number(x.norem), net: Number(x.net), contrib: Number(x.contrib), cost: Number(x.cost) })).sort((a, b) => b.cost - a.cost),
    byArea: [...byArea.values()].sort((a, b) => b.cost - a.cost),
    charges: { aportes: sumCode(["jubilacion", "pami", "obra_social"]), sindicales: sumCode(["sindicato", "solidario"]), contribuciones: sumCode(["contrib_ss", "contrib_os", "contrib_sindical", "fondo_cese"]), art: sumCode(["art"]), seguro: sumCode(["seguro_vida"]) },
    credits: bankFiles(exportItems(items)),
    variations: variations(items.map((x) => ({ employeeId: x.employee_id, name: name(x), net: Number(x.net), cost: Number(x.cost) })), prev.map((p) => ({ employeeId: p.employeeId, net: Number(p.net), cost: Number(p.cost) }))),
    payroll: items.map((x) => x.snapshot as Record<string, unknown>),
  };
}

function exportItems(items: (typeof payroll_items.$inferSelect)[]): ExportItem[] {
  return items.map((x) => {
    const sn = x.snapshot as Record<string, string | null | boolean>;
    const days = (x.lines as Result["lines"]).find((l) => l.code === "basico")?.quantity ?? 30;
    return { cuil: String(sn.cuil ?? ""), name: String(sn.name ?? ""), legajo: String(sn.legajo ?? ""), cbu: (sn.cbu as string | null) ?? null, area: (sn.area as string | null) ?? null, lines: x.lines as Result["lines"], rem: Number(x.rem), norem: Number(x.norem), net: Number(x.net), baseAportes: x.bases.aportes, baseContrib: x.bases.contribuciones, daysWorked: Math.min(31, Math.round(Number(days))), convencionado: sn.cctKey !== "fuera_convenio" };
  });
}

/** Archivos de la liquidación aprobada: LSD, F.931 y acreditación bancaria */
export async function exportRun(s: PayrollScope, actor: Actor, id: string, format: "lsd" | "f931" | "banco_csv" | "banco_txt") {
  const v = await runView(s, id);
  if (!v) throw new LiquidacionError("No encontramos esa liquidación.");
  if (!["aprobada", "publicada"].includes(v.run.status)) throw new LiquidacionError("Se exporta una liquidación aprobada.");
  const items = exportItems(v.items);
  const emp = await employer(s);
  const base = `${v.run.period}-${v.run.kind}${v.run.version > 1 ? `-v${v.run.version}` : ""}`;
  let out: { body: string; name: string; type: string };
  if (format === "lsd") out = { body: lsdFile({ cuit: emp.cuit, period: v.run.period, kind: v.run.kind as RunKind, number: v.run.version, payDate: v.run.pay_date }, items), name: `lsd-${base}.txt`, type: "text/plain" };
  else if (format === "f931") out = { body: f931File(items), name: `f931-${base}.txt`, type: "text/plain" };
  else {
    const b = bankFiles(items);
    out = format === "banco_csv" ? { body: "﻿" + b.csv, name: `acreditacion-${base}.csv`, type: "text/csv" } : { body: b.txt, name: `acreditacion-${base}.txt`, type: "text/plain" };
  }
  await audit({ studioId: s.studioId, organizationId: s.organizationId, actor, action: "sueldos.exportar", entityType: "liquidacion", entityId: v.run.id, metadata: { formato: format } });
  return out;
}

// ───────────── Agente y Vigía ─────────────

/** «Liquidá octubre de X»: arma (o re-liquida) el borrador del período y marca lo raro; queda para aprobar */
export async function liquidateForAgent(s: PayrollScope, actor: Actor, period: string, kind: RunKind = "mensual") {
  if (!isPeriod(period)) throw new LiquidacionError("Período inválido.");
  const [draft] = await db().select({ id: payroll_runs.id }).from(payroll_runs).where(and(eq(payroll_runs.studio_id, s.studioId), eq(payroll_runs.organization_id, s.organizationId), eq(payroll_runs.period, period), eq(payroll_runs.kind, kind), eq(payroll_runs.status, "borrador")));
  const runId = draft ? (await reliquidate(s, actor, draft.id, "Re-liquidada por el Agente"), draft.id) : (await liquidate(s, actor, { period, kind }, "agente")).id;
  const rep = (await reports(s, runId))!;
  const v = (await runView(s, runId))!;
  const alerts: string[] = [];
  for (const x of rep.variations.filter((y) => y.flag === "sube" || y.flag === "baja")) alerts.push(`${x.name}: el neto ${x.flag} ${Math.round(Math.abs(x.delta ?? 0) * 100)} % contra el mes anterior`);
  for (const it of v.items) for (const w of (it.warnings as string[]).filter((w) => !/a validar|referencia/.test(w))) alerts.push(`${String((it.snapshot as Record<string, unknown>).name)}: ${w}`);
  return { runId, status: v.run.status, employees: v.run.totals.employees, net: v.run.totals.net, cost: v.run.totals.cost, alerts: [...new Set(alerts)].slice(0, 30), scalesToValidate: Object.entries(v.run.basis.escalas ?? {}).filter(([, x]) => (x as { status: string }).status === "a_validar").map(([k]) => cctOf(k)?.name ?? k) };
}

/** Organizaciones del estudio con empleados activos (para el Agente sobre la cartera) */
export async function orgsWithStaff(studioId: string, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows = await db().selectDistinct({ id: employees.organization_id }).from(employees).where(and(eq(employees.studio_id, studioId), inArray(employees.organization_id, ids), eq(employees.active, true)));
  return new Set(rows.map((r) => r.id));
}
