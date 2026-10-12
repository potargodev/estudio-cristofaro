// Formato único de montos, números y fechas para toda la app (servidor y
// navegador). Todo en español de Argentina y con la hora de Buenos Aires: el
// servidor corre en UTC y una fecha sin zona se mostraría corrida.

export const TZ = "America/Argentina/Buenos_Aires";

// ───────────── Montos ─────────────

type Decimals = "fixed" | "auto" | "none";
export interface MoneyOptions {
  /** fixed: siempre 2 decimales (por defecto) · auto: solo si hay centavos · none: redondeado */
  decimals?: Decimals;
  /** +$ 10 / -$ 10 */
  signed?: boolean;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(min: number, max: number) {
  const key = `${min}-${max}`;
  let f = numberFormats.get(key);
  if (!f) numberFormats.set(key, (f = new Intl.NumberFormat("es-AR", { minimumFractionDigits: min, maximumFractionDigits: max })));
  return f;
}

/** Símbolo según la moneda (acepta los códigos de ARCA: PES y DOL) */
function symbol(currency: string) {
  if (currency === "ARS" || currency === "PES") return "$";
  if (currency === "USD" || currency === "DOL") return "US$";
  return currency;
}

/** Pesos (o la moneda indicada) → "$ 48.000,00", "US$ 120,00" */
export function formatAmount(value: number, currency = "ARS", opts: MoneyOptions = {}): string {
  const d = opts.decimals ?? "fixed";
  const abs = Math.abs(value);
  const digits = d === "none" ? [0, 0] : d === "auto" ? [Number.isInteger(Math.round(abs * 100) / 100) ? 0 : 2, 2] : [2, 2];
  const s = `${symbol(currency)} ${numberFormat(digits[0], digits[1]).format(d === "none" ? Math.round(abs) : abs)}`;
  if (opts.signed && value > 0) return `+${s}`;
  return value < 0 ? `-${s}` : s;
}

/** Centavos enteros (como se guardan en la base) → "$ 48.000,00" */
export const formatMoney = (cents: number, currency = "ARS", opts: MoneyOptions = {}) => formatAmount(cents / 100, currency, opts);

/** Importe que viene como texto o null de la base (numeric) → "$ 1.234,56" o "—" */
export function formatAmountOrDash(value: string | number | null | undefined, currency = "ARS", opts: MoneyOptions = {}): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? formatAmount(n, currency, opts) : "—";
}

/** Dólares con hasta `max` decimales (costos de IA): "US$ 0,0042" */
export const formatUsd = (n: number, max = 2) => `US$ ${numberFormat(2, Math.max(2, max)).format(n)}`;

/** Número entero o con decimales: "1.234" · "12,5" */
export const formatNumber = (n: number, maxDecimals = 0) => numberFormat(0, maxDecimals).format(n);

// ───────────── Fechas ─────────────

const DATE_STYLES = {
  /** 12 oct 2026 */
  date: { day: "numeric", month: "short", year: "numeric" },
  /** 12 oct */
  short: { day: "numeric", month: "short" },
  /** 12 de octubre de 2026 */
  long: { day: "numeric", month: "long", year: "numeric" },
  /** 12/10/2026 */
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  /** 12 oct 2026, 14:30 */
  dateTime: { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  /** 12 oct, 14:30 */
  shortTime: { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  /** 14:30 */
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  /** lunes 12 de octubre */
  weekday: { weekday: "long", day: "numeric", month: "long" },
  /** octubre de 2026 */
  month: { month: "long", year: "numeric" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

const dateFormats = new Map<DateStyle, Intl.DateTimeFormat>();

/**
 * Fecha u hora en Buenos Aires. Acepta Date, ISO o "YYYY-MM-DD"; un día suelto
 * (sin hora) se toma como ese día calendario, sin correrse por la zona.
 */
export function formatDate(value: Date | string | number | null | undefined, style: DateStyle = "date"): string {
  if (value == null || value === "") return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00-03:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  let f = dateFormats.get(style);
  if (!f) dateFormats.set(style, (f = new Intl.DateTimeFormat("es-AR", { ...DATE_STYLES[style], timeZone: TZ })));
  return f.format(d);
}

/** Hoy en Buenos Aires (YYYY-MM-DD) */
export const todayAR = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
