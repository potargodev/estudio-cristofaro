// Conciliación bancaria (módulo bank_rec), sin base ni red: clasifica los
// movimientos de un extracto, sugiere con qué comprobante cruza cada uno y
// arma el estado de la conciliación. Montos en centavos, con signo
// (positivo = entra a la cuenta, negativo = sale).

import { merchantKey } from "@/modules/bitacora/smart";

export type MovementClass = "cobro" | "pago" | "comision" | "impuesto" | "transferencia";

interface BankMov {
  id: string;
  date: string; // AAAA-MM-DD
  description: string;
  amount: number;
}

/** Comprobante candidato: emitido (cobro esperado) o recibido (pago esperado) */
export interface Candidate {
  id: string;
  type: "emitido" | "recibido";
  date: string;
  /** Total del comprobante en centavos, positivo */
  total: number;
  counterparty: string | null;
  cuit: string | null;
  number: string | null;
}

export interface Rule {
  id: string;
  /** Texto que tiene que aparecer en la descripción (sin distinguir mayúsculas ni acentos) */
  pattern: string;
  /** Solo débitos, solo créditos o los dos */
  sign: "debito" | "credito" | "ambos";
  action: "comision" | "impuesto" | "ignorar" | "sin_factura";
  label: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Conceptos bancarios típicos de los extractos argentinos
const TAX = [/IMP\.?\s*(LEY|DEB|CRED)/, /LEY\s*25\.?413/, /IMPUESTO/, /SIRCREB/, /PERCEPCION/, /RETENCION/, /IIBB|INGRESOS BRUTOS/, /I\.?V\.?A\.?\b/, /IMP\s+S\/(DEB|CRED)/];
const FEE = [/COMISION/, /MANTENIMIENTO/, /CARGO\s/, /GASTOS?\s+(BANC|DE CUENTA)/, /SERVICIO\s+DE\s+CUENTA/, /PAQUETE/];
const TRANSFER_OWN = [/ENTRE CUENTAS PROPIAS/, /TRANSF(ERENCIA)?\s+PROPIA/];

/** Clase de un movimiento por su descripción y su signo */
export function classify(m: Pick<BankMov, "description" | "amount">): MovementClass {
  const d = norm(m.description);
  if (TRANSFER_OWN.some((r) => r.test(d))) return "transferencia";
  if (TAX.some((r) => r.test(d))) return "impuesto";
  if (FEE.some((r) => r.test(d))) return "comision";
  return m.amount >= 0 ? "cobro" : "pago";
}

/** Primera regla guardada que aplica al movimiento */
export function matchRule(m: Pick<BankMov, "description" | "amount">, rules: Rule[]): Rule | null {
  const d = norm(m.description);
  return rules.find((r) => r.pattern.trim() && d.includes(norm(r.pattern.trim())) && (r.sign === "ambos" || (r.sign === "debito" ? m.amount < 0 : m.amount > 0))) ?? null;
}

const days = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00`).getTime() - new Date(`${b}T12:00:00`).getTime()) / 86400000;
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

interface Suggestion {
  candidateId: string;
  score: number;
  reasons: string[];
}

/** Tolerancias de una cuenta bancaria (§2.q etapa 3): días y monto (fijo en pesos o porcentaje) */
export interface Tolerance {
  days: number;
  kind: "fijo" | "porcentaje";
  value: number;
}
/** Sin cuenta configurada: hasta 60 días y 2 % (el comportamiento de siempre) */
export const DEFAULT_TOLERANCE: Tolerance = { days: 60, kind: "porcentaje", value: 2 };

/** Diferencia de importe aceptada, en centavos, para un total */
export const allowedDiff = (total: number, t: Tolerance) => (t.kind === "fijo" ? Math.round(t.value * 100) : Math.round((Math.abs(total) * t.value) / 100));

const pesos = (cents: number) => `$ ${(Math.abs(cents) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Puntaje de un candidato para un movimiento (0 a 1). Importe exacto pesa
 * más; suman la cercanía de fechas, el CUIT o el nombre en la descripción y
 * el número del comprobante. Un cobro solo cruza con emitidos y un pago con
 * recibidos. Fuera de la tolerancia de fecha o de monto, no cruza.
 */
export function score(m: BankMov, c: Candidate, t: Tolerance = DEFAULT_TOLERANCE): Suggestion | null {
  if ((m.amount > 0) !== (c.type === "emitido")) return null;
  const amount = Math.abs(m.amount);
  const diffCents = Math.abs(amount - c.total);
  const allowed = allowedDiff(c.total, t);
  if (diffCents > allowed) return null;
  const reasons: string[] = [];
  let s = 0;
  if (diffCents === 0) {
    s += 0.55;
    reasons.push("mismo importe");
  } else {
    // Más cerca del importe exacto, más puntaje (dentro de la tolerancia)
    s += 0.35 + 0.15 * (1 - diffCents / Math.max(1, allowed));
    reasons.push(`diferencia de ${pesos(diffCents)}, dentro de la tolerancia`);
  }
  const dd = days(m.date, c.date);
  if (dd > t.days) return null;
  s += dd <= 3 ? 0.2 : dd <= 15 ? 0.12 : 0.05;
  if (dd <= 15) reasons.push(dd === 0 ? "misma fecha" : `${Math.round(dd)} días de diferencia`);
  const desc = norm(m.description);
  const cuit = digits(c.cuit);
  if (cuit.length === 11 && digits(m.description).includes(cuit)) {
    s += 0.25;
    reasons.push("CUIT en el detalle");
  } else if (c.counterparty) {
    const key = merchantKey(c.counterparty);
    const words = norm(c.counterparty).split(/\s+/).filter((w) => w.length >= 4 && !["S.A.", "SRL", "S.R.L.", "SOCIEDAD"].includes(w));
    if ((key && norm(merchantKey(m.description)).includes(norm(key))) || words.some((w) => desc.includes(w))) {
      s += 0.2;
      reasons.push("nombre en el detalle");
    }
  }
  const num = digits(c.number).replace(/^0+/, "");
  if (num.length >= 3 && digits(m.description).includes(num)) {
    s += 0.1;
    reasons.push("número del comprobante");
  }
  return { candidateId: c.id, score: Math.min(1, Math.round(s * 100) / 100), reasons };
}

/** Mejores sugerencias para cada movimiento, sin usar dos veces el mismo comprobante (gana el puntaje más alto) */
export function suggest(movs: BankMov[], candidates: Candidate[], min = 0.6, tol: (movId: string) => Tolerance = () => DEFAULT_TOLERANCE): Map<string, Suggestion> {
  const all: (Suggestion & { movId: string })[] = [];
  for (const m of movs) for (const c of candidates) {
    const s = score(m, c, tol(m.id));
    if (s && s.score >= min) all.push({ ...s, movId: m.id });
  }
  all.sort((a, b) => b.score - a.score);
  const out = new Map<string, Suggestion>();
  const used = new Set<string>();
  for (const s of all) {
    if (out.has(s.movId) || used.has(s.candidateId)) continue;
    out.set(s.movId, { candidateId: s.candidateId, score: s.score, reasons: s.reasons });
    used.add(s.candidateId);
  }
  return out;
}

export type MovStatus = "sin_conciliar" | "sugerido" | "conciliado" | "sin_factura" | "ignorado";

interface Summary {
  pagadas: number;
  pendientes: number;
  pagosSinFactura: number;
  comisiones: number;
  impuestos: number;
  enTransito: number;
  sinConciliar: number;
}

/**
 * Estado de la conciliación: comprobantes cruzados (pagados), comprobantes
 * sin movimiento (pendientes, o en tránsito si son de los últimos días del
 * período), débitos sin comprobante, y comisiones e impuestos bancarios.
 */
export function summarize(
  movs: { amount: number; cls: MovementClass; status: MovStatus }[],
  candidates: { id: string; date: string; matched: boolean }[],
  periodEnd: string,
  transitDays = 5,
): Summary {
  const s: Summary = { pagadas: 0, pendientes: 0, pagosSinFactura: 0, comisiones: 0, impuestos: 0, enTransito: 0, sinConciliar: 0 };
  for (const m of movs) {
    if (m.status === "ignorado") continue;
    if (m.cls === "comision") s.comisiones += -Math.min(0, m.amount);
    else if (m.cls === "impuesto") s.impuestos += -Math.min(0, m.amount);
    else if (m.status === "sin_factura") s.pagosSinFactura++;
    else if (m.status !== "conciliado" && m.cls !== "transferencia") s.sinConciliar++;
  }
  for (const c of candidates) {
    if (c.matched) s.pagadas++;
    else if (c.date <= periodEnd && days(c.date, periodEnd) <= transitDays) s.enTransito++;
    else if (c.date <= periodEnd) s.pendientes++;
  }
  return s;
}

// ───────────── Uno con muchos y muchos con uno ─────────────

export interface GroupSuggestion {
  /** 1:N = un movimiento paga varios comprobantes · N:1 = varios movimientos pagan un comprobante */
  kind: "1:N" | "N:1";
  movementIds: string[];
  candidateIds: string[];
  /** |movimientos| − comprobantes, en centavos (con signo) */
  difference: number;
  score: number;
  reasons: string[];
}

/** Subconjuntos de 2 a `max` elementos cuya suma queda dentro de `allowed` del objetivo (el de menos diferencia) */
function bestSubset<T>(items: T[], value: (x: T) => number, target: number, allowed: number, max = 5): { pick: T[]; diff: number } | null {
  const list = items.slice(0, 16);
  let best: { pick: T[]; diff: number } | null = null;
  const walk = (start: number, pick: T[], sum: number) => {
    if (pick.length >= 2) {
      const diff = Math.abs(sum - target);
      if (diff <= allowed && (!best || diff < best.diff || (diff === best.diff && pick.length < best.pick.length))) best = { pick: [...pick], diff };
    }
    if (pick.length === max || sum - target > allowed) return;
    for (let i = start; i < list.length; i++) walk(i + 1, [...pick, list[i]], sum + value(list[i]));
  };
  walk(0, [], 0);
  return best;
}

const sameParty = (m: BankMov, c: Candidate) => {
  const cuit = digits(c.cuit);
  if (cuit.length === 11 && digits(m.description).includes(cuit)) return true;
  const words = norm(c.counterparty ?? "").split(/\s+/).filter((w) => w.length >= 4 && !["S.A.", "SRL", "S.R.L.", "SOCIEDAD"].includes(w));
  return words.some((w) => norm(m.description).includes(w));
};

/**
 * Sugerencias de grupo para lo que no cruzó uno a uno: un movimiento que paga
 * varios comprobantes o varios movimientos que pagan un comprobante, siempre
 * de la contraparte que aparece en el detalle y dentro de la tolerancia.
 */
export function suggestGroups(movs: BankMov[], candidates: Candidate[], tol: (movId: string) => Tolerance = () => DEFAULT_TOLERANCE): GroupSuggestion[] {
  const out: GroupSuggestion[] = [];
  const usedM = new Set<string>();
  const usedC = new Set<string>();
  // 1:N
  for (const m of movs) {
    const t = tol(m.id);
    const pool = candidates.filter((c) => !usedC.has(c.id) && (m.amount > 0) === (c.type === "emitido") && days(m.date, c.date) <= Math.max(t.days, 45) && c.total < Math.abs(m.amount));
    // Solo comprobantes de la contraparte que aparece en el detalle: sin eso, la combinación es ambigua (se cruza a mano)
    const party = pool.filter((c) => sameParty(m, c));
    const pick = party.length >= 2 ? bestSubset(party, (c) => c.total, Math.abs(m.amount), allowedDiff(m.amount, t)) : null;
    if (!pick) continue;
    const total = pick.pick.reduce((a, c) => a + c.total, 0);
    out.push({ kind: "1:N", movementIds: [m.id], candidateIds: pick.pick.map((c) => c.id), difference: Math.abs(m.amount) - total, score: pick.diff === 0 ? 0.9 : 0.8, reasons: [`un movimiento por ${pick.pick.length} comprobantes`, pick.diff === 0 ? "la suma da exacto" : `diferencia de ${pesos(pick.diff)}, dentro de la tolerancia`, "misma contraparte en el detalle"] });
    usedM.add(m.id);
    pick.pick.forEach((c) => usedC.add(c.id));
  }
  // N:1
  for (const c of candidates) {
    if (usedC.has(c.id)) continue;
    const pool = movs.filter((m) => !usedM.has(m.id) && (m.amount > 0) === (c.type === "emitido") && Math.abs(m.amount) < c.total && days(m.date, c.date) <= tol(m.id).days && sameParty(m, c));
    const t = pool[0] ? tol(pool[0].id) : DEFAULT_TOLERANCE;
    const pick = bestSubset(pool, (m) => Math.abs(m.amount), c.total, allowedDiff(c.total, t), 4);
    if (!pick) continue;
    const total = pick.pick.reduce((a, m) => a + Math.abs(m.amount), 0);
    out.push({ kind: "N:1", movementIds: pick.pick.map((m) => m.id), candidateIds: [c.id], difference: total - c.total, score: pick.diff === 0 ? 0.85 : 0.75, reasons: [`${pick.pick.length} movimientos para un comprobante`, pick.diff === 0 ? "la suma da exacto" : `diferencia de ${pesos(pick.diff)}, dentro de la tolerancia`, "misma contraparte en el detalle"] });
    pick.pick.forEach((m) => usedM.add(m.id));
    usedC.add(c.id);
  }
  return out;
}

// ───────────── Asiento de ajuste ─────────────

interface LedgerAccounts {
  rounding: string;
  fees: string;
  receivable: string;
  payable: string;
}
interface EntryLine {
  account: string;
  debit: number;
  credit: number;
}

/** Hasta este monto la diferencia se toma como redondeo; arriba, como gasto o comisión bancaria */
const ROUNDING_MAX = 1000;

/**
 * Asiento de ajuste por la diferencia entre lo que movió el banco y lo que
 * suman los comprobantes (en centavos, con signo: positivo = el banco movió
 * más). Va entre la cuenta de ajuste y la de deudores (cobros) o proveedores
 * (pagos), para que el cobro o el pago cierre contra los comprobantes.
 */
export function adjustmentLines(difference: number, inflow: boolean, a: LedgerAccounts, account?: string | null): EntryLine[] {
  if (!difference) return [];
  const amount = Math.abs(difference);
  const adj = account?.trim() || (amount <= ROUNDING_MAX ? a.rounding : a.fees);
  const party = inflow ? a.receivable : a.payable;
  // pago de más o cobro de menos: pérdida (debe en ajuste); al revés, ganancia (haber en ajuste)
  const loss = inflow ? difference < 0 : difference > 0;
  return loss
    ? [
        { account: adj, debit: amount, credit: 0 },
        { account: party, debit: 0, credit: amount },
      ]
    : [
        { account: party, debit: amount, credit: 0 },
        { account: adj, debit: 0, credit: amount },
      ];
}
