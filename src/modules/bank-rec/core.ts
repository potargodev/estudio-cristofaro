// Conciliación bancaria (módulo bank_rec), sin base ni red: clasifica los
// movimientos de un extracto, sugiere con qué comprobante cruza cada uno y
// arma el estado de la conciliación. Montos en centavos, con signo
// (positivo = entra a la cuenta, negativo = sale).

import { merchantKey } from "@/modules/bitacora/smart";

export type MovementClass = "cobro" | "pago" | "comision" | "impuesto" | "transferencia";

export interface BankMov {
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

export interface Suggestion {
  candidateId: string;
  score: number;
  reasons: string[];
}

/**
 * Puntaje de un candidato para un movimiento (0 a 1). Importe exacto pesa
 * más; suman la cercanía de fechas, el CUIT o el nombre en la descripción y
 * el número del comprobante. Un cobro solo cruza con emitidos y un pago con
 * recibidos.
 */
export function score(m: BankMov, c: Candidate): Suggestion | null {
  if ((m.amount > 0) !== (c.type === "emitido")) return null;
  const amount = Math.abs(m.amount);
  const diff = Math.abs(amount - c.total) / Math.max(1, c.total);
  if (diff > 0.02) return null;
  const reasons: string[] = [];
  let s = 0;
  if (diff === 0) {
    s += 0.55;
    reasons.push("mismo importe");
  } else {
    s += 0.35;
    reasons.push("importe parecido");
  }
  const dd = days(m.date, c.date);
  if (dd > 60) return null;
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
export function suggest(movs: BankMov[], candidates: Candidate[], min = 0.6): Map<string, Suggestion> {
  const all: (Suggestion & { movId: string })[] = [];
  for (const m of movs) for (const c of candidates) {
    const s = score(m, c);
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

export interface Summary {
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
