// Cálculo contable puro (A1): validación de asientos, balance de sumas y
// saldos, mayor, estados contables (situación patrimonial y resultados),
// antigüedad de saldos, amortizaciones y asientos de cierre. Montos en
// centavos enteros. Sin base de datos: lo usan el servidor y las pruebas.

import { compareCodes, debitNature, type AccountKind } from "./plan";

export interface Line {
  account: string;
  code?: string;
  debit: number;
  credit: number;
  foreign?: { currency: string; amount: number; rate: number };
  detail?: string;
}

export interface Entry {
  id: string;
  date: string;
  number: number | null;
  concept: string;
  status: string;
  source: string;
  lines: Line[];
}

export interface Account {
  code: string;
  name: string;
  kind: AccountKind;
  imputable: boolean;
  monetary: boolean;
  currency: string;
  role: string | null;
}

export class EntryError extends Error {}

/** Un asiento válido: al menos dos líneas, cada una de un solo lado y positiva, y debe igual a haber */
export function validateLines(lines: Line[]) {
  if (lines.length < 2) throw new EntryError("Un asiento lleva al menos dos líneas.");
  for (const l of lines) {
    if (!Number.isInteger(l.debit) || !Number.isInteger(l.credit) || l.debit < 0 || l.credit < 0) throw new EntryError("Los importes van en positivo.");
    if ((l.debit > 0) === (l.credit > 0)) throw new EntryError("Cada línea va al debe o al haber, no a los dos (ni vacía).");
  }
  const d = lines.reduce((s, l) => s + l.debit, 0);
  const c = lines.reduce((s, l) => s + l.credit, 0);
  if (d !== c) throw new EntryError(`El asiento no balancea: debe ${d / 100} y haber ${c / 100}.`);
  return d;
}

/** Código de la cuenta de una línea: el suyo, o el de la cuenta con ese nombre (los asientos viejos solo traen el nombre) */
function codeOf(line: Line, byName: Map<string, string>) {
  return line.code ?? byName.get(line.account.trim().toLowerCase()) ?? null;
}

const NO_ACCOUNT = "—";

interface TrialRow {
  code: string;
  name: string;
  kind: AccountKind | null;
  debit: number;
  credit: number;
  /** Debe menos haber */
  balance: number;
}

/** Balance de sumas y saldos de los asientos registrados entre dos fechas (incluidas) */
export function trialBalance(entries: Entry[], accounts: Account[], from: string | null, to: string) {
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a.code]));
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const rows = new Map<string, TrialRow>();
  for (const e of entries) {
    if (e.status !== "registrado" || e.date > to || (from && e.date < from)) continue;
    for (const l of e.lines) {
      const code = codeOf(l, byName) ?? NO_ACCOUNT;
      const a = byCode.get(code);
      const r = rows.get(code) ?? { code, name: a?.name ?? `Sin cuenta en el plan: ${l.account}`, kind: a?.kind ?? null, debit: 0, credit: 0, balance: 0 };
      r.debit += l.debit;
      r.credit += l.credit;
      r.balance = r.debit - r.credit;
      rows.set(code, r);
    }
  }
  const list = [...rows.values()].sort((a, b) => (a.code === NO_ACCOUNT ? 1 : b.code === NO_ACCOUNT ? -1 : compareCodes(a.code, b.code)));
  const debit = list.reduce((s, r) => s + r.debit, 0);
  const credit = list.reduce((s, r) => s + r.credit, 0);
  return { rows: list, debit, credit, balanced: debit === credit };
}

interface LedgerRow {
  entryId: string;
  date: string;
  number: number | null;
  concept: string;
  debit: number;
  credit: number;
  balance: number;
}

/** Mayor de una cuenta con el saldo acumulado (y el saldo anterior al período) */
export function ledger(entries: Entry[], accounts: Account[], code: string, from: string | null, to: string) {
  const byName = new Map(accounts.map((a) => [a.name.toLowerCase(), a.code]));
  let opening = 0;
  const rows: LedgerRow[] = [];
  const sorted = [...entries].filter((e) => e.status === "registrado" && e.date <= to).sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? 0) - (b.number ?? 0));
  let balance = 0;
  for (const e of sorted) {
    for (const l of e.lines) {
      if (codeOf(l, byName) !== code) continue;
      if (from && e.date < from) {
        opening += l.debit - l.credit;
        continue;
      }
      if (!rows.length) balance = opening;
      balance += l.debit - l.credit;
      rows.push({ entryId: e.id, date: e.date, number: e.number, concept: l.detail ? `${e.concept} · ${l.detail}` : e.concept, debit: l.debit, credit: l.credit, balance });
    }
  }
  return { opening, rows, closing: rows.length ? rows[rows.length - 1].balance : opening };
}

