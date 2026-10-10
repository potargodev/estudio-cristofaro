// Bitácora: categorías predeterminadas, medios de pago y formatos (sin base).

export const DEFAULT_CATEGORIES: { key: string; name: string; kind: "gasto" | "ingreso" }[] = [
  { key: "supermercado", name: "Supermercado", kind: "gasto" },
  { key: "comida", name: "Comida y delivery", kind: "gasto" },
  { key: "transporte", name: "Transporte", kind: "gasto" },
  { key: "casa", name: "Casa y servicios", kind: "gasto" },
  { key: "salud", name: "Salud", kind: "gasto" },
  { key: "salidas", name: "Salidas", kind: "gasto" },
  { key: "suscripciones", name: "Suscripciones", kind: "gasto" },
  { key: "ropa", name: "Ropa", kind: "gasto" },
  { key: "educacion", name: "Educación", kind: "gasto" },
  { key: "otros", name: "Otros", kind: "gasto" },
  { key: "ingresos", name: "Ingresos", kind: "ingreso" },
];

export const PAYMENT_METHODS = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
  mercado_pago: "Mercado Pago",
} as const;
export type PaymentMethodKey = keyof typeof PAYMENT_METHODS;
export const isPaymentMethod = (v: unknown): v is PaymentMethodKey => typeof v === "string" && v in PAYMENT_METHODS;

export const BITACORA_CURRENCIES = ["ARS", "USD"] as const;

/** Categoría de un gasto de grupo → categoría de Bitácora */
export const GROUP_CATEGORY_MAP: Record<string, string> = {
  comida: "comida",
  supermercado: "supermercado",
  transporte: "transporte",
  alojamiento: "salidas",
  servicios: "casa",
  alquiler: "casa",
  software: "suscripciones",
};

export const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${month}-${String(last).padStart(2, "0")}` };
}
export function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** "$ 12.345,60" o "US$ 20" */
export function money(cents: number, currency = "ARS"): string {
  if (cents < 0) return `−${money(-cents, currency)}`;
  const v = cents / 100;
  const s = v.toLocaleString("es-AR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `US$ ${s}` : `$ ${s}`;
}

/** "12.345,50" · "12.345" · "1,5" · "12345.5" · "12k" → centavos (o null). Formato argentino primero */
export function parseAmount(raw: string): number | null {
  let t = raw.replace(/US\$|\$|\s/g, "").toLowerCase();
  if (!t) return null;
  let mult = 1;
  if (/^\d+([.,]\d+)?k$/.test(t)) {
    mult = 1000;
    t = t.slice(0, -1);
  }
  let n: number;
  if (t.includes(".") && t.includes(",")) n = Number(t.replace(/\./g, "").replace(",", "."));
  else if (t.includes(",")) n = /,\d{1,2}$/.test(t) ? Number(t.replace(",", ".")) : Number(t.replace(/,/g, ""));
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ""));
  else n = Number(t);
  n *= mult;
  return Number.isFinite(n) && n > 0 && n < 1e12 ? Math.round(n * 100) : null;
}
