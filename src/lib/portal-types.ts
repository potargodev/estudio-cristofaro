import type { documents, obligationStatus, requestStatus, requestType } from "@/db/schema";
import { formatPeriod } from "@/lib/format";

export type ObligationStatus = (typeof obligationStatus.enumValues)[number];
export type RequestType = (typeof requestType.enumValues)[number];
export type RequestStatus = (typeof requestStatus.enumValues)[number];
export type DocumentRow = typeof documents.$inferSelect;

export const OBLIGATION_STATUS: Record<ObligationStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  presentado: "Presentado",
  pagado: "Pagado",
  vencido: "Vencido",
};

export const REQUEST_TYPES: Record<RequestType, string> = {
  consulta: "Consulta",
  factura: "Pedido de factura",
  empleado: "Alta o baja de empleado",
  otro: "Otro",
};

export const REQUEST_STATUS: Record<RequestStatus, string> = {
  abierta: "Abierta",
  en_curso: "En curso",
  resuelta: "Resuelta",
};

export const DOCUMENT_CATEGORIES: Record<string, string> = {
  comprobantes: "Comprobantes",
  constancias: "Constancias",
  ddjj: "Declaraciones juradas",
  recibos: "Recibos de sueldo",
  vep: "VEP y boletas de pago",
  balances: "Balances e informes",
  solicitud: "Adjuntos de solicitudes",
  otro: "Otro",
};

export function categoryLabel(c: string | null) {
  return c ? (DOCUMENT_CATEGORIES[c] ?? c) : "Sin categoría";
}

/** "2026-09" → "septiembre 2026"; otros formatos se muestran como vienen */
export function periodLabel(p: string | null) {
  return p ? formatPeriod(p) : "Sin período";
}
