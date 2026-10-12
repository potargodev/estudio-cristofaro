// Motor de liquidación de sueldos (§2.q etapa 6): mensual, SAC, vacaciones y
// final, con aportes del trabajador y contribuciones del empleador. Funciones
// puras en centavos; el servidor les pasa el legajo, la escala vigente, las
// novedades del período y los parámetros legales. Los parámetros de este
// archivo (alícuotas, topes, detracción, SMVM) son de referencia y están «a
// validar»: el Faro Manager los mantiene. Faro calcula y ordena; la
// liquidación la revisa y aprueba una persona.
// Archivo sin "server-only": lo usan las pruebas y las pantallas.

import { cctOf, type Cct, type CctCategory } from "./convenios";

export type LineKind = "rem" | "norem" | "desc" | "contrib";
export interface Line {
  code: string;
  name: string;
  kind: LineKind;
  /** Días, horas o porcentaje, según el concepto */
  quantity: number | null;
  /** En centavos */
  amount: number;
}

export interface Result {
  lines: Line[];
  rem: number;
  norem: number;
  desc: number;
  net: number;
  contrib: number;
  cost: number;
  /** Base de aportes y de contribuciones (con tope y detracción) */
  bases: { aportes: number; contribuciones: number };
  warnings: string[];
}

/** Parámetros legales vigentes a una fecha (de referencia, a validar) */
interface LegalParams {
  validFrom: string;
  status: "a_validar" | "validada";
  source: string;
  retirementPct: number;
  pamiPct: number;
  healthPct: number;
  /** Contribución SIPA + PAMI + FNE + asignaciones (Ley 27.541): general y grandes empresas de servicios o comercio */
  employerPct: { general: number; grande: number };
  employerHealthPct: number;
  /** Base imponible máxima de aportes (tope), en pesos */
  maxBase: number;
  /** Detracción de la base de contribuciones por trabajador (Ley 27.430), en pesos */
  detraccion: number;
  /** Salario mínimo, vital y móvil (embargos), en pesos */
  smvm: number;
}

export const LEGAL_PARAMS: LegalParams[] = [
  {
    validFrom: "2026-10-01",
    status: "a_validar",
    source: "Ley 24.241, Ley 19.032, Ley 23.660, Ley 27.541 y Ley 27.430; tope de la base imponible (movilidad) y SMVM de referencia, sin cotejar con la resolución vigente.",
    retirementPct: 11,
    pamiPct: 3,
    healthPct: 3,
    employerPct: { general: 18, grande: 20.4 },
    employerHealthPct: 6,
    maxBase: 3_600_000,
    detraccion: 7_003.68,
    smvm: 330_000,
  },
];

export const paramsAt = (date: string, list: LegalParams[] = LEGAL_PARAMS) => [...list].sort((a, b) => b.validFrom.localeCompare(a.validFrom)).find((p) => p.validFrom <= date) ?? LEGAL_PARAMS[0];

export interface Employee {
  id: string;
  name: string;
  cuil: string | null;
  startDate: string | null;
  endDate?: string | null;
  area: string | null;
  cctKey: string | null;
  category: string | null;
  /** Básico pactado (fuera de convenio) o sobre el de convenio; en pesos */
  basicOverride: number | null;
  /** Horas mensuales (jornada reducida o jornalizados) */
  hours: number | null;
  affiliated: boolean;
  cbu: string | null;
}

export type NoveltyKind = "horas" | "horas_extra_50" | "horas_extra_100" | "ausencia" | "licencia" | "vacaciones" | "adelanto" | "embargo" | "ganancias" | "concepto_rem" | "concepto_norem" | "descuento";
export interface Novelty {
  employeeId: string;
  kind: NoveltyKind;
  quantity: number | null;
  /** En pesos */
  amount: number | null;
  detail: string | null;
}

