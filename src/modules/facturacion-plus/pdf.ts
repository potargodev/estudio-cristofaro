import "server-only";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoice_settings, organizations, type commercial_docs } from "@/db/schema";
import { DOC_KINDS, type DocKind } from "./server";

// PDF de presupuestos, remitos y recibos (§2.p, B3): no son comprobantes de
// ARCA y lo dicen («Documento no válido como factura»).

type Doc = typeof commercial_docs.$inferSelect;
const ansi = (s: string) => s.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7e\xa0-\xff]/g, "");
const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d = (iso: string) => iso.split("-").reverse().join("/");

export async function commercialPdf(doc: Doc, issuer: { name: string; cuit: string; address?: string | null }, opts: { demo?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const night = rgb(0.11, 0.13, 0.21);
  const muted = rgb(0.35, 0.38, 0.46);
  let y = 800;
  const t = (s: string, x: number, size = 10, f = font, color = night) => page.drawText(ansi(s), { x, y, size, font: f, color });
  const right = (s: string, xr: number, size = 10, f = font) => page.drawText(ansi(s), { x: xr - f.widthOfTextAtSize(ansi(s), size), y, size, font: f, color: night });
  const title = DOC_KINDS[doc.kind as DocKind] ?? "Comprobante";
  t(issuer.name, 40, 14, bold);
  right(`${title.toUpperCase()} Nº ${String(doc.number).padStart(8, "0")}`, 555, 12, bold);
  y -= 16;
  t(`CUIT ${issuer.cuit}${issuer.address ? ` · ${issuer.address}` : ""}`, 40, 9, font, muted);
  right(`Fecha: ${d(doc.issue_date)}`, 555, 9);
  y -= 14;
  t("Documento no válido como factura", 40, 9, bold, rgb(0.6, 0.25, 0.2));
  if (doc.valid_until) right(`Válido hasta: ${d(doc.valid_until)}`, 555, 9);
  y -= 28;
  t("Cliente", 40, 9, bold, muted);
  y -= 14;
  t(`${doc.customer_name}${doc.customer_doc_number !== "0" ? ` · ${doc.customer_doc_type === 96 ? "DNI" : "CUIT"} ${doc.customer_doc_number}` : ""}`, 40, 11);
  if (doc.customer_address) {
    y -= 13;
    t(doc.customer_address, 40, 9, font, muted);
  }
  y -= 28;
  t("Descripción", 40, 9, bold, muted);
  right("Cantidad", 380, 9, bold);
  if (doc.kind !== "remito") {
    right("Precio", 470, 9, bold);
    right("Importe", 555, 9, bold);
  }
  y -= 6;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: muted });
  y -= 14;
  for (const it of doc.items) {
    t(it.description.slice(0, 70), 40, 10);
    right(String(it.quantity).replace(".", ","), 380, 10);
    if (doc.kind !== "remito") {
      right(money(it.unitPrice), 470, 10);
      right(money(it.quantity * it.unitPrice * (1 + (it.ivaRate ?? 0) / 100)), 555, 10);
    }
    y -= 15;
    if (y < 120) break;
  }
  if (doc.kind !== "remito") {
    y -= 8;
    page.drawLine({ start: { x: 380, y: y + 10 }, end: { x: 555, y: y + 10 }, thickness: 0.5, color: muted });
    right(`Total $ ${money(Number(doc.total))}`, 555, 12, bold);
  }
  if (doc.kind === "recibo") {
    y -= 22;
    t(`Recibimos la suma de $ ${money(Number(doc.total))}${doc.payment_method ? ` por ${doc.payment_method}` : ""}.`, 40, 10);
  }
  if (doc.kind === "remito") {
    y -= 40;
    t("Recibí conforme: ______________________   Aclaración: ______________________", 40, 9, font, muted);
  }
  if (doc.notes) {
    y -= 26;
    t(doc.notes.slice(0, 110), 40, 9, font, muted);
  }
  if (opts.demo) page.drawText("MODO DEMOSTRACION - SIN VALIDEZ", { x: 110, y: 400, size: 28, font: bold, color: rgb(0.85, 0.3, 0.25), opacity: 0.18 });
  page.drawText("Hecho con Faro", { x: 40, y: 30, size: 8, font, color: muted });
  return pdf.save();
}

/** Emisor para el PDF: los datos de facturación de esa CUIT o, si no hay, el nombre de la organización */
export async function issuerOf(doc: Pick<Doc, "studio_id" | "organization_id" | "cuit">) {
  const [st] = await getDb().select().from(invoice_settings).where(and(eq(invoice_settings.organization_id, doc.organization_id), eq(invoice_settings.cuit, doc.cuit), eq(invoice_settings.studio_id, doc.studio_id)));
  if (st) return { name: st.business_name, cuit: doc.cuit, address: st.address };
  const [o] = await getDb().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, doc.organization_id));
  return { name: o?.name ?? "", cuit: doc.cuit, address: null };
}
