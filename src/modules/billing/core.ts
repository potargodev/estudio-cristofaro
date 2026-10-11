// Cobros (F7), sin base ni red: firma de los webhooks de Mercado Pago,
// estado de una suscripción (prueba, activa, morosa con gracia, suspendida,
// cancelada), precio anual, ajuste periódico de abonos, recordatorios
// escalonados y liquidación al salir de una flota. Montos en centavos.

import { createHmac, timingSafeEqual } from "node:crypto";

// ───────────── Webhooks de Mercado Pago ─────────────

/**
 * Verifica el encabezado x-signature ("ts=…,v1=…") de Mercado Pago:
 * v1 = HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
 * Rechaza firmas viejas (más de `maxAgeMs`) para evitar repeticiones.
 */
export function verifySignature(header: string | null, requestId: string | null, dataId: string, secret: string, now = Date.now(), maxAgeMs = 10 * 60_000) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const tsMs = ts.length <= 10 ? Number(ts) * 1000 : Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > maxAgeMs) return false;
  const manifest = `id:${dataId.toLowerCase()};${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  const given = Buffer.from(v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** external_reference: de quién es el cobro (suscripción de Faro, honorario, flota o factura personal) */
export type ChargeRef = { kind: "sub"; id: string } | { kind: "hon"; id: string } | { kind: "flota"; id: string } | { kind: "fac"; id: string };
const UUID = /^[0-9a-f-]{36}$/i;
export const refOf = (r: ChargeRef) => `faro:${r.kind}:${r.id}`;
export function parseRef(s: string | null | undefined): ChargeRef | null {
  const m = /^faro:(sub|hon|flota|fac):([0-9a-f-]{36})$/i.exec(s ?? "");
  return m && UUID.test(m[2]) ? ({ kind: m[1].toLowerCase(), id: m[2] } as ChargeRef) : null;
}

// ───────────── Suscripciones de Faro ─────────────

export const TRIAL_DAYS = 30;
export const GRACE_DAYS = 7;
export type SubStatus = "prueba" | "activa" | "morosa" | "suspendida" | "cancelada";

export interface SubState {
  status: SubStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /** Primer cobro fallido sin regularizar */
  pastDueSince: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Estado que corresponde hoy: la prueba vence; un cobro fallido abre la
 * gracia (morosa) y al terminarla se suspende; una cancelación corre al final
 * del período pago.
 */
export function nextStatus(s: SubState, now = new Date()): SubStatus {
  if (s.status === "cancelada") return "cancelada";
  if (s.cancelAtPeriodEnd && s.currentPeriodEnd && now >= s.currentPeriodEnd) return "cancelada";
  if (s.pastDueSince) return now.getTime() - s.pastDueSince.getTime() > GRACE_DAYS * 86400000 ? "suspendida" : "morosa";
  if (s.status === "prueba" && s.trialEndsAt && now >= s.trialEndsAt) return "suspendida";
  if (s.status === "activa" && s.currentPeriodEnd && now.getTime() > s.currentPeriodEnd.getTime() + GRACE_DAYS * 86400000) return "suspendida";
  return s.status;
}

export const graceEnds = (pastDueSince: Date) => new Date(pastDueSince.getTime() + GRACE_DAYS * 86400000);

/** Suma meses respetando fin de mes (31/01 + 1 = 28 o 29/02) */
export function addMonths(d: Date, n: number) {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

/** Precio del período en pesos (centavos): mensual o anual con meses bonificados */
export function periodPrice(monthlyUsd: number, usdArs: number, interval: "mensual" | "anual", freeMonths = 2) {
  const months = interval === "anual" ? 12 - freeMonths : 1;
  return Math.round(monthlyUsd * months * usdArs * 100);
}

// ───────────── Abonos de honorarios ─────────────

export interface Adjustment {
  kind: "ninguno" | "porcentaje" | "ipc";
  /** Cada cuántos meses se ajusta */
  everyMonths: number;
  /** Porcentaje fijo por ajuste (kind porcentaje) */
  percent?: number;
}

/**
 * Importe del abono para un período: base ajustada en cada tramo cumplido
 * desde el inicio (porcentaje fijo compuesto, o la variación del IPC entre el
 * mes de inicio y el último ajuste).
 */
export function feeFor(base: number, adj: Adjustment, start: string, period: string, ipc?: (month: string) => number | null) {
  const months = monthsBetween(start, period);
  if (adj.kind === "ninguno" || months < adj.everyMonths || adj.everyMonths < 1) return base;
  const steps = Math.floor(months / adj.everyMonths);
  if (adj.kind === "porcentaje") return Math.round(base * Math.pow(1 + (adj.percent ?? 0) / 100, steps));
  const lastAdj = addMonthsStr(start, steps * adj.everyMonths);
  const from = ipc?.(prevMonth(start));
  const to = ipc?.(prevMonth(lastAdj));
  if (!from || !to) return base;
  return Math.round((base * to) / from);
}

export function monthsBetween(a: string, b: string) {
  const [ya, ma] = a.slice(0, 7).split("-").map(Number);
  const [yb, mb] = b.slice(0, 7).split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export function addMonthsStr(month: string, n: number) {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
const prevMonth = (m: string) => addMonthsStr(m, -1);

// ───────────── Recordatorios escalonados ─────────────

/** Días respecto del vencimiento: 3 antes, el día, 3, 7 y 15 después */
export const REMINDER_STEPS = [-3, 0, 3, 7, 15] as const;

/** Próximo recordatorio que toca mandar hoy (o null) */
export function dueReminder(dueDate: string, sent: number[], today: string, steps: readonly number[] = REMINDER_STEPS): number | null {
  const diff = Math.round((new Date(`${today}T12:00:00Z`).getTime() - new Date(`${dueDate}T12:00:00Z`).getTime()) / 86400000);
  const pending = steps.filter((s) => s <= diff && !sent.includes(s));
  // Solo el más reciente: si el sistema estuvo caído no se manda la ráfaga atrasada
  return pending.length ? pending[pending.length - 1] : null;
}

export const reminderTone = (step: number) => (step < 0 ? "previo" : step === 0 ? "vence_hoy" : step <= 7 ? "vencido" : "ultimo_aviso");

// ───────────── Flotas ─────────────

/**
 * Liquidación al salir de una flota: cada integrante paga solo su parte
 * (nunca deuda solidaria). Cuotas vencidas impagas + proporcional del mes en
 * curso según los días usados; lo pagado de más se devuelve.
 */
export function exitSettlement(i: { monthlyShare: number; unpaid: number; paidAhead: number; daysUsed: number; daysInMonth: number }) {
  const proportional = Math.round((i.monthlyShare * Math.min(i.daysUsed, i.daysInMonth)) / i.daysInMonth);
  const total = i.unpaid + proportional - i.paidAhead;
  return { proportional, total, refund: total < 0 ? -total : 0, due: total > 0 ? total : 0 };
}
