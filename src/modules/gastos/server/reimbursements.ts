import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounting_expenses, memberships, reimbursements, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import type { PortalUser } from "@/lib/auth";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { can } from "@/lib/permissions";
import { getSiteUrl } from "@/lib/runtime-config";
import { checkUpload, storeUpload } from "@/lib/uploads";
import { CATEGORIES, CURRENCIES, formatMoney } from "../constants";
import { GastosError } from "./service";

// Rendición de gastos de empleados: el empleado carga un gasto "a rendir" con
// su ticket; quien gestiona las finanzas de la organización lo aprueba o lo
// rechaza y marca el reintegro. Lo aprobado pasa a los gastos de la
// organización (que ve el estudio). Todo filtra por la organización activa
// del miembro (requireMember), nunca por un id del navegador.

export type ReimbursementRow = typeof reimbursements.$inferSelect & { employee: string };

export const canApprove = (me: PortalUser) => can(me.orgRole, "finanzas.gestionar");

export async function createReimbursement(
  me: PortalUser,
  input: { description: string; amount: number; currency: string; date: string; category: string; receipt: File | null },
) {
  if (!can(me.orgRole, "gastos.rendir")) throw new GastosError("Tu rol no puede rendir gastos en esta organización.");
  const description = input.description.trim().slice(0, 140);
  if (description.length < 2) throw new GastosError("Escribí en qué se gastó.");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new GastosError("El importe tiene que ser mayor a cero.");
  if (!(CURRENCIES as readonly string[]).includes(input.currency)) throw new GastosError("Elegí una moneda válida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new GastosError("La fecha no es válida.");
  if (!input.receipt) throw new GastosError("Adjuntá el ticket o la factura.");
  const check = await checkUpload(input.receipt);
  if (!check.ok) throw new GastosError(check.error);
  const file = await storeUpload(input.receipt, me.studioId, me.organizationId);
  const [r] = await getDb()
    .insert(reimbursements)
    .values({
      studio_id: me.studioId,
      organization_id: me.organizationId,
      user_id: me.id,
      description,
      amount: input.amount,
      currency: input.currency,
      date: input.date,
      category: input.category in CATEGORIES ? input.category : "otros",
      receipt_path: file.storagePath,
      receipt_name: file.name,
      receipt_mime: file.mimeType,
    })
    .returning();
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "rendicion.crear", entityType: "rendicion", entityId: r.id, metadata: { importe: r.amount, moneda: r.currency } });
  // Aviso a quienes aprueban
  const approvers = await getDb()
    .select({ email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.user_id))
    .where(and(eq(memberships.organization_id, me.organizationId), eq(memberships.status, "activa"), eq(users.active, true)));
  const to = approvers.filter((a) => can(a.role, "finanzas.gestionar")).map((a) => a.email);
  if (to.length)
    await sendMail({
      to,
      subject: `Nueva rendición de ${me.name}: ${formatMoney(r.amount, r.currency)}`,
      html: mailLayout(`Rendición para revisar`, `<p>${esc(me.name)} rindió <strong>${esc(description)}</strong> por ${formatMoney(r.amount, r.currency)}.</p>`, {
        href: `${getSiteUrl()}/portal/rendiciones`,
        label: "Revisar rendiciones",
      }),
    });
  return r;
}

export async function listReimbursements(me: PortalUser): Promise<ReimbursementRow[]> {
  const all = canApprove(me);
  if (!all && !can(me.orgRole, "gastos.rendir")) return [];
  const rows = await getDb()
    .select({ r: reimbursements, employee: users.name })
    .from(reimbursements)
    .innerJoin(users, eq(users.id, reimbursements.user_id))
    .where(and(eq(reimbursements.organization_id, me.organizationId), eq(reimbursements.studio_id, me.studioId), all ? undefined : eq(reimbursements.user_id, me.id)))
    .orderBy(desc(reimbursements.created_at))
    .limit(300);
  return rows.map(({ r, employee }) => ({ ...r, employee }));
}