interface StatementLine {
  code: string;
  name: string;
  /** Saldo con su signo natural (positivo = saldo normal de la cuenta) */
  amount: number;
}

/** Saldo con el signo natural de la cuenta */
const natural = (kind: AccountKind, balance: number) => (debitNature(kind) ? balance : -balance);

/**
 * Estados contables desde el balance de sumas y saldos: situación
 * patrimonial (corriente y no corriente por el código 1.1, 1.2, 2.1, 2.2) y
 * resultados. El resultado del ejercicio se suma al patrimonio neto y la
 * ecuación tiene que cerrar.
 */
export function statements(trial: TrialRow[]) {
  const pick = (prefix: string, kind: AccountKind) =>
    trial
      .filter((r) => r.kind === kind && (r.code === prefix || r.code.startsWith(`${prefix}.`)) && r.balance !== 0)
      .map((r) => ({ code: r.code, name: r.name, amount: natural(kind, r.balance) }));
  const sum = (xs: StatementLine[]) => xs.reduce((s, x) => s + x.amount, 0);
  const activoCorriente = pick("1.1", "activo");
  const activoNoCorriente = trial.filter((r) => r.kind === "activo" && !r.code.startsWith("1.1") && r.balance !== 0).map((r) => ({ code: r.code, name: r.name, amount: natural("activo", r.balance) }));
  const pasivoCorriente = pick("2.1", "pasivo");
  const pasivoNoCorriente = trial.filter((r) => r.kind === "pasivo" && !r.code.startsWith("2.1") && r.balance !== 0).map((r) => ({ code: r.code, name: r.name, amount: natural("pasivo", r.balance) }));
  const patrimonio = trial.filter((r) => r.kind === "patrimonio" && r.balance !== 0).map((r) => ({ code: r.code, name: r.name, amount: natural("patrimonio", r.balance) }));
  const ingresos = trial.filter((r) => r.kind === "ingreso" && r.balance !== 0).map((r) => ({ code: r.code, name: r.name, amount: natural("ingreso", r.balance) }));
  const egresos = trial.filter((r) => r.kind === "egreso" && r.balance !== 0).map((r) => ({ code: r.code, name: r.name, amount: natural("egreso", r.balance) }));
  const resultado = sum(ingresos) - sum(egresos);
  const activo = sum(activoCorriente) + sum(activoNoCorriente);
  const pasivo = sum(pasivoCorriente) + sum(pasivoNoCorriente);
  const pn = sum(patrimonio) + resultado;
  const sinCuenta = trial.filter((r) => r.kind === null);
  return {
    situacion: { activoCorriente, activoNoCorriente, activo, pasivoCorriente, pasivoNoCorriente, pasivo, patrimonio, resultado, patrimonioNeto: pn },
    resultados: { ingresos, egresos, totalIngresos: sum(ingresos), totalEgresos: sum(egresos), resultado },
    /** Activo = pasivo + patrimonio neto (con el resultado) */
    cierra: activo === pasivo + pn && sinCuenta.length === 0,
    sinCuenta,
  };
}

// ───────────── Cuentas corrientes ─────────────

export interface OpenItem {
  party: string;
  doc: string;
  date: string;
  due: string | null;
  /** Centavos pendientes */
  amount: number;
}

export const AGING = ["Sin vencer", "1 a 30 días", "31 a 60 días", "61 a 90 días", "Más de 90 días"] as const;

/** Antigüedad de saldos por cliente o proveedor, contando desde el vencimiento (o la fecha si no tiene) */
export function aging(items: OpenItem[], today: string) {
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const parties = new Map<string, { party: string; buckets: number[]; total: number; items: OpenItem[] }>();
  for (const it of items) {
    if (it.amount === 0) continue;
    const late = days(it.due ?? it.date, today);
    const b = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    const p = parties.get(it.party) ?? { party: it.party, buckets: [0, 0, 0, 0, 0], total: 0, items: [] };
    p.buckets[b] += it.amount;
    p.total += it.amount;
    p.items.push(it);
    parties.set(it.party, p);
  }
  const rows = [...parties.values()].sort((a, b) => b.total - a.total);
  const totals = AGING.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0));
  return { rows, totals, total: totals.reduce((s, x) => s + x, 0) };
}

