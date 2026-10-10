import "server-only";
import { and, eq, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { expense_groups, expense_payers, expense_shares, expenses, group_activity, group_members } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { formatMoney, todayAR } from "../constants";
import { ledgerBalances, nextDate, syncAccounting } from "./service";

// Tareas de grupos de gastos (corren solas desde instrumentation.ts y por
// /api/gastos/cron con CRON_SECRET):
// - gastos recurrentes: crea la copia del día y mueve la próxima fecha;
// - recordatorios: a quien debe, con la frecuencia del grupo y si no se dio de baja.

export async function runRecurring(today = todayAR()) {
  const db = getDb();
  const due = await db
    .select({ e: expenses, g: expense_groups })
    .from(expenses)
    .innerJoin(expense_groups, eq(expense_groups.id, expenses.group_id))
    .where(and(isNotNull(expenses.recurrence), lte(expenses.recurrence_next, today), isNull(expenses.deleted_at), isNull(expense_groups.archived_at)));
  let created = 0;
  for (const { e, g } of due) {
    let when = e.recurrence_next!;
    const [payers, shares, active] = await Promise.all([
      db.select().from(expense_payers).where(eq(expense_payers.expense_id, e.id)),
      db.select().from(expense_shares).where(eq(expense_shares.expense_id, e.id)),
      db.select({ id: group_members.id }).from(group_members).where(and(eq(group_members.group_id, g.id), eq(group_members.active, true))),
    ]);
    const ids = new Set(active.map((m) => m.id));
    if ([...payers, ...shares].some((x) => !ids.has(x.member_id))) {
      // Alguien ya no está en el grupo: se corta la recurrencia para no inventar deudas
      await db.update(expenses).set({ recurrence: null, recurrence_next: null }).where(eq(expenses.id, e.id));
      await db.insert(group_activity).values({ group_id: g.id, kind: "gasto_editado", text: `${e.description} dejó de repetirse porque cambió el grupo`, expense_id: e.id });
      continue;
    }
    for (let i = 0; i < 24 && when <= today; i++) {
      const next = nextDate(when, e.recurrence!);
      // Se "reserva" la fecha con un update condicional: si otra réplica ya la tomó, no se duplica
      const claimed = await db
        .update(expenses)
        .set({ recurrence_next: next })
        .where(and(eq(expenses.id, e.id), eq(expenses.recurrence_next, when)))
        .returning({ id: expenses.id });
      if (!claimed.length) break;
      const copy = await db.transaction(async (tx) => {
        const [c] = await tx
          .insert(expenses)
          .values({
            group_id: g.id,
            description: e.description,
            amount: e.amount,
            currency: e.currency,
            fx_rate: e.fx_rate,
            fx_source: e.fx_source,
            fx_date: e.fx_date,
            date: when,
            category: e.category,
            split_method: e.split_method,
            split_spec: e.split_spec,
            notes: e.notes,
            is_company: e.is_company,
            is_deductible: e.is_deductible,
            recurrence_parent_id: e.id,
            created_by: e.created_by,
          })
          .returning();
        await tx.insert(expense_payers).values(payers.map((p) => ({ expense_id: c.id, member_id: p.member_id, amount: p.amount })));
        await tx.insert(expense_shares).values(shares.map((s) => ({ expense_id: c.id, member_id: s.member_id, amount: s.amount })));
        await tx.insert(group_activity).values({ group_id: g.id, kind: "gasto", text: `Se cargó solo (se repite): ${e.description} · ${formatMoney(e.amount, e.currency)}`, expense_id: c.id });
        return c;
      });
      await syncAccounting(g, copy);
      await audit({ studioId: g.studio_id, organizationId: g.organization_id, actorLabel: "sistema", action: "gastos.gasto_recurrente", entityType: "gasto", entityId: copy.id, metadata: { grupo: g.id, origen: e.id }, ip: null });
      created++;
      when = next;
    }
  }
  return { created };
}

const PERIOD_DAYS: Record<string, number> = { semanal: 7, quincenal: 15, mensual: 30 };

export async function sendGroupReminders(now = new Date()) {
  const db = getDb();
  const groups = await db.select().from(expense_groups).where(and(ne(expense_groups.reminder_frequency, "off"), isNull(expense_groups.archived_at)));
  let sent = 0;
  for (const g of groups) {
    const days = PERIOD_DAYS[g.reminder_frequency];
    if (!days) continue;
    const since = g.last_reminder_at ?? g.created_at;
    if (now.getTime() - since.getTime() < days * 86400000) continue;
    const { balances } = await ledgerBalances(g);
    const members = await db.select().from(group_members).where(and(eq(group_members.group_id, g.id), eq(group_members.active, true)));
    for (const m of members) {
      if (m.reminders_opt_out || !m.email) continue;
      const debts = Object.entries(balances)
        .map(([cur, per]) => [cur, per[m.id] ?? 0] as const)
        .filter(([, v]) => v < 0);
      if (!debts.length) continue;
      const total = debts.map(([cur, v]) => formatMoney(-v, cur)).join(" y ");
      const ok = await sendMail({
        to: m.email,
        subject: `Recordatorio: debés ${total} en "${g.name}"`,
        html: mailLayout(
          `Tenés un saldo pendiente en ${g.name}`,
          `<p>Hola ${esc(m.name)}, en el grupo <strong>${esc(g.name)}</strong> debés ${esc(total)}. Desde el grupo ves a quién pagarle y podés registrar el pago.</p>${m.user_id ? "" : "<p>Entrá con el enlace personal que te pasaron.</p>"}<p style="color:#5a6176;font-size:13px">Si no querés más recordatorios de este grupo, desactivalos en Integrantes → Tus datos.</p>`,
          m.user_id ? { href: `${getSiteUrl()}/grupos/g/${g.id}`, label: "Ver el grupo" } : undefined,
          "Faro",
        ),
      });
      if (ok) sent++;
    }
    await db.update(expense_groups).set({ last_reminder_at: now }).where(eq(expense_groups.id, g.id));
  }
  return { sent };
}

export async function runGastosJobs() {
  const [r, m] = await Promise.all([runRecurring(), sendGroupReminders()]);
  return { recurrentes: r.created, recordatorios: m.sent };
}
