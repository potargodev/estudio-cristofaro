import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import writeXlsxFile from "write-excel-file/node";

// Exportación de reportes tabulares a Excel y PDF (contabilidad, ajuste por
// inflación, reportes de sueldos, Libro IVA). Un reporte es una o varias
// secciones con encabezado y filas; los números van como números en Excel y
// alineados a la derecha en el PDF. Opcional: la marca «Sin validez fiscal»
// para lo generado en modo demostración (C6).

export type Cell = string | number | null;

export interface Section {
  title: string;
  header: string[];
  rows: Cell[][];
  /** Filas de total (en negrita) */
  totals?: Cell[][];
  /** Ancho relativo de cada columna en el PDF */
  widths?: number[];
}

export interface Report {
  title: string;
  subtitle?: string;
  sections: Section[];
  /** Marca de agua de demostración */
  demo?: boolean;
}

export async function reportToXlsx(r: Report): Promise<Buffer> {
  const bold = { fontWeight: "bold" as const };
  const sheets = r.sections.map((s, i) => ({
    sheet: (s.title || `Hoja ${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
    data: [
      [{ value: r.title, ...bold }],
      ...(r.subtitle ? [[{ value: r.subtitle }]] : []),
      ...(r.demo ? [[{ value: "MODO DEMOSTRACIÓN · SIN VALIDEZ FISCAL", ...bold }]] : []),
      [],
      s.header.map((h) => ({ value: h, ...bold })),
      ...s.rows.map((row) => row.map((v) => (v === null ? null : { value: v }))),
      ...(s.totals ?? []).map((row) => row.map((v) => (v === null ? null : { value: v, ...bold }))),
    ],
  }));
  const buf = await writeXlsxFile(sheets.map((s) => ({ data: s.data as never, sheet: s.sheet }))).toBuffer();
  return buf as Buffer;
}

/** Texto apto para las fuentes estándar del PDF (WinAnsi) */
const ansi = (s: string) =>
  s
    .replace(/[→⇒]/g, "->")
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "");

const fmt = (v: Cell) => (v === null ? "" : typeof v === "number" ? v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v);

export async function reportToPdf(r: Report): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const night = rgb(0.11, 0.13, 0.21);
  const muted = rgb(0.35, 0.38, 0.46);
  const rose = rgb(0.49, 0.35, 0.28);
  const W = 842;
  const H = 595;
  const left = 36;
  const usable = W - 2 * left;
  let page: PDFPage;
  let y = 0;
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: night });
    page.drawText("FARO", { x: left, y: H - 18, size: 10, font: bold, color: rgb(0.79, 0.65, 0.59) });
    page.drawText(ansi(r.title).slice(0, 120), { x: left + 46, y: H - 18, size: 9, font, color: rgb(0.97, 0.96, 0.95) });
    if (r.demo) page.drawText("MODO DEMOSTRACION - SIN VALIDEZ FISCAL", { x: W / 2 - 230, y: H / 2, size: 26, font: bold, color: rgb(0.85, 0.3, 0.25), opacity: 0.18, rotate: degrees(20) });
    y = H - 50;
  };
  newPage();
  const text = (t: string, x: number, size: number, f: PDFFont, color = night, right?: number) => {
    const s = ansi(t);
    let out = s;
    const max = right ?? usable;
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > max) out = `${out.slice(0, -2)}.`;
    const w = f.widthOfTextAtSize(out, size);
    page.drawText(out, { x: right !== undefined ? x + right - w : x, y, size, font: f, color });
  };
  text(r.title, left, 16, bold);
  y -= 18;
  if (r.subtitle) {
    text(r.subtitle, left, 9, font, muted);
    y -= 16;
  }
  for (const s of r.sections) {
    if (y < 90) newPage();
    y -= 6;
    text(s.title, left, 11, bold, rose);
    y -= 16;
    const weights = s.widths ?? s.header.map((_, i) => (i === 0 ? 3 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    const cols = weights.map((w) => (w / total) * usable);
    const numeric = s.header.map((_, i) => [...s.rows, ...(s.totals ?? [])].some((row) => typeof row[i] === "number"));
    const row = (cells: Cell[], f: PDFFont, color = night) => {
      if (y < 40) {
        newPage();
        head();
      }
      let x = left;
      cells.forEach((c, i) => {
        text(fmt(c), x + 2, 8, f, color, numeric[i] ? cols[i] - 6 : undefined);
        x += cols[i];
      });
      y -= 12;
    };
    const head = () => {
      row(s.header, bold, muted);
      page.drawLine({ start: { x: left, y: y + 9 }, end: { x: left + usable, y: y + 9 }, thickness: 0.5, color: muted });
    };
    head();
    for (const r2 of s.rows) row(r2, font);
    for (const t of s.totals ?? []) row(t, bold);
    y -= 8;
  }
  return pdf.save();
}

/** Respuesta de descarga para un reporte */
export async function reportResponse(r: Report, format: string, fileName: string) {
  const safe = fileName.replace(/[^\w.-]+/g, "-").slice(0, 80);
  if (format === "pdf") return new Response(new Uint8Array(await reportToPdf(r)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safe}.pdf"`, "Cache-Control": "private, no-store" } });
  return new Response(new Uint8Array(await reportToXlsx(r)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${safe}.xlsx"`, "Cache-Control": "private, no-store" } });
}
