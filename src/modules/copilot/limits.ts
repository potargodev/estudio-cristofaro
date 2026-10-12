import "server-only";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { copilot_messages, platform_ai, studios, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { getPlan } from "@/lib/faro/plans";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { limitsFor, type PlatformAi } from "./platform";
import { formatUsd } from "@/lib/format";

// Uso y límites de la IA de la plataforma: por usuario y mes (mensajes y
// audios según su plan) y topes globales de gasto (día y mes, en USD). Con el
// tope alcanzado, la IA se pausa para los planes gratis y sigue para los pagos.

export type Quota = { ok: true } | { ok: false; message: string; reason: "mensajes" | "audios" | "tope" };

const startOfMonthAR = () => {
  const now = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 3));
};
const startOfDayAR = () => {
  const now = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3));
};

export async function userUsage(userId: string) {
  const [r] = await getDb()
    .select({
      messages: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario')::int`,
      audios: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario' and ${copilot_messages.kind} = 'audio')::int`,
      images: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario' and ${copilot_messages.kind} in ('imagen','pdf'))::int`,
      tokensIn: sql<number>`coalesce(sum(${copilot_messages.tokens_in}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${copilot_messages.tokens_out}), 0)::int`,
      cost: sql<string>`coalesce(sum(${copilot_messages.cost_usd}), 0)`,
    })
    .from(copilot_messages)
    .where(and(eq(copilot_messages.user_id, userId), gte(copilot_messages.created_at, startOfMonthAR())));
  return { messages: r?.messages ?? 0, audios: r?.audios ?? 0, images: r?.images ?? 0, tokensIn: r?.tokensIn ?? 0, tokensOut: r?.tokensOut ?? 0, cost: Number(r?.cost ?? 0) };
}

export async function platformSpend() {
  const q = (from: Date) =>
    getDb()
      .select({ cost: sql<string>`coalesce(sum(${copilot_messages.cost_usd}), 0)`, n: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario')::int` })
      .from(copilot_messages)
      .where(gte(copilot_messages.created_at, from));
  const [[d], [m]] = await Promise.all([q(startOfDayAR()), q(startOfMonthAR())]);
  return { day: Number(d?.cost ?? 0), month: Number(m?.cost ?? 0), dayMessages: d?.n ?? 0, monthMessages: m?.n ?? 0 };
}

/** Uso del mes por usuario (para el Faro Manager): solo cantidades, nunca el contenido */
export async function usageByUser(limit = 50) {
  return getDb()
    .select({
      userId: copilot_messages.user_id,
      email: users.email,
      plan: studios.plan_key,
      messages: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario')::int`,
      audios: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario' and ${copilot_messages.kind} = 'audio')::int`,
      images: sql<number>`count(*) filter (where ${copilot_messages.role} = 'usuario' and ${copilot_messages.kind} in ('imagen','pdf'))::int`,
      tokensIn: sql<number>`coalesce(sum(${copilot_messages.tokens_in}), 0)::int`,
      tokensOut: sql<number>`coalesce(sum(${copilot_messages.tokens_out}), 0)::int`,
      cost: sql<string>`coalesce(sum(${copilot_messages.cost_usd}), 0)`,
    })
    .from(copilot_messages)
    .innerJoin(users, eq(users.id, copilot_messages.user_id))
    .innerJoin(studios, eq(studios.id, users.studioId))
    .where(gte(copilot_messages.created_at, startOfMonthAR()))
    .groupBy(copilot_messages.user_id, users.email, studios.plan_key)
    .orderBy(sql`sum(${copilot_messages.cost_usd}) desc`)
    .limit(limit);
}

/** Aviso al equipo de Faro (auditoría de plataforma y mail), como mucho uno por día */
export async function recordAlert(kind: "tope" | "free_tier", text: string) {
  const db = getDb();
  const [p] = await db.select({ at: platform_ai.cap_alerted_at }).from(platform_ai).where(eq(platform_ai.id, "default"));
  if (p?.at && Date.now() - p.at.getTime() < 24 * 3600_000) return;
  await db.update(platform_ai).set({ cap_alerted_at: new Date() }).where(eq(platform_ai.id, "default"));
  await audit({ studioId: null, actorLabel: "sistema", action: `faro.ia_alerta`, entityType: "ia_plataforma", metadata: { tipo: kind, detalle: text } });
  const team = await db.select({ email: users.email }).from(users).where(isNotNull(users.faroRole));
  if (team.length)
    await sendMail({ to: team.map((t) => t.email), subject: `Faro · IA de la plataforma: ${kind === "tope" ? "tope de gasto alcanzado" : "clave del plan gratis"}`, html: mailLayout("Alerta de la IA de la plataforma", `<p>${esc(text)}</p>`, { href: `${getSiteUrl()}/faro-manager/ia`, label: "Ver la IA de la plataforma" }, "Faro") }).catch(() => undefined);
}

/** ¿Puede usar la IA ahora? (límites de su plan y topes globales) */
export async function checkQuota(u: { id: string; studioId: string }, kind: string, p: PlatformAi): Promise<Quota> {
  const [t] = await getDb().select({ plan: studios.plan_key }).from(studios).where(eq(studios.id, u.studioId));
  const plan = getPlan(t?.plan);
  const free = !plan || plan.free;
  const spend = await platformSpend();
  const overDay = p.daily_cap_usd != null && spend.day >= Number(p.daily_cap_usd);
  const overMonth = p.monthly_cap_usd != null && spend.month >= Number(p.monthly_cap_usd);
  if (overDay || overMonth) {
    await recordAlert("tope", `Se alcanzó el tope ${overDay ? `diario (${formatUsd(Number(p.daily_cap_usd))})` : `mensual (${formatUsd(Number(p.monthly_cap_usd))})`} de la IA de la plataforma. La IA quedó pausada para los planes gratis.`).catch(() => undefined);
    if (free) return { ok: false, reason: "tope", message: "La IA de Faro está en pausa por hoy para las cuentas gratis." };
  }
  const lim = limitsFor(p, plan?.key ?? "persona_gratis");
  const used = await userUsage(u.id);
  // El mensaje actual ya está guardado: cuenta en el uso
  if (lim.messages != null && used.messages > lim.messages) return { ok: false, reason: "mensajes", message: `Llegaste a los ${lim.messages} mensajes del mes de tu plan.` };
  if (kind === "audio" && lim.audios != null && used.audios > lim.audios) return { ok: false, reason: "audios", message: `Llegaste a los ${lim.audios} audios del mes de tu plan. Escribime el gasto en texto.` };
  return { ok: true };
}
