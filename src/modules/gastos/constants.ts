// Etiquetas y formatos de grupos de gastos (los usan el servidor y la interfaz).

export const GROUP_TYPES = {
  personal: "Personal",
  viaje: "Viaje",
  oficina: "Oficina",
  equipo: "Equipo",
  proyecto: "Proyecto",
  socios: "Socios",
} as const;
export type GroupType = keyof typeof GROUP_TYPES;

export const CATEGORIES = {
  comida: "Comida y salidas",
  supermercado: "Supermercado",
  transporte: "Transporte",
  alojamiento: "Alojamiento",
  servicios: "Servicios",
  alquiler: "Alquiler",
  oficina: "Oficina e insumos",
  software: "Software",
  impuestos: "Impuestos y tasas",
  honorarios: "Honorarios",
  otros: "Otros",
} as const;
export type Category = keyof typeof CATEGORIES;
export const categoryName = (c: string) => CATEGORIES[c as Category] ?? "Otros";

export const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "UYU", "CLP"] as const;

export const SPLIT_METHODS = {
  iguales: "Partes iguales",
  porcentaje: "Por porcentaje",
  partes: "Por partes",
  montos: "Montos exactos",
  items: "Por ítems",
} as const;

export const FX_SOURCES = { oficial: "Dólar oficial", mep: "Dólar MEP", manual: "Cotización manual" } as const;
export type FxSource = keyof typeof FX_SOURCES;

export const SETTLEMENT_METHODS = { efectivo: "Efectivo", transferencia: "Transferencia", mercado_pago: "Mercado Pago" } as const;
export type SettlementMethodKey = keyof typeof SETTLEMENT_METHODS;

export const RECURRENCES = { semanal: "Cada semana", mensual: "Cada mes", anual: "Cada año" } as const;

export const REMINDER_FREQUENCIES = { off: "Sin recordatorios", semanal: "Cada semana", quincenal: "Cada 15 días", mensual: "Cada mes" } as const;

export const REIMBURSEMENT_STATUS = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  reintegrada: "Reintegrada",
} as const;

export const GROUP_COLORS = ["#c9a596", "#a57c6d", "#5b7aa6", "#6f9a7e", "#9b6fa6", "#c26b5a"] as const;