async function own(me: PortalUser, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new GastosError("Esa rendición no existe.");
  const [r] = await getDb()
    .select()
    .from(reimbursements)
    .where(and(eq(reimbursements.id, id), eq(reimbursements.organization_id, me.organizationId), eq(reimbursements.studio_id, me.studioId)));
  if (!r) {
    await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "rendicion.acceso_denegado", entityType: "rendicion", entityId: id, result: "denegado" });
    throw new GastosError("Esa rendición no existe.");
  }
  return r;
}

async function tellEmployee(r: typeof reimbursements.$inferSelect, title: string, body: string) {
  const [u] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, r.user_id));
  if (u) await sendMail({ to: u.email, subject: title, html: mailLayout(title, body, { href: `${getSiteUrl()}/portal/rendiciones`, label: "Ver mis rendiciones" }) });
}

export async function decideReimbursement(me: PortalUser, id: string, approve: boolean, reason?: string) {
  if (!canApprove(me)) throw new GastosError("Solo Administración o Dirección aprueban rendiciones.");
  const r = await own(me, id);
  if (r.status !== "pendiente") throw new GastosError("Esa rendición ya fue revisada.");
  if (r.user_id === me.id) throw new GastosError("No podés aprobar tu propia rendición: la revisa otra persona.");
  const why = reason?.trim().slice(0, 300) || null;
  if (!approve && !why) throw new GastosError("Contale a la persona por qué se rechaza.");
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(reimbursements)
      .set({ status: approve ? "aprobada" : "rechazada", decided_by: me.id, decided_at: new Date(), reason: why })
      .where(eq(reimbursements.id, r.id));
    if (approve)
      await tx
        .insert(accounting_expenses)
        .values({
          studio_id: r.studio_id,
          organization_id: r.organization_id,
          source: "rendicion",
          source_id: r.id,
          description: r.description,
          amount: r.amount,
          currency: r.currency,
          date: r.date,
          category: r.category,
          deductible: true,
          receipt_path: r.receipt_path,
          receipt_name: r.receipt_name,
          receipt_mime: r.receipt_mime,
        })
        .onConflictDoNothing();
  });
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: approve ? "rendicion.aprobar" : "rendicion.rechazar", entityType: "rendicion", entityId: r.id, metadata: { motivo: why } });
  await tellEmployee(
    r,
    approve ? `Aprobaron tu rendición: ${r.description}` : `Rechazaron tu rendición: ${r.description}`,
    approve ? `<p>Se aprobó ${formatMoney(r.amount, r.currency)}. Te avisamos cuando esté reintegrado.</p>` : `<p>Motivo: ${esc(why ?? "")}</p>`,
  );
}

export async function markReimbursed(me: PortalUser, id: string) {
  if (!canApprove(me)) throw new GastosError("Solo Administración o Dirección marcan reintegros.");
  const r = await own(me, id);
  if (r.status !== "aprobada") throw new GastosError("Solo se reintegra una rendición aprobada.");
  await getDb().update(reimbursements).set({ status: "reintegrada", reimbursed_at: new Date() }).where(eq(reimbursements.id, r.id));
  await audit({ studioId: me.studioId, organizationId: me.organizationId, actor: me, action: "rendicion.reintegrar", entityType: "rendicion", entityId: r.id });
  await tellEmployee(r, `Te reintegraron ${formatMoney(r.amount, r.currency)}`, `<p>La rendición <strong>${esc(r.description)}</strong> quedó reintegrada.</p>`);
}

/** Gastos contables de una organización (portal con finanzas.ver o backoffice del estudio) */
export async function orgExpenses(studioId: string, organizationId: string) {
  return getDb()
    .select()
    .from(accounting_expenses)
    .where(and(eq(accounting_expenses.studio_id, studioId), eq(accounting_expenses.organization_id, organizationId)))
    .orderBy(desc(accounting_expenses.date), desc(accounting_expenses.created_at))
    .limit(500);
}
