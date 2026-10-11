import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { invoice_settings, invoices } from "@/db/schema";
import { readStored } from "@/lib/uploads";
import { CBTE_TYPES, DOC_TYPES, formatCuit, IVA_CONDITIONS } from "./config";
import { fullNumber, money, qrUrl } from "./calc";

// PDF del comprobante generado por Faro: logo, color y datos de contacto del
// emisor, más todo lo obligatorio (letra y código, CAE, vencimiento del CAE y
// código QR según la especificación de ARCA). Un borrador sale marcado.

type Invoice = typeof invoices.$inferSelect;
type Settings = typeof invoice_settings.$inferSelect | null;

const hex = (h: string | null | undefined) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h ?? "") ?? ["", "1c2235"];
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const date = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

/** Texto que entra en un ancho (corta con "…") */
function fit(font: PDFFont, text: string, size: number, width: number) {
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t, size) > width) t = t.slice(0, -2) + "…";
  return t;
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function invoicePdf(inv: Invoice, s: Settings): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${CBTE_TYPES[inv.cbte_type]?.label ?? "Comprobante"} ${fullNumber(inv.point_of_sale, inv.number)}`);
  pdf.setProducer("Faro");
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hex(s?.color);
  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.42, 0.45, 0.52);
  const line = rgb(0.85, 0.86, 0.88);
  const { width, height } = page.getSize();
  const M = 40;
  const t = CBTE_TYPES[inv.cbte_type];
  const text = (p: PDFPage, str: string, x: number, y: number, size = 9, f = font, color = ink) => p.drawText(str, { x, y, size, font: f, color });

  // Banda de color de la marca
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: accent });

  // Emisor (izquierda), con logo si hay
  let y = height - 50;
  let x0 = M;
  if (s?.logo_path) {
    try {
      const { data: bytes } = await readStored(s.logo_path);
      const img = /\.png$/i.test(s.logo_path) || bytes[0] === 0x89 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min(70 / img.width, 50 / img.height);
      page.drawImage(img, { x: M, y: y - 50 * Math.min(1, scale * img.height / 50) + 8, width: img.width * scale, height: img.height * scale });
      x0 = M + img.width * scale + 12;
    } catch {
      /* sin logo si no se puede leer */
    }
  }
  const issuerName = s?.business_name ?? inv.cuit;
  text(page, fit(bold, issuerName, 13, 210 - (x0 - M)), x0, y, 13, bold);
  y -= 15;
  for (const l of [s?.address, [s?.email, s?.phone].filter(Boolean).join(" · "), s?.website].filter((v): v is string => !!v)) {
    text(page, fit(font, l, 8.5, 220 - (x0 - M)), x0, y, 8.5, font, muted);
    y -= 11;
  }

  // Letra y código (centro)
  const cx = width / 2;
  page.drawRectangle({ x: cx - 22, y: height - 92, width: 44, height: 50, borderColor: ink, borderWidth: 1.2, color: rgb(1, 1, 1) });
  text(page, t?.letter ?? "?", cx - bold.widthOfTextAtSize(t?.letter ?? "?", 28) / 2, height - 76, 28, bold);
  const code = `COD. ${String(inv.cbte_type).padStart(2, "0")}`;
  text(page, code, cx - font.widthOfTextAtSize(code, 7) / 2, height - 88, 7);
  page.drawLine({ start: { x: cx, y: height - 92 }, end: { x: cx, y: height - 170 }, color: line, thickness: 0.8 });

  // Datos del comprobante (derecha)
  const rx = cx + 30;
  let ry = height - 50;
  text(page, (t?.label ?? "Comprobante").toUpperCase(), rx, ry, 13, bold);
  ry -= 16;
  const rows: [string, string][] = [
    ["Número", fullNumber(inv.point_of_sale, inv.number)],
    ["Fecha de emisión", date(inv.issue_date)],
    ["CUIT", formatCuit(inv.cuit)],
    ["Ingresos Brutos", s?.iibb ?? "—"],
    ["Inicio de actividades", date(s?.activity_start ?? null)],
    ["Condición frente al IVA", IVA_CONDITIONS[s?.iva_condition ?? "monotributo"] ?? "—"],
  ];
  for (const [k, v] of rows) {
    text(page, k, rx, ry, 8, font, muted);
    text(page, v, rx + 110, ry, 8.5, bold);
    ry -= 12;
  }

  // Receptor
  y = height - 190;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: width - M, y: y + 12 }, color: line, thickness: 0.8 });
  text(page, "CLIENTE", M, y, 7.5, bold, muted);
  y -= 13;
  text(page, fit(bold, inv.customer_name, 11, width - 2 * M), M, y, 11, bold);
  y -= 13;
  text(page, `${DOC_TYPES[inv.customer_doc_type] ?? "Doc."} ${inv.customer_doc_type === 80 || inv.customer_doc_type === 86 ? formatCuit(inv.customer_doc_number) : inv.customer_doc_number}  ·  ${IVA_CONDITIONS[inv.customer_iva_condition] ?? inv.customer_iva_condition}`, M, y, 8.5, font, muted);
  y -= 11;
  if (inv.customer_address) {
    text(page, fit(font, inv.customer_address, 8.5, width - 2 * M), M, y, 8.5, font, muted);
    y -= 11;
  }
  if (inv.concept !== 1) {
    text(page, `Período facturado: ${date(inv.service_from)} al ${date(inv.service_to)}  ·  Vencimiento del pago: ${date(inv.payment_due)}`, M, y, 8.5, font, muted);
    y -= 11;
  }

  // Ítems
  y -= 14;
  const discriminate = t?.letter === "A" || t?.letter === "B";
  const cols = discriminate ? [M, 330, 380, 450, width - M] : [M, 360, 420, width - M];
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 18, color: accent });
  const head = discriminate ? ["Descripción", "Cant.", "Precio unit.", "IVA", "Subtotal"] : ["Descripción", "Cant.", "Precio unit.", "Subtotal"];
  head.forEach((h, i) => {
    const isLast = i === head.length - 1;
    const xx = isLast ? width - M - 6 - bold.widthOfTextAtSize(h, 8) : cols[i] + 6;
    text(page, h, xx, y + 1, 8, bold, rgb(1, 1, 1));
  });
  y -= 20;
  for (const it of inv.items) {
    const sub = it.quantity * it.unitPrice;
    const desc = wrap(font, it.description, 9, (discriminate ? 330 : 360) - M - 12);
    desc.forEach((d, i) => text(page, d, M + 6, y - i * 11, 9));
    const cells = discriminate ? [String(it.quantity), money(it.unitPrice, inv.currency), `${it.ivaRate ?? 21}%`, money(sub, inv.currency)] : [String(it.quantity), money(it.unitPrice, inv.currency), money(sub, inv.currency)];
    cells.forEach((c, i) => {
      const isLast = i === cells.length - 1;
      const xx = isLast ? width - M - 6 - font.widthOfTextAtSize(c, 9) : cols[i + 1] + 6;
      text(page, c, xx, y, 9);
    });
    y -= Math.max(1, desc.length) * 11 + 6;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: width - M, y: y + 4 }, color: line, thickness: 0.5 });
    if (y < 220) break;
  }

  // Totales
  y -= 8;
  const totals: [string, string, boolean][] = discriminate
    ? [["Neto gravado", money(Number(inv.net), inv.currency), false], ...inv.iva_breakdown.map((b) => [`IVA ${b.rate}%`, money(b.amount, inv.currency), false] as [string, string, boolean]), ["Total", money(Number(inv.total), inv.currency), true]]
    : [["Subtotal", money(Number(inv.net), inv.currency), false], ["Total", money(Number(inv.total), inv.currency), true]];
  for (const [k, v, strong] of totals) {
    const f = strong ? bold : font;
    const size = strong ? 12 : 9;
    text(page, k, width - M - 200, y, size, f, strong ? ink : muted);
    text(page, v, width - M - f.widthOfTextAtSize(v, size), y, size, f);
    y -= strong ? 18 : 13;
  }
  if (inv.currency === "DOL") text(page, `Moneda: dólares · Tipo de cambio ${Number(inv.exchange_rate)}`, width - M - 200, y, 8, font, muted);
  if (t?.letter === "C") {
    y -= 4;
    text(page, "Comprobante de un responsable monotributo: no discrimina IVA.", M, y, 8, font, muted);
  }

  // Pie: CAE y QR (o marca de borrador)
  const footY = 70;
  page.drawLine({ start: { x: M, y: footY + 70 }, end: { x: width - M, y: footY + 70 }, color: line, thickness: 0.8 });
  if (inv.status === "autorizada" && inv.cae && inv.number) {
    const url = qrUrl({ issueDate: inv.issue_date, cuit: inv.cuit, pointOfSale: inv.point_of_sale, cbteType: inv.cbte_type, number: inv.number, total: Number(inv.total), currency: inv.currency, exchangeRate: Number(inv.exchange_rate), docType: inv.customer_doc_type, docNumber: inv.customer_doc_number, cae: inv.cae });
    const png = await QRCode.toBuffer(url, { errorCorrectionLevel: "M", margin: 0, width: 240 });
    const img = await pdf.embedPng(png);
    page.drawImage(img, { x: M, y: footY - 5, width: 66, height: 66 });
    text(page, "Comprobante autorizado por ARCA", M + 80, footY + 46, 9, bold);
    text(page, `CAE: ${inv.cae}`, M + 80, footY + 32, 9);
    text(page, `Vencimiento del CAE: ${date(inv.cae_due)}`, M + 80, footY + 19, 9);
    if (inv.environment === "homologacion") text(page, "Emitido en homologación (pruebas): sin validez fiscal.", M + 80, footY + 5, 8, bold, rgb(0.6, 0.2, 0.15));
  } else {
    text(page, "BORRADOR · SIN VALIDEZ FISCAL", M, footY + 40, 14, bold, rgb(0.6, 0.2, 0.15));
    page.drawText("BORRADOR", { x: 120, y: 360, size: 90, font: bold, color: rgb(0.92, 0.88, 0.86), opacity: 0.6 });
  }
  if (s?.footer) wrap(font, s.footer, 8, 260).slice(0, 3).forEach((l, i) => text(page, l, width - M - 260, footY + 46 - i * 10, 8, font, muted));
  if (inv.payment_url) text(page, `Pagá en línea: ${fit(font, inv.payment_url, 8, 240)}`, width - M - 260, footY + 5, 8, bold, accent);
  text(page, "Generado con Faro", width - M - font.widthOfTextAtSize("Generado con Faro", 7), 24, 7, font, muted);
  return pdf.save();
}