export const NOVELTY_LABEL: Record<NoveltyKind, string> = {
  horas: "Horas trabajadas",
  horas_extra_50: "Horas extra al 50 %",
  horas_extra_100: "Horas extra al 100 %",
  ausencia: "Ausencias injustificadas (días)",
  licencia: "Licencia paga (días)",
  vacaciones: "Vacaciones (días)",
  adelanto: "Adelanto de sueldo",
  embargo: "Embargo",
  ganancias: "Retención de Ganancias",
  concepto_rem: "Otro concepto remunerativo",
  concepto_norem: "Otro concepto no remunerativo",
  descuento: "Otro descuento",
};

export interface OrgPayroll {
  employerKind: "general" | "grande";
  /** ART: % de lo remunerativo y suma fija por trabajador (pesos) */
  artPct: number;
  artFixed: number;
  /** Seguro de vida obligatorio por trabajador (pesos) */
  lifeInsurance: number;
  /** Escala propia (fuera de convenio) */
  ownCategories: CctCategory[];
}

export const DEFAULT_ORG: OrgPayroll = { employerKind: "general", artPct: 2.5, artFixed: 800, lifeInsurance: 350, ownCategories: [] };

const c = (pesos: number) => Math.round(pesos * 100);
const pct = (cents: number, p: number) => Math.round((cents * p) / 100);

function daysInMonth(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Años completos de antigüedad a una fecha */
export function seniorityYears(start: string | null, at: string) {
  if (!start) return 0;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ay, am, ad] = at.split("-").map(Number);
  let y = ay - sy;
  if (am < sm || (am === sm && ad < sd)) y--;
  return Math.max(0, y);
}

const sum = (lines: Line[], k: LineKind) => lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0);

/** Básico del empleado: el pactado o el de la categoría en la escala vigente */
function basicOf(e: Employee, categories: CctCategory[], own: CctCategory[]) {
  if (e.basicOverride != null && e.basicOverride > 0) return { basic: e.basicOverride, category: categories.find((x) => x.code === e.category) ?? own.find((x) => x.code === e.category) ?? null };
  const cat = (e.cctKey === "fuera_convenio" ? own : categories).find((x) => x.code === e.category) ?? null;
  return { basic: cat?.basic ?? 0, category: cat };
}

/** Aportes del trabajador y contribuciones del empleador sobre lo remunerativo */
function withholdings(lines: Line[], cct: Cct, e: Employee, org: OrgPayroll, p: LegalParams, opts: { detraccionFactor: number; ceaseFundYears?: number }) {
  const rem = sum(lines, "rem");
  const base = Math.min(rem, c(p.maxBase));
  lines.push({ code: "jubilacion", name: "Jubilación (Ley 24.241)", kind: "desc", quantity: p.retirementPct, amount: pct(base, p.retirementPct) });
  lines.push({ code: "pami", name: "Ley 19.032 (PAMI)", kind: "desc", quantity: p.pamiPct, amount: pct(base, p.pamiPct) });
  lines.push({ code: "obra_social", name: "Obra social", kind: "desc", quantity: p.healthPct, amount: pct(base, p.healthPct) });
  if (e.affiliated && cct.unionPct > 0) lines.push({ code: "sindicato", name: `Cuota sindical ${cct.union}`, kind: "desc", quantity: cct.unionPct, amount: pct(rem, cct.unionPct) });
  else if (!e.affiliated && cct.solidarityPct > 0) lines.push({ code: "solidario", name: `Aporte solidario ${cct.union}`, kind: "desc", quantity: cct.solidarityPct, amount: pct(rem, cct.solidarityPct) });
  const contribBase = Math.max(0, base - Math.round(c(p.detraccion) * opts.detraccionFactor));
  const rate = p.employerPct[org.employerKind];
  lines.push({ code: "contrib_ss", name: "Contribuciones de seguridad social", kind: "contrib", quantity: rate, amount: pct(contribBase, rate) });
  lines.push({ code: "contrib_os", name: "Contribución obra social", kind: "contrib", quantity: p.employerHealthPct, amount: pct(base, p.employerHealthPct) });
  if (cct.employerUnionPct > 0) lines.push({ code: "contrib_sindical", name: `Contribución ${cct.union}`, kind: "contrib", quantity: cct.employerUnionPct, amount: pct(rem, cct.employerUnionPct) });
  if (cct.ceaseFundPct && opts.ceaseFundYears != null) {
    const fp = opts.ceaseFundYears < 1 ? cct.ceaseFundPct : 8;
    lines.push({ code: "fondo_cese", name: "Fondo de cese laboral", kind: "contrib", quantity: fp, amount: pct(rem, fp) });
  }
  return { base, contribBase };
}

