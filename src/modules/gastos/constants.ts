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
export type Currency = (typeof CURRENCIES)[number];

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
export type Recurrence = keyof typeof RECURRENCES;

export const REMINDER_FREQUENCIES = { off: "Sin recordatorios", semanal: "Cada semana", quincenal: "Cada 15 días", mensual: "Cada mes" } as const;

export const REIMBURSEMENT_STATUS = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  reintegrada: "Reintegrada",
} as const;

export const GROUP_COLORS = ["#c9a596", "#a57c6d", "#5b7aa6", "#6f9a7e", "#9b6fa6", "#c26b5a"] as const;

const formatters = new Map<string, Intl.NumberFormat>();
/** Centavos → "$ 48.000,00" (o "US$ 120,00") */
export function formatMoney(cents: number, currency = "ARS", opts: { signed?: boolean; compact?: boolean } = {}) {
  const key = `${currency}-${opts.compact ? 1 : 0}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: opts.compact ? 0 : 2,
      maximumFractionDigits: opts.compact ? 0 : 2,
    });
    formatters.set(key, f);
  }
  const s = f.format(Math.abs(cents) / 100).replace(/\s/g, " ");
  if (!opts.signed) return cents < 0 ? `-${s}` : s;
  return cents > 0 ? `+${s}` : cents < 0 ? `-${s}` : s;
}

/** Hoy en Buenos Aires (YYYY-MM-DD) */
export function todayAR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
