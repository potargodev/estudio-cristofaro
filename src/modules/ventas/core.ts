// Ventas para facturar (§2.p, B7): reglas puras. Cada pedido pagado de una
// tienda (Mercado Libre, Tiendanube, Empretienda, Shopify, WooCommerce,
// VTEX, Mercado Pago o la tienda física) se factura por venta o en un
// resumen diario a consumidor final; una devolución o cancelación de algo ya
// facturado genera la nota de crédito. Los precios de las tiendas son finales
// (con IVA).

import { CBTE_TYPES } from "@/modules/arca/config";

export const BILLING_MODES = { ninguna: "No facturar", por_venta: "Una factura por venta", resumen_diario: "Un resumen por día (consumidor final)" } as const;
export type BillingMode = keyof typeof BILLING_MODES;
export const isBillingMode = (m: string): m is BillingMode => m in BILLING_MODES;

export const SALE_STATUS: Record<string, { label: string; tone: "ok" | "progress" | "danger" | "neutral" }> = {
  pendiente: { label: "Para facturar", tone: "progress" },
  borrador: { label: "Borrador", tone: "neutral" },
  facturada: { label: "Facturada", tone: "ok" },
  en_cola: { label: "En cola (ARCA)", tone: "progress" },
  a_anular: { label: "Devuelta: falta la nota de crédito", tone: "danger" },
  nc_borrador: { label: "Nota de crédito en borrador", tone: "progress" },
  anulada: { label: "Anulada con nota de crédito", tone: "neutral" },
  ignorada: { label: "No se factura", tone: "neutral" },
  error: { label: "Con error", tone: "danger" },
};

type Line = { title: string; qty: number; price: number };

/** Total del pedido (precio final por cantidad) */
export const orderTotal = (lines: Line[]) => Math.round(lines.reduce((t, l) => t + l.qty * l.price, 0) * 100) / 100;

/** Comprador del pedido, si la tienda lo manda: con CUIT o DNI; si no, consumidor final */
export function buyerOf(raw: unknown) {
  const b = ((raw as { buyer?: Record<string, unknown> } | null)?.buyer ?? null) as Record<string, unknown> | null;
  const doc = String(b?.doc_number ?? "").replace(/\D/g, "");
  const name = String(b?.name ?? "").trim().slice(0, 160);
  if (doc.length === 11) return { docType: 80, docNumber: doc, name: name || doc, ivaCondition: ["responsable_inscripto", "monotributo", "exento"].includes(String(b?.iva_condition)) ? String(b?.iva_condition) : "consumidor_final" };
  if (doc.length >= 7 && doc.length <= 8) return { docType: 96, docNumber: doc, name: name || "Consumidor final", ivaCondition: "consumidor_final" };
  return { docType: 99, docNumber: "0", name: name || "Consumidor final", ivaCondition: "consumidor_final" };
}

/** Ítems del comprobante: el precio de la tienda es final; si el emisor discrimina IVA, se saca el 21 % (a validar por producto) */
export function itemsOf(lines: Line[], discriminates: boolean, suffix = "") {
  return lines.map((l) => ({ description: `${l.title}${suffix}`.slice(0, 200), quantity: l.qty, unitPrice: discriminates ? Math.round((l.price / 1.21) * 100) / 100 : l.price, ivaRate: 21 }));
}

/** Nota de crédito de la misma letra que la factura */
export function creditNoteFor(cbteType: number) {
  const t = CBTE_TYPES[cbteType];
  const hit = Object.entries(CBTE_TYPES).find(([, x]) => x.letter === t?.letter && x.kind === "nota_credito" && !!x.fce === !!t?.fce);
  return hit ? Number(hit[0]) : null;
}

/** Día (AAAA-MM-DD, hora de Buenos Aires) de un pedido */
export const dayOf = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
