// Ajuste por inflación contable (A2, RT 6 de la FACPCE, método a validar con
// la contadora): cada partida no monetaria se reexpresa a moneda de cierre
// con el coeficiente índice de cierre / índice del mes de origen; las
// monetarias no se tocan y la diferencia que queda es el RECPAM. Cálculo
// puro, en centavos: lo usan el servidor y las pruebas.

import type { Account, Entry } from "./core";

export type IndexSeries = Map<string, number>; // AAAA-MM → índice

/** Mes anterior a una fecha (AAAA-MM) */
export function prevMonth(iso: string) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Meses entre dos AAAA-MM, incluidos */
function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Los meses que necesita el ajuste de un ejercicio: el anterior al inicio (saldos de apertura) hasta el de cierre */
export const neededMonths = (start: string, end: string) => [prevMonth(start), ...monthsBetween(start.slice(0, 7), end.slice(0, 7))];

export const missingMonths = (series: IndexSeries, start: string, end: string) => neededMonths(start, end).filter((m) => !(series.get(m)! > 0));

/** Coeficiente de reexpresión de un mes de origen al mes de cierre */
function coefficient(series: IndexSeries, origin: string, closing: string) {
  const a = series.get(origin);
  const b = series.get(closing);
  if (!a || !b) throw new Error(`Falta el índice de ${!a ? origin : closing}.`);
  return b / a;
}

/** ¿La cuenta se reexpresa? Las no monetarias y los resultados (salvo el propio RECPAM) */
const isRestated = (a: Account) => !a.monetary && a.role !== "recpam";

export interface RestatedPart {
  month: string;
  nominal: number;
  coef: number;
  restated: number;
}
export interface RestatedAccount {
  code: string;
  name: string;
  kind: Account["kind"];
  monetary: boolean;
  nominal: number;
  restated: number;
  adjustment: number;
  parts: RestatedPart[];
}

/**
 * Reexpresa los saldos del ejercicio. Los saldos anteriores al inicio (y el
 * asiento de apertura) toman el mes anterior al inicio; el resto, el mes de su
 * fecha. Se ignoran los ajustes por inflación ya hechos del mismo ejercicio.
 */
export function restate(entries: Entry[], accounts: Account[], series: IndexSeries, start: string, end: string) {
  const closing = end.slice(0, 7);
  const opening = prevMonth(start);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const buckets = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (e.status !== "registrado" || e.date > end) continue;
    if (e.source === "ajuste_inflacion" && e.date >= start) continue;
    // El cierre del propio ejercicio no se reexpresa (se ajusta antes de cerrar)
    if ((e.source === "cierre" || e.source === "refundicion") && e.date >= start) continue;
    const before = e.date < start || e.source === "apertura";
    const month = before ? opening : e.date.slice(0, 7);
    for (const l of e.lines) {
      const a = l.code ? byCode.get(l.code) : undefined;
      if (!a) continue;
      // Los resultados de ejercicios anteriores ya están en el patrimonio: solo cuentan los del ejercicio
      if (before && (a.kind === "ingreso" || a.kind === "egreso")) continue;
      const m = buckets.get(a.code) ?? new Map<string, number>();
      m.set(month, (m.get(month) ?? 0) + l.debit - l.credit);
      buckets.set(a.code, m);
    }
  }
  const rows: RestatedAccount[] = [];
  for (const [code, months] of buckets) {
    const a = byCode.get(code)!;
    const parts = [...months.entries()]
      .filter(([, v]) => v !== 0)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([month, nominal]) => {
        const coef = isRestated(a) ? coefficient(series, month, closing) : 1;
        return { month, nominal, coef, restated: Math.round(nominal * coef) };
      });
    const nominal = parts.reduce((t, p) => t + p.nominal, 0);
    const restated = parts.reduce((t, p) => t + p.restated, 0);
    if (!parts.length) continue;
    rows.push({ code, name: a.name, kind: a.kind, monetary: !isRestated(a), nominal, restated, adjustment: restated - nominal, parts });
  }
  rows.sort((x, y) => x.code.localeCompare(y.code, "es", { numeric: true }));
  return rows;
}

/**
 * Asiento de ajuste: cada cuenta no monetaria por su diferencia (el capital va
 * a «Ajuste de capital») y el RECPAM como contrapartida. Saldo deudor que sube
 * → debe; RECPAM positivo = pérdida (debe).
 */
export function adjustmentLines(rows: RestatedAccount[], roles: { capital?: string; ajusteCapital?: { code: string; name: string }; recpam: { code: string; name: string } }) {
  const lines: { account: string; code: string; debit: number; credit: number }[] = [];
  let net = 0;
  for (const r of rows) {
    if (r.monetary || !r.adjustment) continue;
    const target = r.code === roles.capital && roles.ajusteCapital ? roles.ajusteCapital : { code: r.code, name: r.name };
    net += r.adjustment;
    lines.push({ account: target.name, code: target.code, debit: r.adjustment > 0 ? r.adjustment : 0, credit: r.adjustment < 0 ? -r.adjustment : 0 });
  }
  // Juntar líneas de la misma cuenta y lado (el capital y su ajuste)
  const merged = new Map<string, (typeof lines)[number]>();
  for (const l of lines) {
    const k = l.code;
    const p = merged.get(k);
    if (p) {
      const v = p.debit - p.credit + l.debit - l.credit;
      p.debit = v > 0 ? v : 0;
      p.credit = v < 0 ? -v : 0;
    } else merged.set(k, { ...l });
  }
  const out = [...merged.values()].filter((l) => l.debit || l.credit);
  const recpam = -net; // debe − haber de la contrapartida
  if (recpam) out.push({ account: roles.recpam.name, code: roles.recpam.code, debit: recpam > 0 ? recpam : 0, credit: recpam < 0 ? -recpam : 0 });
  return { lines: out, recpam };
}

/** Lee una serie pegada o descargada: «AAAA-MM;valor» por fila (acepta coma decimal y separador de miles) */
export function parseSeries(text: string) {
  const rows: { month: string; value: number }[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || /^[a-záéíóú ]+[;,\t]/i.test(l)) continue; // vacía o encabezado
    const cut = /[;\t]/.test(l) ? l.search(/[;\t]/) : l.indexOf(",");
    const month = cut < 0 ? l : l.slice(0, cut).trim();
    const value = cut < 0 ? "" : l.slice(cut + 1).trim();
    const v = Number((value ?? "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    const mm = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(month ?? "");
    if (!mm || !(v > 0)) errors.push(l);
    else rows.push({ month: `${mm[1]}-${mm[2]}`, value: v });
  }
  return { rows, errors };
}