function close(lines: Line[], warnings: string[], bases: { aportes: number; contribuciones: number }): Result {
  const clean = lines.filter((l) => l.amount !== 0);
  const rem = sum(clean, "rem");
  const norem = sum(clean, "norem");
  const desc = sum(clean, "desc");
  const contrib = sum(clean, "contrib");
  return { lines: clean, rem, norem, desc, net: rem + norem - desc, contrib, cost: rem + norem + contrib, bases, warnings };
}

/** Embargo: inembargable hasta el SMVM; 10 % del excedente hasta 2 SMVM, 20 % arriba (Decreto 484/87) */
export function embargoLimit(netCents: number, smvm: number) {
  const s = c(smvm);
  if (netCents <= s) return 0;
  return Math.round((netCents - s) * (netCents <= 2 * s ? 0.1 : 0.2));
}

interface MonthlyInput {
  period: string;
  employee: Employee;
  categories: CctCategory[];
  novelties: Novelty[];
  org: OrgPayroll;
  params: LegalParams;
  /** Las vacaciones del período ya se pagaron en una liquidación de vacaciones */
  vacationsPaid?: boolean;
}

/** Liquidación mensual de un empleado */
export function liquidarMensual(i: MonthlyInput): Result {
  const { employee: e, org, params: p, period } = i;
  const warnings: string[] = [];
  const cct = cctOf(e.cctKey);
  if (!cct) return close([], ["Falta el convenio (o «fuera de convenio») en el legajo."], { aportes: 0, contribuciones: 0 });
  const { basic, category } = basicOf(e, i.categories, org.ownCategories);
  if (!basic) warnings.push(`La categoría «${e.category ?? "—"}» no está en la escala vigente de ${cct.name}: cargá el básico pactado o la categoría.`);
  const dim = daysInMonth(period);
  const first = `${period}-01`;
  const last = `${period}-${String(dim).padStart(2, "0")}`;
  const from = e.startDate && e.startDate > first ? e.startDate : first;
  const to = e.endDate && e.endDate < last ? e.endDate : last;
  const worked = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const prorata = worked >= dim ? 1 : worked / 30;
  const nov = (k: NoveltyKind) => i.novelties.filter((n) => n.employeeId === e.id && n.kind === k);
  const qty = (k: NoveltyKind) => nov(k).reduce((s, n) => s + (Number(n.quantity) || 0), 0);
  const amt = (k: NoveltyKind) => nov(k).reduce((s, n) => s + (Number(n.amount) || 0), 0);
  const lines: Line[] = [];
  const hours = e.hours ?? cct.monthlyHours;
  let basicCents: number;
  if (cct.unit === "hora") {
    const h = qty("horas") || Math.round(hours * prorata);
    basicCents = Math.round(c(basic) * h);
    lines.push({ code: "basico", name: `Jornal ${category?.name ?? e.category ?? ""}`.trim(), kind: "rem", quantity: h, amount: basicCents });
  } else {
    const part = e.hours && e.hours < cct.monthlyHours ? e.hours / cct.monthlyHours : 1;
    basicCents = Math.round(c(basic) * part * prorata);
    lines.push({ code: "basico", name: `Sueldo básico ${category?.name ?? e.category ?? ""}`.trim(), kind: "rem", quantity: prorata < 1 ? worked : 30, amount: basicCents });
  }
  if (prorata < 1) warnings.push(`Trabajó ${worked} días del mes (ingreso o egreso en el período).`);
  const years = seniorityYears(e.startDate, last);
  const seniority = cct.seniorityPct > 0 && years > 0 ? pct(basicCents, cct.seniorityPct * years) : 0;
  lines.push({ code: "antiguedad", name: `Antigüedad (${years} ${years === 1 ? "año" : "años"})`, kind: "rem", quantity: years, amount: seniority });
  const hourValue = (basicCents + seniority) / (cct.unit === "hora" ? Math.max(1, lines[0].quantity ?? hours) : hours);
  // Ausencias injustificadas y vacaciones (los días se descuentan del básico y las vacaciones se pagan al /25)
  const absent = qty("ausencia");
  if (absent > 0) lines.push({ code: "ausencias", name: "Ausencias injustificadas", kind: "rem", quantity: absent, amount: -Math.round(cct.unit === "hora" ? hourValue * 8 * absent : ((basicCents + seniority) / 30) * absent) });
  const vac = i.vacationsPaid ? 0 : qty("vacaciones");
  if (vac > 0 && cct.unit === "mes") {
    lines.push({ code: "vacaciones_desc", name: "Días de vacaciones", kind: "rem", quantity: vac, amount: -Math.round(((basicCents + seniority) / 30) * vac) });
    lines.push({ code: "vacaciones", name: "Vacaciones", kind: "rem", quantity: vac, amount: Math.round(((basicCents + seniority) / 25) * vac) });
  } else if (vac > 0) lines.push({ code: "vacaciones", name: "Vacaciones", kind: "rem", quantity: vac, amount: Math.round(hourValue * 8 * vac) });
  const he50 = qty("horas_extra_50");
  const he100 = qty("horas_extra_100");
  if (he50) lines.push({ code: "he50", name: "Horas extra al 50 %", kind: "rem", quantity: he50, amount: Math.round(hourValue * 1.5 * he50) });
  if (he100) lines.push({ code: "he100", name: "Horas extra al 100 %", kind: "rem", quantity: he100, amount: Math.round(hourValue * 2 * he100) });
  if (he50 + he100 > 30) warnings.push(`${he50 + he100} horas extra en el mes: revisá el límite legal (30 por mes).`);
  for (const n of nov("concepto_rem")) lines.push({ code: "concepto", name: n.detail || "Concepto remunerativo", kind: "rem", quantity: n.quantity, amount: c(Number(n.amount) || 0) });
  // Adicionales del convenio (el presentismo se calcula sobre lo remunerativo y se pierde con ausencias)
  for (const x of cct.extras.filter((x) => x.kind !== "pct_rem")) {
    const amount = x.kind === "pct_basico" ? pct(basicCents, x.value) : Math.round(c(x.value) * prorata);
    lines.push({ code: x.code, name: x.name, kind: x.remunerativo ? "rem" : "norem", quantity: x.kind === "fijo" ? null : x.value, amount });
  }
  for (const x of cct.extras.filter((x) => x.kind === "pct_rem")) {
    if (x.lostOnAbsence && absent > 0) {
      warnings.push(`Pierde ${x.name.toLowerCase()} por ${absent} ${absent === 1 ? "ausencia" : "ausencias"} injustificadas.`);
      continue;
    }
    lines.push({ code: x.code, name: x.name, kind: x.remunerativo ? "rem" : "norem", quantity: x.value, amount: pct(sum(lines, "rem"), x.value) });
  }
  for (const n of nov("concepto_norem")) lines.push({ code: "concepto_nr", name: n.detail || "Concepto no remunerativo", kind: "norem", quantity: n.quantity, amount: c(Number(n.amount) || 0) });
  const { base, contribBase } = withholdings(lines, cct, e, org, p, { detraccionFactor: prorata, ceaseFundYears: years });
  lines.push({ code: "art", name: "ART", kind: "contrib", quantity: org.artPct, amount: pct(sum(lines, "rem"), org.artPct) + c(org.artFixed) });
  lines.push({ code: "seguro_vida", name: "Seguro de vida obligatorio", kind: "contrib", quantity: null, amount: c(org.lifeInsurance) });
  if (amt("ganancias")) lines.push({ code: "ganancias", name: "Retención Impuesto a las Ganancias", kind: "desc", quantity: null, amount: c(amt("ganancias")) });
  if (amt("adelanto")) lines.push({ code: "adelanto", name: "Adelanto de sueldo", kind: "desc", quantity: null, amount: c(amt("adelanto")) });
  for (const n of nov("descuento")) lines.push({ code: "descuento", name: n.detail || "Descuento", kind: "desc", quantity: null, amount: c(Number(n.amount) || 0) });
  // Embargo: sobre el neto, con el límite legal
  const embargo = amt("embargo");
  if (embargo) {
    const before = sum(lines, "rem") + sum(lines, "norem") - sum(lines, "desc");
    const limit = embargoLimit(before, p.smvm);
    const take = Math.min(c(embargo), limit);
    if (take < c(embargo)) warnings.push(`El embargo pedido supera el límite legal: se retienen $ ${(take / 100).toFixed(2)} de $ ${embargo.toFixed(2)}.`);
    lines.push({ code: "embargo", name: "Embargo judicial", kind: "desc", quantity: null, amount: take });
  }
  if (!e.cbu) warnings.push("Falta el CBU: no entra en el archivo de acreditación.");
  return close(lines, warnings, { aportes: base, contribuciones: contribBase });
}

