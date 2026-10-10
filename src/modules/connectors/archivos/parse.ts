import "server-only";
import { readSheet } from "read-excel-file/node";
import { digitsCuit, type ExternalRow } from "../store";
import { FIELD_LABEL, type FileTemplate, type MappingField } from "./templates";

// Lectura de exportaciones (CSV o XLSX) con una plantilla de mapeo.

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function csvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** "1.234,56" o "1234.56" → número */
function amount(v: unknown) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const n = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** dd/mm/aaaa, aaaa-mm-dd o fecha de Excel → aaaa-mm-dd */
function date(v: unknown) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ar = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (ar) return `${ar[3].length === 2 ? `20${ar[3]}` : ar[3]}-${ar[2].padStart(2, "0")}-${ar[1].padStart(2, "0")}`;
  return null;
}

export interface ParsedFile {
  rows: ExternalRow[];
  columns: Partial<Record<MappingField, string>>;
  errors: string[];
  total: number;
}

export async function parseExport(file: File, template: FileTemplate, overrides: Partial<Record<MappingField, string[]>>): Promise<ParsedFile> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  let table: unknown[][];
  if (name.endsWith(".xlsx")) table = (await readSheet(buf)) as unknown[][];
  else if (name.endsWith(".csv") || name.endsWith(".txt")) table = csvRows(buf.toString("utf8").replace(/^﻿/, ""));
  else throw new Error("Subí un archivo CSV o XLSX.");
  const wanted = { ...template.columns, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v?.length)) } as Partial<Record<MappingField, string[]>>;
  // Fila de encabezados: la primera (de las 15 primeras) que tenga la columna de ID o de nombre
  const headerIdx = table.slice(0, 15).findIndex((r) => r.some((c) => [...(wanted.id ?? []), ...(wanted.name ?? [])].some((w) => norm(w) === norm(c))));
  if (headerIdx < 0) throw new Error(`No encontré los encabezados de la plantilla (por ejemplo "${wanted.id?.[0] ?? wanted.name?.[0]}"). Revisá la plantilla o el mapeo de columnas.`);
  const header = table[headerIdx].map(norm);
  const index: Partial<Record<MappingField, number>> = {};
  const columns: Partial<Record<MappingField, string>> = {};
  for (const [field, names] of Object.entries(wanted) as [MappingField, string[]][]) {
    const i = header.findIndex((h) => names.some((n) => norm(n) === h));
    if (i >= 0) {
      index[field] = i;
      columns[field] = String(table[headerIdx][i]);
    }
  }
  const errors: string[] = [];
  if (index.id === undefined && index.cuit === undefined) errors.push(`Falta una columna de ${FIELD_LABEL.id} o de CUIT.`);
  const rows: ExternalRow[] = [];
  const body = table.slice(headerIdx + 1);
  body.forEach((r, n) => {
    const get = (f: MappingField) => (index[f] === undefined ? undefined : r[index[f]!]);
    const cuit = digitsCuit(get("cuit"));
    const id = String(get("id") ?? "").trim() || cuit;
    if (!id) {
      if (errors.length < 20) errors.push(`Fila ${headerIdx + n + 2}: sin ID ni CUIT, se saltea.`);
      return;
    }
    if (index.cuit !== undefined && get("cuit") && !cuit && errors.length < 20) errors.push(`Fila ${headerIdx + n + 2}: CUIT inválido (${String(get("cuit"))}).`);
    const raw = Object.fromEntries(table[headerIdx].map((h, i) => [String(h ?? `col${i + 1}`), r[i] instanceof Date ? (r[i] as Date).toISOString().slice(0, 10) : (r[i] ?? null)]));
    rows.push({
      resource: template.resource,
      externalId: id,
      cuit,
      name: get("name") != null ? String(get("name")).trim() : null,
      date: date(get("date")),
      amount: amount(get("amount")),
      raw: { ...raw, _archivo: file.name, _fila: headerIdx + n + 2 },
    });
  });
  return { rows: rows.slice(0, 20000), columns, errors, total: body.length };
}
