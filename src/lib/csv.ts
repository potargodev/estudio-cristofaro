// CSV único para todas las exportaciones. Neutraliza fórmulas: un texto que
// empieza con = + - @ (o tabulación) se abre en Excel como fórmula, y muchos
// textos vienen de terceros (mails, Mercado Pago, Tango).

const NUMERIC = /^-?\d+([.,]\d+)?$/;

interface CsvOptions {
  /** Separador de columnas (por defecto ";", el de Excel en español) */
  sep?: string;
  /** Números con coma decimal (planillas en español) */
  decimalComma?: boolean;
}

export function csvCell(v: unknown, { sep = ";", decimalComma = false }: CsvOptions = {}): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "number" ? (decimalComma ? String(v).replace(".", ",") : String(v)) : String(v);
  if (typeof v !== "number" && !NUMERIC.test(s) && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Filas → texto CSV. `bom` para que Excel lo abra en UTF-8 */
export function toCsv(rows: unknown[][], opts: CsvOptions & { bom?: boolean; eol?: string; trailingNewline?: boolean } = {}): string {
  const eol = opts.eol ?? "\r\n";
  const body = rows.map((r) => r.map((c) => csvCell(c, opts)).join(opts.sep ?? ";")).join(eol);
  return `${opts.bom ? "﻿" : ""}${body}${opts.trailingNewline ? eol : ""}`;
}