/** Días del semestre trabajados (para el SAC proporcional) */
function semesterBounds(period: string) {
  const [y, m] = period.split("-").map(Number);
  return m <= 6 ? { from: `${y}-01-01`, to: `${y}-06-30`, days: Date.UTC(y, 5, 30) / 86400000 - Date.UTC(y, 0, 1) / 86400000 + 1 } : { from: `${y}-07-01`, to: `${y}-12-31`, days: 184 };
}

interface SacInput {
  period: string;
  employee: Employee;
  /** Remuneraciones remunerativas mensuales del semestre (centavos), de las liquidaciones aprobadas */
  remunerations: number[];
  org: OrgPayroll;
  params: LegalParams;
  /** Fecha de egreso (SAC proporcional de la liquidación final) */
  until?: string | null;
}

/** Sueldo anual complementario: la mitad de la mejor remuneración del semestre, proporcional a lo trabajado */
export function liquidarSac(i: SacInput): Result {
  const { employee: e } = i;
  const cct = cctOf(e.cctKey);
  if (!cct) return close([], ["Falta el convenio en el legajo."], { aportes: 0, contribuciones: 0 });
  const sem = semesterBounds(i.period);
  const from = e.startDate && e.startDate > sem.from ? e.startDate : sem.from;
  const to = i.until && i.until < sem.to ? i.until : sem.to;
  const worked = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const best = Math.max(0, ...i.remunerations);
  const warnings: string[] = [];
  if (!i.remunerations.length) warnings.push("No hay liquidaciones aprobadas del semestre: el SAC sale en cero.");
  const amount = Math.round((best / 2) * Math.min(1, worked / sem.days));
  const lines: Line[] = [{ code: "sac", name: `SAC ${i.period.slice(5) <= "06" ? "1.er" : "2.º"} semestre ${i.period.slice(0, 4)}`, kind: "rem", quantity: worked < sem.days ? worked : null, amount }];
  if (worked < sem.days) warnings.push(`SAC proporcional: ${worked} de ${sem.days} días del semestre.`);
  const { base, contribBase } = withholdings(lines, cct, e, i.org, i.params, { detraccionFactor: 0.5 });
  lines.push({ code: "art", name: "ART", kind: "contrib", quantity: i.org.artPct, amount: pct(sum(lines, "rem"), i.org.artPct) });
  return close(lines, warnings, { aportes: base, contribuciones: contribBase });
}