// ───────────── Bienes de uso ─────────────

interface Asset {
  cost: number;
  residual: number;
  lifeMonths: number;
  acquiredOn: string;
  disposedOn: string | null;
}

const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;

/** Amortización lineal: año de alta completo según el criterio mensual (desde el mes de alta), hasta el fin de la vida útil o la baja */
export function depreciation(a: Asset, until: string) {
  const end = a.disposedOn && a.disposedOn < until ? a.disposedOn : until;
  const months = Math.max(0, Math.min(a.lifeMonths, monthIndex(end) - monthIndex(a.acquiredOn) + 1));
  const base = a.cost - a.residual;
  const monthly = a.lifeMonths ? base / a.lifeMonths : 0;
  const accumulated = months >= a.lifeMonths ? base : Math.round(monthly * months);
  return { months, monthly: Math.round(monthly), accumulated, net: a.cost - accumulated };
}

/** Amortización de un período (entre dos fechas incluidas) */
export function depreciationBetween(a: Asset, from: string, to: string) {
  const before = new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10);
  return depreciation(a, to).accumulated - (from > a.acquiredOn ? depreciation(a, before).accumulated : 0);
}

// ───────────── Moneda extranjera ─────────────

/** Diferencia de cambio: saldo en pesos del libro contra el saldo en moneda extranjera (centavos de esa moneda) al tipo de cambio de cierre */
export function fxDifference(balanceArs: number, balanceForeign: number, closingRate: number) {
  const valued = Math.round(balanceForeign * closingRate);
  return { valued, difference: valued - balanceArs };
}

// ───────────── Cierre ─────────────

/**
 * Asientos de cierre de un ejercicio desde su balance de sumas y saldos:
 * 1. refundición de las cuentas de resultado contra «Resultado del ejercicio»;
 * 2. cierre de las cuentas patrimoniales (todas quedan en cero);
 * 3. apertura del ejercicio siguiente (el cierre al revés).
 */
export function closingEntries(trial: TrialRow[], resultCode: string, resultName: string) {
  const results = trial.filter((r) => (r.kind === "ingreso" || r.kind === "egreso") && r.balance !== 0);
  const refund: Line[] = results.map((r) => ({ account: r.name, code: r.code, debit: r.balance < 0 ? -r.balance : 0, credit: r.balance > 0 ? r.balance : 0 }));
  const net = results.reduce((s, r) => s + r.balance, 0); // debe − haber de resultados: negativo = ganancia
  if (net !== 0) refund.push({ account: resultName, code: resultCode, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  // Saldos patrimoniales después de la refundición
  const patrimonial = new Map(trial.filter((r) => r.kind === "activo" || r.kind === "pasivo" || r.kind === "patrimonio").map((r) => [r.code, { ...r }]));
  if (net !== 0) {
    const res = patrimonial.get(resultCode) ?? { code: resultCode, name: resultName, kind: "patrimonio" as const, debit: 0, credit: 0, balance: 0 };
    res.balance += net;
    patrimonial.set(resultCode, res);
  }
  const open = [...patrimonial.values()].filter((r) => r.balance !== 0).sort((a, b) => compareCodes(a.code, b.code));
  const close: Line[] = open.map((r) => ({ account: r.name, code: r.code, debit: r.balance < 0 ? -r.balance : 0, credit: r.balance > 0 ? r.balance : 0 }));
  const opening: Line[] = open.map((r) => ({ account: r.name, code: r.code, debit: r.balance > 0 ? r.balance : 0, credit: r.balance < 0 ? -r.balance : 0 }));
  return { refund: refund.length >= 2 ? refund : [], close: close.length >= 2 ? close : [], opening: opening.length >= 2 ? opening : [] };
}

/** Período de un ejercicio que termina en el mes y día dados (MM-DD) y contiene la fecha */
export function fiscalYearOf(date: string, yearEnd: string) {
  const y = Number(date.slice(0, 4));
  const endThis = `${y}-${yearEnd}`;
  const end = date <= endThis ? endThis : `${y + 1}-${yearEnd}`;
  const start = new Date(Date.parse(`${Number(end.slice(0, 4)) - 1}-${yearEnd}`) + 86400000).toISOString().slice(0, 10);
  return { start, end };
}
