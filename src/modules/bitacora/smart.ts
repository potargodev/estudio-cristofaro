import { formatMoney } from "@/lib/format";
// Inteligencia de Bitácora (docs/faro-producto.md §2.g), sin base ni red: se
// prueba con node --test. Montos en centavos.

export interface Mov {
  id?: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  date: string; // AAAA-MM-DD
  description: string;
  categoryId: string | null;
  categoryKey?: string | null;
  /** Hora local (0-23) en que se cargó, si se sabe */
  hour?: number | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => new Date(`${s}T12:00:00`);

// ───────────── Sobres ─────────────

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Presupuesto sugerido por categoría: la mediana de lo gastado en los últimos
 * meses completos (hasta 3), redondeada hacia arriba a $1.000. Solo con al
 * menos un mes con gastos en la categoría.
 */
export function suggestBudgets(byCategory: Record<string, number[]>) {
  const out: Record<string, number> = {};
  for (const [cat, months] of Object.entries(byCategory)) {
    const used = months.filter((x) => x > 0).slice(-3);
    if (!used.length) continue;
    out[cat] = Math.ceil(median(used) / 100000) * 100000;
  }
  return out;
}

// ───────────── Gastos fijos y suscripciones ─────────────

const STOP = new Set(["pago", "compra", "debito", "débito", "automatico", "automático", "de", "del", "la", "el", "en", "con", "por", "cuota", "mensual", "suscripcion", "suscripción"]);

/** Clave normalizada de un comercio ("NETFLIX.COM 1234" → "netflix") */
export function merchantKey(description: string) {
  const words = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.(com|ar|net)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return words.slice(0, 2).join(" ");
}

const SUBSCRIPTION = /netflix|spotify|disney|hbo|max\b|prime|youtube|apple|icloud|google one|paramount|star\+|crunchyroll|chatgpt|openai|adobe|canva|microsoft|office|dropbox|notion|figma|gym|gimnasio|megatlon/;

interface Recurring {
  key: string;
  label: string;
  categoryId: string | null;
  kind: "fijo" | "suscripcion";
  currency: string;
  avgAmount: number;
  lastAmount: number;
  lastDate: string;
  nextDate: string;
  months: number;
  priceChangePct: number | null;
}

/**
 * Detecta gastos que se repiten todos los meses: mismo comercio en al menos 3
 * meses distintos (o 2 si es una suscripción conocida), con montos parecidos
 * (±35%). Marca el aumento si el último pago supera en 10% o más al promedio
 * anterior.
 */
export function detectRecurring(movs: Mov[], today = new Date()): Recurring[] {
  const groups = new Map<string, Mov[]>();
  for (const m of movs) {
    if (m.kind !== "gasto" || m.amount <= 0) continue;
    const k = merchantKey(m.description);
    if (!k) continue;
    groups.set(`${k}|${m.currency}`, [...(groups.get(`${k}|${m.currency}`) ?? []), m]);
  }
  const out: Recurring[] = [];
  for (const [gk, list] of groups) {
    const key = gk.split("|")[0];
    const byMonth = new Map<string, Mov>();
    for (const m of [...list].sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(m.date.slice(0, 7), m);
    const months = [...byMonth.values()];
    const isSub = SUBSCRIPTION.test(key) || months.some((m) => m.categoryKey === "suscripciones");
    if (months.length < (isSub ? 2 : 3)) continue;
    const amounts = months.map((m) => m.amount);
    const prev = amounts.slice(0, -1);
    const avgPrev = prev.reduce((s, x) => s + x, 0) / prev.length;
    const avg = amounts.reduce((s, x) => s + x, 0) / amounts.length;
    if (prev.some((x) => Math.abs(x - avgPrev) / avgPrev > 0.35)) continue;
    const last = months[months.length - 1];
    // Si el último pago fue hace más de 2 meses, dejó de repetirse
    if ((today.getTime() - parse(last.date).getTime()) / 86400000 > 62) continue;
    const next = parse(last.date);
    next.setMonth(next.getMonth() + 1);
    const change = (last.amount - avgPrev) / avgPrev;
    out.push({
      key,
      label: last.description.slice(0, 60),
      categoryId: last.categoryId,
      kind: isSub ? "suscripcion" : "fijo",
      currency: last.currency,
      avgAmount: Math.round(avg),
      lastAmount: last.amount,
      lastDate: last.date,
      nextDate: iso(next),
      months: months.length,
      priceChangePct: change >= 0.1 ? Math.round(change * 1000) / 10 : null,
    });
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate));
}

// ───────────── Fugas ─────────────

interface Leak {
  kind: "delivery_noche" | "finde_cobro" | "suscripcion_olvidada";
  title: string;
  body: string;
  data: Record<string, unknown>;
}

const DELIVERY = /rappi|pedidos ?ya|uber ?eats|delivery|glovo|mcdonald|burger|pizza|empanadas|sushi/i;

/**
 * Patrones donde la plata se escapa, con un aviso amable y preventivo:
 * - delivery de noche (21 a 3 h) cuatro o más veces en los últimos 30 días;
 * - el fin de semana después de cobrar se gasta mucho más que un finde común;
 * - suscripciones que se pagan hace 3+ meses y que nadie confirmó que use.
 */
export function detectLeaks(movs: Mov[], recurring: (Recurring & { stillUsed?: boolean | null })[], today = new Date()): Leak[] {
  const out: Leak[] = [];
  const since = iso(new Date(today.getTime() - 30 * 86400000));
  const night = movs.filter((m) => m.kind === "gasto" && m.date >= since && m.hour != null && (m.hour >= 21 || m.hour < 3) && (DELIVERY.test(m.description) || m.categoryKey === "comida"));
  if (night.length >= 4) {
    const total = night.reduce((s, m) => s + m.amount, 0);
    out.push({ kind: "delivery_noche", title: "El delivery de noche suma", body: `En el último mes pediste ${night.length} veces de noche: ${formatMoney(total, "ARS", { decimals: "none" })}. ¿Probás dejar algo listo para esas noches?`, data: { veces: night.length, total } });
  }
  // Fines de semana (viernes a domingo) y si hubo un ingreso en los 4 días anteriores
  const weekends = new Map<string, { total: number; afterPay: boolean }>();
  const incomes = movs.filter((m) => m.kind === "ingreso").map((m) => parse(m.date).getTime());
  for (const m of movs) {
    if (m.kind !== "gasto") continue;
    const d = parse(m.date);
    const dow = d.getDay();
    if (![5, 6, 0].includes(dow)) continue;
    const friday = new Date(d);
    friday.setDate(d.getDate() - (dow === 0 ? 2 : dow - 5));
    const k = iso(friday);
    const w = weekends.get(k) ?? { total: 0, afterPay: incomes.some((t) => t <= friday.getTime() + 86400000 && friday.getTime() - t <= 4 * 86400000) };
    w.total += m.amount;
    weekends.set(k, w);
  }
  const paid = [...weekends.values()].filter((w) => w.afterPay);
  const normal = [...weekends.values()].filter((w) => !w.afterPay);
  if (paid.length >= 1 && normal.length >= 2) {
    const a = paid.reduce((s, w) => s + w.total, 0) / paid.length;
    const b = normal.reduce((s, w) => s + w.total, 0) / normal.length;
    if (b > 0 && a / b >= 1.5)
      out.push({ kind: "finde_cobro", title: "El finde después de cobrar", body: `Los fines de semana después de cobrar gastás en promedio ${formatMoney(a, "ARS", { decimals: "none" })}, contra ${formatMoney(b, "ARS", { decimals: "none" })} un finde común. Te avisamos el viernes que cobres para que lo tengas en cuenta.`, data: { despues_de_cobrar: Math.round(a), comun: Math.round(b), veces: Math.round((a / b) * 10) / 10 } });
  }
  for (const r of recurring) {
    if (r.kind === "suscripcion" && r.months >= 3 && r.stillUsed == null)
      out.push({ kind: "suscripcion_olvidada", title: `¿Seguís usando ${r.label}?`, body: `Hace ${r.months} meses que pagás ${formatMoney(r.lastAmount, "ARS", { decimals: "none" })} por mes. Si no la usás, darla de baja te ahorra ${formatMoney(r.lastAmount * 12, "ARS", { decimals: "none" })} por año.`, data: { key: r.key, mensual: r.lastAmount } });
  }
  return out;
}

// ───────────── Metas y valores reales ─────────────

/** Ahorro sugerido por semana para llegar a la meta en la fecha (o en 6 meses si no tiene) */
export function weeklySaving(target: number, saved: number, deadline: string | null, today = new Date()) {
  const left = Math.max(0, target - saved);
  if (!left) return 0;
  const end = deadline ? parse(deadline) : new Date(today.getTime() + 182 * 86400000);
  const weeks = Math.max(1, Math.ceil((end.getTime() - today.getTime()) / (7 * 86400000)));
  return Math.ceil(left / weeks / 100) * 100;
}

/** Monto ajustado por inflación a pesos del mes de referencia (IPC) */
export function realValue(amount: number, ipcThen: number | null, ipcNow: number | null) {
  if (!ipcThen || !ipcNow) return null;
  return Math.round((amount * ipcNow) / ipcThen);
}

// ───────────── Importación de resúmenes ─────────────

/** CSV con separador detectado (coma, punto y coma o tab) y comillas */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  const first = clean.split("\n")[0] ?? "";
  const sep = [";", "\t", ","].map((s) => [s, first.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (c === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((x) => x !== ""));
}

/** Número argentino o internacional: "1.234,56", "-1234.56", "$ 1.234" → centavos */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d,.\-()]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-") || s.startsWith("(") || /^\(.*\)$/.test(raw.trim());
  s = s.replace(/[-()]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && lastComma !== -1) s = s.replace(/,/g, "");
  else if (lastComma === -1 && (s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  else if (lastComma === -1 && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(".", "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (negative ? -1 : 1);
}

/** Fecha en dd/mm/aaaa, dd-mm-aa, aaaa-mm-dd o dd/mm (año actual) */
export function parseDate(raw: string, year = new Date().getFullYear()): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(s);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
  const mo = Number(m[2]);
  const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export interface Mapping {
  date: number;
  description: number;
  /** Una columna con signo, o débito y crédito separados */
  amount?: number;
  debit?: number;
  credit?: number;
  /** El resumen trae los gastos en positivo (tarjetas) */
  positiveIsExpense?: boolean;
  skipHeader?: boolean;
}

export interface ImportRow {
  date: string;
  description: string;
  amount: number;
  kind: "gasto" | "ingreso";
  externalId: string;
  raw: string[];
  duplicate?: boolean;
}

/** Convierte las filas con el mapeo elegido (filas inválidas se descartan) */
export function mapRows(rows: string[][], map: Mapping): ImportRow[] {
  const body = map.skipHeader ? rows.slice(1) : rows;
  const out: ImportRow[] = [];
  for (const r of body) {
    const date = parseDate(r[map.date] ?? "");
    const description = (r[map.description] ?? "").trim();
    let signed: number | null = null;
    if (map.amount != null) signed = parseAmount(r[map.amount] ?? "");
    else {
      const d = parseAmount(r[map.debit ?? -1] ?? "");
      const c = parseAmount(r[map.credit ?? -1] ?? "");
      if (d) signed = -Math.abs(d);
      else if (c) signed = Math.abs(c);
    }
    if (!date || !description || !signed) continue;
    if (map.positiveIsExpense) signed = -signed;
    out.push({ date, description: description.slice(0, 160), amount: Math.abs(signed), kind: signed < 0 ? "gasto" : "ingreso", externalId: rowId(date, description, signed), raw: r });
  }
  return out;
}

/** Huella de una fila para detectar duplicados */
function rowId(date: string, description: string, amount: number) {
  const s = `${date}|${merchantKey(description) || description.toLowerCase()}|${amount}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
}

/** Líneas de un PDF con texto: fecha al principio y un importe al final */
export function rowsFromPdfText(text: string, year = new Date().getFullYear()): string[][] {
  const out: string[][] = [];
  for (const line of text.split(/\n/)) {
    const m = /^\s*(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\s+(.+?)\s+(-?\$?\s?[\d.]+,\d{2}-?)\s*$/.exec(line);
    if (!m || !parseDate(m[1], year)) continue;
    const amount = m[3].endsWith("-") ? `-${m[3].slice(0, -1)}` : m[3];
    out.push([m[1], m[2].trim(), amount]);
  }
  return out;
}

/** Formato conocido: el CSV de movimientos de Mercado Pago (reporte de liquidaciones) */
export function mercadoPagoMapping(header: string[]): Mapping | null {
  const h = header.map((x) => x.toUpperCase().trim());
  const date = h.findIndex((x) => x === "RELEASE_DATE" || x === "DATE" || x === "FECHA");
  const desc = h.findIndex((x) => x === "TRANSACTION_TYPE" || x === "DESCRIPTION" || x === "DESCRIPCIÓN" || x === "DETALLE");
  const amount = h.findIndex((x) => x === "TRANSACTION_NET_AMOUNT" || x === "NET_AMOUNT" || x === "IMPORTE" || x === "MONTO");
  if (date < 0 || desc < 0 || amount < 0) return null;
  // Columnas propias del reporte de Mercado Pago (las genéricas solas son de cualquier banco)
  if (!h.some((x) => ["RELEASE_DATE", "TRANSACTION_TYPE", "TRANSACTION_NET_AMOUNT", "NET_AMOUNT", "REFERENCE_ID", "SOURCE_ID"].includes(x))) return null;
  return { date, description: desc, amount, skipHeader: true };
}

// ───────────── Mails (Gmail) ─────────────

interface MailProposal {
  detected: "servicio" | "suscripcion" | "resumen_tarjeta" | "factura";
  description: string;
  amount: number | null;
  categoryHint: string;
}

const SERVICES: [RegExp, string][] = [
  [/edenor|edesur|epe|edea|edelap|epec/i, "Luz"],
  [/metrogas|naturgy|camuzzi|ecogas|litoral gas/i, "Gas"],
  [/aysa|aguas|absa/i, "Agua"],
  [/fibertel|telecentro|personal|movistar|claro|telecom|iplan|starlink/i, "Internet y teléfono"],
  [/abl|agip|arba|municipalidad|inmobiliario/i, "Impuestos de la casa"],
];

/**
 * Detecta en un mail si es una factura de servicio, una suscripción o un
 * resumen de tarjeta, y el importe ("Total a pagar: $ 12.345,67"). Solo
 * propone: la persona acepta o descarta.
 */
export function detectFromMail(m: { from: string; subject: string; snippet: string }): MailProposal | null {
  const text = `${m.from} ${m.subject} ${m.snippet}`;
  const amountMatch = /(?:total(?: a pagar)?|importe|monto|saldo(?: actual)?|pagar|cobramos|cargo)[^\d$]{0,20}\$?\s?(?:ARS\s?)?([\d.]+,\d{2}|[\d.]+)/i.exec(text) ?? /\$\s?([\d.]+,\d{2})/.exec(text);
  const amount = amountMatch ? parseAmount(amountMatch[1]) : null;
  if (/resumen de (?:tu )?(?:cuenta|tarjeta)|resumen de visa|resumen de mastercard|tu resumen/i.test(text)) return { detected: "resumen_tarjeta", description: `Resumen de tarjeta · ${m.from.replace(/<.*>/, "").trim()}`, amount, categoryHint: "otros" };
  for (const [re, label] of SERVICES) if (re.test(text) && /factura|vencimiento|pagar|total/i.test(text)) return { detected: "servicio", description: `${label} · ${m.from.replace(/<.*>/, "").trim()}`, amount, categoryHint: "casa" };
  if (SUBSCRIPTION.test(text.toLowerCase()) && /(pago|recibo|renov|suscrip|factura|cobro)/i.test(text)) return { detected: "suscripcion", description: m.subject.slice(0, 80), amount, categoryHint: "suscripciones" };
  if (/factura (?:electr[oó]nica|n[ºo°]?)|comprobante de pago/i.test(text) && amount) return { detected: "factura", description: m.subject.slice(0, 80), amount, categoryHint: "otros" };
  return null;
}
