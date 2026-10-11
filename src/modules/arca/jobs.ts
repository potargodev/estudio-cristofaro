import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { guided_checks, obligations, studios, users } from "@/db/schema";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { FISCAL_FOOTNOTE } from "@/modules/escudo/catalog";
import { getSiteUrl } from "@/lib/runtime-config";
import { notify } from "@/modules/notifications/server";
import { checkByKey } from "./checks";
import { checksDue, dueAlerts } from "./server";

// Tareas periódicas de Faro Personal: avisos del calendario personal (mail y
// campanita, X días antes según el perfil) y recordatorios de los chequeos
// guiados. Las corre instrumentation.ts cada hora (ARCA_JOBS=off las apaga).

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function ownerOf(studioIds: string[]) {
  if (!studioIds.length) return new Map<string, { id: string; email: string; name: string }>();
  const rows = await getDb().select({ studio: studios.id, id: users.id, email: users.email, name: users.name }).from(studios).innerJoin(users, eq(users.id, studios.owner_user_id)).where(inArray(studios.id, studioIds));
  return new Map(rows.map((r) => [r.studio, r]));
}

export async function runArcaJobs() {
  const db = getDb();
  let avisos = 0;
  let chequeos = 0;
  const due = (await dueAlerts()).filter(({ o, p }) => {
    const days = Math.ceil((new Date(`${o.due_date}T12:00:00-03:00`).getTime() - Date.now()) / 86400000);
    return days <= p.alert_days;
  });
  const owners = await ownerOf([...new Set(due.map((d) => d.o.studio_id))]);
  for (const { o } of due) {
    const u = owners.get(o.studio_id);
    // Se marca antes de avisar: nunca dos avisos del mismo vencimiento
    const [claimed] = await db.update(obligations).set({ reminded_at: new Date() }).where(eq(obligations.id, o.id)).returning({ id: obligations.id });
    if (!claimed || !u) continue;
    await notify([u.id], { kind: "fiscal", title: `Vence ${o.tax} el ${fmt(o.due_date)}`, body: o.notes, href: "/facturacion/calendario", refId: o.id });
    await sendMail({ to: u.email, subject: `Vence ${o.tax} el ${fmt(o.due_date)}`, html: mailLayout(`Vence ${o.tax}`, `<p>Hola, ${esc(u.name.split(" ")[0] ?? "")}:</p><p>El <strong>${fmt(o.due_date)}</strong> vence <strong>${esc(o.tax)}</strong> (período ${esc(o.period)}). ${esc(o.notes ?? "")}</p><p style="color:#5a6176;font-size:13px">${FISCAL_FOOTNOTE}</p>`, { href: `${getSiteUrl()}/facturacion/calendario`, label: "Ver mi calendario" }, "Faro") });
    avisos++;
  }
  const checks = await checksDue();
  const owners2 = await ownerOf([...new Set(checks.map((c) => c.studio_id))]);
  for (const c of checks) {
    const def = checkByKey(c.check_key);
    await db.update(guided_checks).set({ next_reminder_at: new Date(Date.now() + c.every_days * 86400000) }).where(eq(guided_checks.id, c.id));
    const u = owners2.get(c.studio_id);
    if (!u || !def) continue;
    await notify([u.id], { kind: "fiscal", title: `Revisá: ${def.title}`, body: def.why, href: "/facturacion/chequeos", refId: c.id });
    chequeos++;
  }
  return { avisos, chequeos };
}
