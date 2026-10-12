import "server-only";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_entries, bitacora_insights, users } from "@/db/schema";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getPrefs } from "@/lib/prefs";
import { getSiteUrl } from "@/lib/runtime-config";
import { notify } from "@/modules/notifications/server";
import { listGoals } from "./planning";
import { listCategories } from "./server";
import { formatMoney, isoWeek } from "@/lib/format";

// Resumen semanal de un minuto (domingo): cuánto entró y salió en la semana,
// en qué se fue, cómo van las metas. En la app (aviso) y por mail.

/** Fecha de Buenos Aires (AAAA-MM-DD) de un instante, sin depender del huso del servidor */
const iso = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);


export async function weeklySummary(userId: string, end = new Date()) {
  const to = iso(end);
  const from = iso(new Date(end.getTime() - 6 * 86400000));
  const [rows, cats, goals] = await Promise.all([
    getDb().select().from(bitacora_entries).where(and(eq(bitacora_entries.user_id, userId), isNull(bitacora_entries.deleted_at), gte(bitacora_entries.date, from), lte(bitacora_entries.date, to), eq(bitacora_entries.currency, "ARS"))),
    listCategories(userId, true),
    listGoals(userId),
  ]);
  const out = rows.filter((r) => r.kind === "gasto").reduce((s, r) => s + r.amount, 0);
  const inn = rows.filter((r) => r.kind === "ingreso").reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, number>();
  for (const r of rows) if (r.kind === "gasto") byCat.set(r.category_id ?? "", (byCat.get(r.category_id ?? "") ?? 0) + r.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, v]) => `${cats.find((c) => c.id === id)?.name ?? "Sin categoría"} ${formatMoney(v, "ARS", { decimals: "none" })}`);
  const lines = [`Salió ${formatMoney(out, "ARS", { decimals: "none" })} y entró ${formatMoney(inn, "ARS", { decimals: "none" })}.`, top.length ? `En lo que más: ${top.join(", ")}.` : "No cargaste gastos esta semana.", ...goals.slice(0, 2).map((g) => `Meta «${g.name}»: ${Math.round(g.progress * 100)}%${g.weekly ? `, guardá ${formatMoney(g.weekly, "ARS", { decimals: "none" })} esta semana` : ""}.`)];
  return { from, to, out, inn, top, lines, count: rows.length };
}

/**
 * Manda el resumen a quien tuvo movimientos en las últimas semanas. Una vez
 * por persona y semana aunque la tarea corra en dos instancias o se reinicie:
 * la clave es la semana ISO y el índice único (usuario, tipo, período, ref).
 */
export async function sendWeeklySummaries(userIds: string[]) {
  let sent = 0;
  for (const id of userIds) {
    const prefs = await getPrefs(id);
    if ((prefs as { weeklySummary?: boolean }).weeklySummary === false) continue;
    const s = await weeklySummary(id);
    if (!s.count) continue;
    const [row] = await getDb()
      .insert(bitacora_insights)
      .values({ user_id: id, kind: "resumen_semanal", period: isoWeek(s.to), title: "Tu semana en un minuto", body: s.lines.join(" "), data: { desde: s.from, hasta: s.to, salio: s.out, entro: s.inn } })
      .onConflictDoNothing()
      .returning({ id: bitacora_insights.id });
    if (!row) continue;
    const [u] = await getDb().select({ email: users.email, name: users.name }).from(users).where(eq(users.id, id));
    await notify([id], { kind: "aviso", title: "Tu semana en un minuto", body: s.lines[0], href: "/bitacora" });
    if (u) await sendMail({ to: u.email, subject: "Tu semana en un minuto · Bitácora", html: mailLayout("Tu semana en un minuto", `<p>Hola, ${esc(u.name.split(" ")[0] ?? "")}:</p>${s.lines.map((l) => `<p>${esc(l)}</p>`).join("")}`, { href: `${getSiteUrl()}/bitacora`, label: "Abrir la Bitácora" }, "Faro") });
    sent++;
  }
  return sent;
}
