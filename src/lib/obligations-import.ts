import "server-only";
import { readSheet } from "read-excel-file/node";

// Importación de vencimientos desde CSV o XLSX.
// Columnas esperadas (en cualquier orden, con o sin tildes): CUIT, impuesto,
// período, vencimiento, monto. La primera fila es el encabezado.

export interface ImportRow {
  line: number; // fila del archivo (1 = encabezado)
  cuit: string;
  tax: string;
  period: string; // AAAA-MM
  due_date: string; // AAAA-MM-DD
  amount: string | null; // decimal con punto, ej "12345.67"
  errors: string[];
}

type Cell = string | number | boolean | Date | null | undefined;

const COLUMNS: Record<keyof Omit<ImportRow, "line" | "errors">, string[]> = {
  cuit: ["cuit", "cuil", "cuitcliente"],
  tax: ["impuesto", "tributo", "obligacion", "concepto"],
  period: ["periodo", "per", "mes"],
  due_date: ["vencimiento", "fechadevencimiento", "fechavencimiento", "vto", "fecha"],
  amount: ["monto", "importe", "total", "saldo"],
};

const normalizeHeader = (h: Cell) =>
  String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const pad = (n: number) => String(n).padStart(2, "0");

/** Fecha de Excel (número de serie) → Date UTC */
function excelSerialToDate(n: number) {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function toDate(v: Cell): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) return toDate(excelSerialToDate(v));
  const s = String(v ?? "").trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

function valid(y: number, mo: number, d: number) {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

function toPeriod(v: Cell): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}`;
  if (typeof v === "number" && v > 20000 && v < 80000) return toPeriod(excelSerialToDate(v));
  const s = String(v ?? "").trim();
  let m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${pad(+m[2])}`;
  m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${pad(+m[1])}`;
  m = /^(\d{4})(\d{2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2]}`;
  return null;
}

/** "12.345,67", "12345.67", "$ 12.345" o un número → "12345.67" */
export function toAmount(v: Cell): string | null | undefined {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2) : undefined;
  let s = String(v).replace(/[$\s]/g, "");
  if (s === "") return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // formato argentino
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : undefined;
}

/** CSV simple con comillas; detecta separador ; , o tabulación */
function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export class ImportFileError extends Error {}

export async function parseObligationsFile(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();
  let table: Cell[][];
  if (name.endsWith(".xlsx")) {
    try {
      table = (await readSheet(Buffer.from(await file.arrayBuffer()))) as Cell[][];
    } catch {
      throw new ImportFileError("No se pudo leer el Excel. Revisá que sea un .xlsx válido.");
    }
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    table = parseCsv(await file.text());
  } else {
    throw new ImportFileError("Subí un archivo .csv o .xlsx.");
  }

  const [header, ...body] = table;
  if (!header) throw new ImportFileError("El archivo está vacío.");
  const index = {} as Record<keyof typeof COLUMNS, number>;
  const normalized = header.map(normalizeHeader);
  const missing: string[] = [];
  for (const [key, aliases] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string[]][]) {
    const i = normalized.findIndex((h) => aliases.includes(h));
    if (i === -1 && key !== "amount") missing.push(aliases[0]);
    index[key] = i;
  }
  if (missing.length) {
    throw new ImportFileError(`Faltan columnas en el encabezado: ${missing.join(", ")}. Se esperan CUIT, impuesto, período, vencimiento y monto.`);
  }

  const rows: ImportRow[] = [];
  body.forEach((cells, i) => {
    if (!cells || cells.every((c) => c == null || String(c).trim() === "")) return;
    const get = (k: keyof typeof COLUMNS) => (index[k] >= 0 ? cells[index[k]] : null);
    const errors: string[] = [];
    const cuit = String(get("cuit") ?? "").replace(/\D/g, "");
    if (cuit.length !== 11) errors.push("CUIT inválido");
    const tax = String(get("tax") ?? "").trim().slice(0, 80);
    if (!tax) errors.push("Falta el impuesto");
    const period = toPeriod(get("period"));
    if (!period) errors.push("Período inválido (usá AAAA-MM o MM/AAAA)");
    const due = toDate(get("due_date"));
    if (!due) errors.push("Vencimiento inválido (usá DD/MM/AAAA)");
    const amount = toAmount(get("amount"));
    if (amount === undefined) errors.push("Monto inválido");
    rows.push({ line: i + 2, cuit, tax, period: period ?? "", due_date: due ?? "", amount: amount ?? null, errors });
  });
  if (rows.length === 0) throw new ImportFileError("El archivo no tiene filas con datos.");
  if (rows.length > 2000) throw new ImportFileError("Máximo 2000 filas por importación.");
  return rows;
}
