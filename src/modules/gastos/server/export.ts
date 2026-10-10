import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import writeXlsxFile from "write-excel-file/node";
import { GROUP_TYPES, SETTLEMENT_METHODS, SPLIT_METHODS, categoryName, formatMoney, type GroupType } from "../constants";
import type { GroupView } from "./service";

// Exportaciones de un grupo: CSV (gastos), XLSX (gastos, pagos y saldos) y un
// resumen en PDF. Solo se generan desde la ruta autenticada que valida que
// quien pide es integrante del grupo.

const nameOf = (v: GroupView) => (id: string | null) => v.allMembers.find((m) => m.id === id)?.name ?? "—";
const amount = (cents: number) => cents / 100;

function expenseRows(v: GroupView) {
  const name = nameOf(v);
  return v.expenses.map((e) => ({
    fecha: e.date,
    descripcion: e.description,
    categoria: categoryName(e.category),
    moneda: e.currency,
    importe: amount(e.amount),
    cotizacion: e.fx_rate ? Number(e.fx_rate) : null,
    fuente: e.fx_source ?? "",
    pago: Object.entries(e.payers)
      .map(([m, a]) => `${name(m)} ${formatMoney(a, e.currency)}`)
      .join(" + "),
    reparto: SPLIT_METHODS[e.split_method],
    partes: Object.entries(e.shares)
      .map(([m, a]) => `${name(m)} ${formatMoney(a, e.currency)}`)
      .join("; "),
    empresa: e.is_company ? "Sí" : "No",
    deducible: e.is_deductible ? "Sí" : "No",
  }));
}

const HEADERS = ["Fecha", "Descripción", "Categoría", "Moneda", "Importe", "Cotización", "Fuente", "Pagó", "Reparto", "Partes", "Empresa", "Deducible"];

export function toCsv(v: GroupView) {
  const cell = (x: unknown) => {
    const s = x === null || x === undefined ? "" : typeof x === "number" ? String(x).replace(".", ",") : String(x);
    // Evita que Excel interprete fórmulas
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [HEADERS.join(";"), ...expenseRows(v).map((r) => Object.values(r).map(cell).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(v: GroupView): Promise<Buffer> {
  const name = nameOf(v);
  const bold = { fontWeight: "bold" as const };
  const exp = [HEADERS.map((h) => ({ value: h, ...bold })), ...expenseRows(v).map((r) => Object.values(r).map((x) => ({ value: x === null ? "" : x })))];
  const pays = [
    ["Fecha", "Paga", "Cobra", "Moneda", "Importe", "Medio", "Estado"].map((h) => ({ value: h, ...bold })),
    ...v.settlements.map((s) => [s.created_at.toISOString().slice(0, 10), name(s.from_member), name(s.to_member), s.currency, amount(s.amount), SETTLEMENT_METHODS[s.method], s.status].map((x) => ({ value: x }))),
  ];
  const bal = [
    ["Persona", "Moneda", "Saldo (positivo: le deben)"].map((h) => ({ value: h, ...bold })),
    ...Object.entries(v.balances).flatMap(([cur, per]) => v.members.map((m) => [m.name, cur, amount(per[m.id] ?? 0)].map((x) => ({ value: x })))),
  ];
  const buf = await writeXlsxFile([
    { data: exp as never, sheet: "Gastos" },
    { data: pays as never, sheet: "Pagos" },
    { data: bal as never, sheet: "Saldos" },
  ]).toBuffer();
  return buf as Buffer;
}

/** Texto apto para las fuentes estándar del PDF (WinAnsi) */
const ansi = (s: string) =>
  s
    .replace(/[→⇒]/g, "->")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e -ÿ]/g, "");

export async function toPdf(v: GroupView): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const night = rgb(0.11, 0.13, 0.21);
  const muted = rgb(0.35, 0.38, 0.46);
  const rose = rgb(0.49, 0.35, 0.28);
  const name = nameOf(v);
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 790;
  const line = (text: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    if (y < 60) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
    page.drawText(ansi(text).slice(0, 110), { x: opts.x ?? 50, y, size, font: opts.f ?? font, color: opts.color ?? night });
    y -= opts.gap ?? size + 6;
  };
  page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: night });
  page.drawText("FARO · Grupos de gastos", { x: 50, y: 823, size: 10, font: bold, color: rgb(0.78, 0.64, 0.4) });
  line(v.group.name, { size: 22, f: bold, gap: 26 });
  line(`${GROUP_TYPES[v.group.type as GroupType]} · ${v.members.length} personas · moneda base ${v.group.base_currency} · ${new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`, { color: muted, gap: 24 });

  line("Saldos", { size: 13, f: bold, color: rose });
  for (const [cur, per] of Object.entries(v.balances)) {
    for (const m of v.members) {
      const b = per[m.id] ?? 0;
      line(`${m.name}: ${b === 0 ? "al día" : b > 0 ? `le deben ${formatMoney(b, cur)}` : `debe ${formatMoney(-b, cur)}`}`, { x: 60 });
    }
    y -= 4;
    line(v.group.simplify_debts ? `Para quedar a mano en ${cur}:` : `Deudas en ${cur}:`, { f: bold });
    for (const t of v.transfers[cur]) line(`${name(t.from)} -> ${name(t.to)}: ${formatMoney(t.amount, cur)}`, { x: 60 });
    if (!v.transfers[cur].length) line("Nadie le debe nada a nadie.", { x: 60, color: muted });
    y -= 8;
  }
  if (!Object.keys(v.balances).length) line("Todos al día.", { color: muted });

  y -= 6;
  line(`Gastos por categoría (${v.group.base_currency})`, { size: 13, f: bold, color: rose });
  for (const [k, val] of Object.entries(v.byCategory).sort((a, b) => b[1] - a[1])) line(`${categoryName(k)}: ${formatMoney(val, v.group.base_currency)}`, { x: 60 });

  y -= 10;
  line("Gastos", { size: 13, f: bold, color: rose });
  for (const e of v.expenses.slice(0, 200)) {
    line(`${e.date}  ${e.description}  ${formatMoney(e.amount, e.currency)}`, { f: bold, size: 9.5, gap: 13 });
    line(
      `Pagó ${Object.keys(e.payers).map(name).join(" y ")} · ${SPLIT_METHODS[e.split_method]}: ${Object.entries(e.shares)
        .map(([m, a]) => `${name(m)} ${formatMoney(a, e.currency)}`)
        .join(", ")}`,
      { size: 8.5, color: muted, x: 60, gap: 15 },
    );
  }
  return pdf.save();
}