/** Días de vacaciones por año según la antigüedad (LCT art. 150) */
const vacationDays = (years: number) => (years < 5 ? 14 : years < 10 ? 21 : years < 20 ? 28 : 35);

export type EndReason = "renuncia" | "despido_sin_causa" | "mutuo_acuerdo" | "periodo_prueba";
export const END_REASON: Record<EndReason, string> = { renuncia: "Renuncia", despido_sin_causa: "Despido sin causa", mutuo_acuerdo: "Mutuo acuerdo (art. 241)", periodo_prueba: "Fin del período de prueba" };

interface FinalInput extends Omit<MonthlyInput, "period"> {
  endDate: string;
  reason: EndReason;
  /** Remuneraciones del semestre (para el SAC proporcional) y mejor remuneración mensual normal y habitual del último año (centavos) */
  remunerations: number[];
  bestMonthly: number;
  /** Días de vacaciones ya gozados en el año */
  vacationsTaken: number;
  /** Se otorgó preaviso trabajado */
  noticeGiven?: boolean;
}

/** Liquidación final: días del mes, SAC proporcional, vacaciones no gozadas y, si corresponde, indemnizaciones */
export function liquidarFinal(i: FinalInput): Result {
  const e = { ...i.employee, endDate: i.endDate };
  const period = i.endDate.slice(0, 7);
  const month = liquidarMensual({ ...i, employee: e, period });
  const cct = cctOf(e.cctKey)!;
  if (!cct) return month;
  const warnings = [...month.warnings];
  const lines: Line[] = month.lines.filter((l) => l.kind === "rem" || l.kind === "norem");
  const sac = liquidarSac({ period, employee: e, remunerations: [...i.remunerations, month.rem], org: i.org, params: i.params, until: i.endDate });
  lines.push(...sac.lines.filter((l) => l.code === "sac").map((l) => ({ ...l, name: "SAC proporcional" })));
  const years = seniorityYears(e.startDate, i.endDate);
  const { basic } = basicOf(e, i.categories, i.org.ownCategories);
  const monthly = c(basic) * (cct.unit === "hora" ? (e.hours ?? cct.monthlyHours) : 1);
  const dayValue = (monthly + pct(monthly, cct.seniorityPct * years)) / 25;
  // Vacaciones no gozadas proporcionales al año calendario
  const yStart = `${i.endDate.slice(0, 4)}-01-01`;
  const fromY = e.startDate && e.startDate > yStart ? e.startDate : yStart;
  const daysYear = Math.round((Date.parse(i.endDate) - Date.parse(fromY)) / 86400000) + 1;
  const owed = Math.max(0, Math.round((vacationDays(years) * daysYear) / 365 - i.vacationsTaken));
  if (owed > 0) {
    const v = Math.round(dayValue * owed);
    lines.push({ code: "vac_no_gozadas", name: "Vacaciones no gozadas", kind: "norem", quantity: owed, amount: v });
    lines.push({ code: "sac_vac", name: "SAC sobre vacaciones no gozadas", kind: "norem", quantity: null, amount: Math.round(v / 12) });
  }
  if (i.reason === "despido_sin_causa" || i.reason === "periodo_prueba") {
    const best = Math.max(i.bestMonthly, month.rem);
    const startMs = Date.parse(e.startDate ?? i.endDate);
    const months = (Date.parse(i.endDate) - startMs) / (86400000 * 30.4375);
    if (i.reason === "despido_sin_causa" && months >= 3) {
      const fullYears = Math.floor(months / 12) + (months % 12 > 3 ? 1 : 0);
      lines.push({ code: "indemnizacion", name: "Indemnización por antigüedad (art. 245)", kind: "norem", quantity: Math.max(1, fullYears), amount: best * Math.max(1, fullYears) });
    }
    if (!i.noticeGiven) {
      const notice = months < 3 ? best / 2 : years < 5 ? best : best * 2;
      lines.push({ code: "preaviso", name: "Indemnización sustitutiva del preaviso", kind: "norem", quantity: null, amount: Math.round(notice) });
      lines.push({ code: "sac_preaviso", name: "SAC sobre preaviso", kind: "norem", quantity: null, amount: Math.round(notice / 12) });
      const dim = daysInMonth(period);
      const left = dim - Number(i.endDate.slice(8));
      if (left > 0 && months >= 3) {
        const integ = Math.round((best / 30) * left);
        lines.push({ code: "integracion", name: "Integración del mes de despido", kind: "norem", quantity: left, amount: integ });
        lines.push({ code: "sac_integracion", name: "SAC sobre integración", kind: "norem", quantity: null, amount: Math.round(integ / 12) });
      }
    }
    warnings.push("Las indemnizaciones se calculan con el tope y la jurisprudencia habituales sin aplicar topes de convenio: revisalas antes de aprobar.");
  }
  const desc = month.lines.filter((l) => l.kind === "desc" && !["jubilacion", "pami", "obra_social", "sindicato", "solidario"].includes(l.code));
  const recalc = withholdings(lines, cct, e, i.org, i.params, { detraccionFactor: 1, ceaseFundYears: years });
  lines.push(...desc);
  lines.push({ code: "art", name: "ART", kind: "contrib", quantity: i.org.artPct, amount: pct(sum(lines, "rem"), i.org.artPct) + c(i.org.artFixed) });
  if (cct.ceaseFundPct) warnings.push("UOCRA: en vez de indemnización corresponde el fondo de cese laboral; revisá las indemnizaciones.");
  return close(lines, warnings, { aportes: recalc.base, contribuciones: recalc.contribBase });
}

