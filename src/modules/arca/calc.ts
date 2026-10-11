// Cálculos de un comprobante (sin base ni red: se prueban con node --test).

import { CBTE_TYPES, IVA_RATES } from "./config";
import type { InvoiceItem } from "@/db/schema";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface InvoiceTotals {
  net: number;
  iva: number;
  exempt: number;
  total: number;
  ivaBreakdown: { rate: number; base: number; amount: number }[];
}

/**
 * Totales según la letra: en C y E no se discrimina IVA (todo va a ImpNeto);
 * en A y B el neto por alícuota y su IVA (0% suma neto con alícuota 0).
 */
export function invoiceTotals(cbteType: number, items: InvoiceItem[]): InvoiceTotals {
  const letter = CBTE_TYPES[cbteType]?.letter;
  const lines = items.map((i) => ({ base: round2(i.quantity * i.unitPrice), rate: i.ivaRate }));
  if (letter === "C" || letter === "E") {
    const net = round2(lines.reduce((s, l) => s + l.base, 0));
    return { net, iva: 0, exempt: 0, total: net, ivaBreakdown: [] };
  }
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.rate ?? 21, round2((byRate.get(l.rate ?? 21) ?? 0) + l.base));
  const ivaBreakdown = [...byRate.entries()].map(([rate, base]) => ({ rate, base, amount: round2((base * rate) / 100) })).sort((a, b) => b.rate - a.rate);
  const net = round2(ivaBreakdown.reduce((s, x) => s + x.base, 0));
  const iva = round2(ivaBreakdown.reduce((s, x) => s + x.amount, 0));
  return { net, iva, exempt: 0, total: round2(net + iva), ivaBreakdown };
}

/** Código de alícuota de ARCA */
export const ivaCode = (rate: number) => IVA_RATES[String(rate)] ?? 5;

/** Fecha AAAA-MM-DD → AAAAMMDD y viceversa */
export const toArcaDate = (d: string) => d.replace(/-/g, "");
export const fromArcaDate = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);

/**
 * URL del código QR (RG 4892, especificación de ARCA versión 1): JSON en
 * base64 con los datos del comprobante, en https://www.afip.gob.ar/fe/qr/?p=
 */
export function qrUrl(i: { issueDate: string; cuit: string; pointOfSale: number; cbteType: number; number: number; total: number; currency: string; exchangeRate: number; docType: number; docNumber: string; cae: string }) {
  const payload = {
    ver: 1,
    fecha: i.issueDate,
    cuit: Number(i.cuit),
    ptoVta: i.pointOfSale,
    tipoCmp: i.cbteType,
    nroCmp: i.number,
    importe: round2(i.total),
    moneda: i.currency,
    ctz: i.exchangeRate,
    tipoDocRec: i.docType,
    nroDocRec: Number(i.docNumber) || 0,
    tipoCodAut: "E",
    codAut: Number(i.cae),
  };
  return `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
}

/** Número completo: 00002-00000123 */
export const fullNumber = (pto: number, nro: number | null) => `${String(pto).padStart(5, "0")}-${nro == null ? "--------" : String(nro).padStart(8, "0")}`;

export const money = (n: number, currency = "PES") =>
  `${currency === "DOL" ? "US$ " : "$ "}${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
