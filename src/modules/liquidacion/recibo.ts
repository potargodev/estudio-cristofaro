import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { enLetras, type Line } from "./core";

// Recibo de sueldo en PDF (§2.q etapa 6), con lo que pide el art. 140 de la
// LCT: empleador y CUIT, trabajador, CUIL, legajo, ingreso, categoría,
// período, conceptos remunerativos, no remunerativos y descuentos, neto en
// números y en letras, fecha de pago y el último depósito de aportes. Se
// publica en el portal para la firma conforme / no conforme.

interface ReceiptData {
  employer: { name: string; cuit: string; address: string | null };
  employee: { name: string; cuil: string; legajo: string; startDate: string | null; category: string; cct: string; area: string | null };
  period: string;
  kindLabel: string;
  payDate: string;
  payPlace: string;
  lastDeposit: string | null;
  lines: Line[];
  rem: number;
  norem: number;
  desc: number;
  net: number;
  draft: boolean;
}

const money = (cents: number) => `$ ${(cents / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const latin = (s: string) => s.replace(/[^\x20-\xFF]/g, "");

function fit(font: PDFFont, text: string, size: number, width: number) {
  let t = latin(text);
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > width) t = t.slice(0, -2) + "…";
  return t;
}

export async function receiptPdf(r: ReceiptData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Recibo ${r.employee.name} ${r.period}`);
  pdf.setProducer("Faro");
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.42, 0.45, 0.52);
  const line = rgb(0.85, 0.86, 0.88);
  const { width, height } = page.getSize();
  const M = 40;
  const T = (s: string, x: number, y: number, size = 9, f = font, color = ink) => page.drawText(latin(s), { x, y, size, font: f, color });
  const right = (s: string, xr: number, y: number, size = 9, f = font) => T(s, xr - f.widthOfTextAtSize(latin(s), size), y, size, f);

  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: rgb(0.11, 0.13, 0.21) });
  let y = height - 46;
  T(fit(bold, r.employer.name, 13, 300), M, y, 13, bold);
  right("RECIBO DE HABERES", width - M, y, 12, bold);
  y -= 14;
  T(`CUIT ${r.employer.cuit}${r.employer.address ? ` · ${r.employer.address}` : ""}`, M, y, 8.5, font, muted);
  right(`${r.kindLabel} · Período ${r.period.slice(5)}/${r.period.slice(0, 4)}`, width - M, y, 9);
  y -= 22;
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: width - M, y: y + 10 }, color: line, thickness: 0.8 });
  const rows: [string, string][] = [
    ["Apellido y nombre", r.employee.name],
    ["CUIL", r.employee.cuil],
    ["Legajo", r.employee.legajo],
    ["Fecha de ingreso", date(r.employee.startDate)],
    ["Convenio", r.employee.cct],
    ["Categoría", r.employee.category],
  ];
  rows.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? M : width / 2;
    const yy = y - Math.floor(i / 2) * 13;
    T(k, x, yy, 8, font, muted);
    T(fit(bold, v, 9, 170), x + 90, yy, 9, bold);
  });
  y -= 3 * 13 + 14;

  // Conceptos
  const cols = { qty: 300, rem: 380, norem: 460, desc: width - M };
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 18, color: rgb(0.11, 0.13, 0.21) });
  const white = rgb(1, 1, 1);
  T("Concepto", M + 6, y + 1, 8, bold, white);
  T("Cant.", cols.qty - 30, y + 1, 8, bold, white);
  T("Remunerativo", cols.rem - 62, y + 1, 8, bold, white);
  T("No remunerativo", cols.norem - 70, y + 1, 8, bold, white);
  T("Descuentos", cols.desc - 50, y + 1, 8, bold, white);
  y -= 18;
  for (const l of r.lines.filter((x) => x.kind !== "contrib")) {
    T(fit(font, l.name, 9, 220), M + 6, y, 9);
    if (l.quantity != null) right(String(l.quantity).replace(".", ","), cols.qty, y, 9);
    right(money(l.amount), l.kind === "rem" ? cols.rem : l.kind === "norem" ? cols.norem : cols.desc, y, 9);
    y -= 13;
    if (y < 230) break;
  }
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: width - M, y: y + 6 }, color: line, thickness: 0.8 });
  y -= 8;
  T("Totales", M + 6, y, 9, bold);
  right(money(r.rem), cols.rem, y, 9, bold);
  right(money(r.norem), cols.norem, y, 9, bold);
  right(money(r.desc), cols.desc, y, 9, bold);
  y -= 24;
  page.drawRectangle({ x: M, y: y - 8, width: width - 2 * M, height: 26, borderColor: ink, borderWidth: 0.8 });
  T("NETO A COBRAR", M + 8, y, 10, bold);
  right(money(r.net), width - M - 8, y, 12, bold);
  y -= 26;
  T(fit(font, `Son: ${enLetras(r.net)}`, 9, width - 2 * M), M, y, 9);
  y -= 14;
  T(`Fecha y lugar de pago: ${date(r.payDate)} · ${r.payPlace}`, M, y, 8.5, font, muted);
  y -= 12;
  T(`Último depósito de aportes: ${r.lastDeposit ?? "—"}`, M, y, 8.5, font, muted);

  // Firma (la del portal: conforme / no conforme con constancia)
  page.drawLine({ start: { x: width - M - 200, y: 120 }, end: { x: width - M, y: 120 }, color: ink, thickness: 0.6 });
  T("Firma del trabajador (en Faro: conforme o no conforme)", width - M - 200, 108, 7.5, font, muted);
  T("Recibí el importe neto de esta liquidación y un duplicado de este recibo.", M, 120, 7.5, font, muted);
  if (r.draft) page.drawText("BORRADOR", { x: 130, y: 380, size: 80, font: bold, color: rgb(0.92, 0.88, 0.86), opacity: 0.6 });
  T("Generado con Faro", width - M - font.widthOfTextAtSize("Generado con Faro", 7), 24, 7, font, muted);
  return pdf.save();
}