/** Liquidación de vacaciones adelantadas: paga los días al /25 y descuenta los mismos días del mes */
export function liquidarVacaciones(i: MonthlyInput): Result {
  const full = liquidarMensual(i);
  const cct = cctOf(i.employee.cctKey);
  if (!cct) return full;
  const lines = full.lines.filter((l) => l.code === "vacaciones" || l.code === "vacaciones_desc");
  if (!lines.length) return close([], ["Sin días de vacaciones cargados como novedad en el período."], { aportes: 0, contribuciones: 0 });
  const { base, contribBase } = withholdings(lines, cct, i.employee, i.org, i.params, { detraccionFactor: 0 });
  return close(lines, full.warnings.filter((w) => !w.startsWith("Falta el CBU")), { aportes: base, contribuciones: contribBase });
}

/** Variaciones contra el período anterior: el neto que cambia más del 20 % se marca */
export function variations(current: { employeeId: string; name: string; net: number; cost: number }[], previous: { employeeId: string; net: number; cost: number }[]) {
  return current.map((x) => {
    const p = previous.find((y) => y.employeeId === x.employeeId);
    const delta = p && p.net ? (x.net - p.net) / p.net : null;
    return { ...x, previousNet: p?.net ?? null, delta, flag: delta != null && Math.abs(delta) > 0.2 ? (delta > 0 ? "sube" : "baja") : p ? null : "nuevo" };
  });
}

// ─── Número en letras (recibos) ───
const U = ["", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const D = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
function upTo999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 30 ? U[r] : `${D[Math.floor(r / 10)]}${r % 10 ? ` y ${U[r % 10]}` : ""}`;
  return [C[h], rest].filter(Boolean).join(" ");
}
function words(n: number): string {
  if (n === 0) return "cero";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (millions) parts.push(millions === 1 ? "un millón" : `${words(millions).replace(/uno$/, "un")} millones`);
  if (thousands) parts.push(thousands === 1 ? "mil" : `${upTo999(thousands).replace(/uno$/, "un")} mil`);
  if (rest) parts.push(upTo999(rest));
  return parts.join(" ");
}
/** «Pesos un millón doscientos mil con 50/100» */
export function enLetras(cents: number) {
  const n = Math.floor(Math.abs(cents) / 100);
  const r = Math.abs(cents) % 100;
  return `Pesos ${words(n)} con ${String(r).padStart(2, "0")}/100`;
}
