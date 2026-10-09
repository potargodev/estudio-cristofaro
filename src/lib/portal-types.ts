import type { documents, obligationStatus, request_messages, requests, requestStatus, requestType } from "@/db/schema";

export type ObligationStatus = (typeof obligationStatus.enumValues)[number];
export type RequestType = (typeof requestType.enumValues)[number];
export type RequestStatus = (typeof requestStatus.enumValues)[number];
export type DocumentRow = typeof documents.$inferSelect;
export type RequestRow = typeof requests.$inferSelect;
export type RequestMessageRow = typeof request_messages.$inferSelect;

export const OBLIGATION_STATUS: Record<ObligationStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  presentado: "Presentado",
  pagado: "Pagado",
  vencido: "Vencido",
};

/** Estados que ya no requieren nada del cliente */
export const OBLIGATION_DONE: ObligationStatus[] = ["presentado", "pagado"];

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

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-09" → "septiembre 2026"; otros formatos se muestran como vienen */
export function periodLabel(p: string | null) {
  if (!p) return "Sin período";
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : p;
}

/** "2026-10-15" → "15/10/2026" */
export function dateLabel(d: string | null) {
  return d ? d.split("-").reverse().join("/") : "";
}

export const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

export function moneyLabel(n: string | number | null) {
  return n == null || n === "" ? "—" : money.format(Number(n));
}

export function todayISO() {
  // Fecha local de Argentina para comparar vencimientos
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
