import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounting_expenses, expenses, reimbursements, settlements } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser, getMemberships } from "@/lib/auth";
import { isUuid } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { isStudioRole } from "@/lib/roles";
import { readStored } from "@/lib/uploads";
import { auditActor, memberOf } from "@/modules/gastos/server/actor";
import { getGastosActor } from "@/modules/gastos/server/session";

export const dynamic = "force-dynamic";

const notFound = () => new Response("No encontrado", { status: 404 });

interface Target {
  path: string | null;
  name: string | null;
  mime: string | null;
  studioId: string;
  organizationId: string | null;
}

/**
 * Comprobantes de gastos compartidos, pagos, rendiciones y gastos contables.
 * - gasto y pago: solo integrantes activos del grupo (también invitados);
 * - rendicion: quien la cargó, quien aprueba en la organización o el estudio;
 * - contable: el estudio, miembros con finanzas.ver de la organización o el
 *   autónomo dueño del tenant.
 * Cualquier otro caso responde 404 y queda en la auditoría.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const { tipo, id } = await params;
  if (!isUuid(id)) return notFound();
  const db = getDb();
  let target: Target | null = null;
  let allowed = false;
  let actorInfo: ReturnType<typeof auditActor> = {};

  if (tipo === "gasto" || tipo === "pago") {
    const actor = await getGastosActor();
    if (!actor) return new Response("No autorizado", { status: 401 });
    actorInfo = auditActor(actor);
    const row =
      tipo === "gasto"
        ? (await db.select({ group: expenses.group_id, path: expenses.receipt_path, name: expenses.receipt_name, mime: expenses.receipt_mime }).from(expenses).where(eq(expenses.id, id)))[0]
        : (await db.select({ group: settlements.group_id, path: settlements.receipt_path, name: settlements.receipt_name, mime: settlements.receipt_name }).from(settlements).where(eq(settlements.id, id)))[0];
    const m = row ? await memberOf(actor, row.group) : null;
    target = { path: row?.path ?? null, name: row?.name ?? null, mime: tipo === "gasto" ? (row?.mime ?? null) : null, studioId: actor.studioId, organizationId: m?.group.organization_id ?? null };
    allowed = !!m;
  } else if (tipo === "rendicion" || tipo === "contable") {
    const user = await getCurrentUser();
    if (!user) return new Response("No autorizado", { status: 401 });
    actorInfo = { actor: user };
    const row =
      tipo === "rendicion"
        ? (await db.select().from(reimbursements).where(and(eq(reimbursements.id, id), eq(reimbursements.studio_id, user.studioId))))[0]
        : (await db.select().from(accounting_expenses).where(and(eq(accounting_expenses.id, id), eq(accounting_expenses.studio_id, user.studioId))))[0];
    if (row) {
      target = { path: row.receipt_path, name: row.receipt_name, mime: row.receipt_mime, studioId: user.studioId, organizationId: row.organization_id };
      const staff = isStudioRole(user.role) && !user.mustChangePassword && user.twoFactorEnabled && (!user.tenantSuspended || !!user.assisted);
      if (staff) allowed = true;
      else if (user.role === "cliente" && row.organization_id) {
        const mem = (await getMemberships(user.id, user.studioId)).find((x) => x.organizationId === row.organization_id);
        if (mem) {
          if (tipo === "rendicion") allowed = (row as typeof reimbursements.$inferSelect).user_id === user.id || can(mem.role, "finanzas.gestionar");
          else allowed = can(mem.role, "finanzas.ver");
        }
      } else if (user.role === "autonomo" && tipo === "contable") allowed = row.organization_id === null;
    }
  } else return notFound();

  if (!target || !target.path) {
    if (target) return notFound();
  }
  if (!allowed || !target?.path) {
    await audit({ studioId: target?.studioId ?? null, organizationId: target?.organizationId ?? null, ...actorInfo, action: "gastos.comprobante_descargar", entityType: tipo, entityId: id, result: "denegado" });
    return notFound();
  }
  let file: Awaited<ReturnType<typeof readStored>>;
  try {
    file = await readStored(target.path);
  } catch {
    return notFound();
  }
  await audit({ studioId: target.studioId, organizationId: target.organizationId, ...actorInfo, action: "gastos.comprobante_descargar", entityType: tipo, entityId: id });
  const name = target.name ?? "comprobante";
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const mime = target.mime ?? (name.endsWith(".pdf") ? "application/pdf" : name.match(/\.jpe?g$/i) ? "image/jpeg" : name.endsWith(".png") ? "image/png" : "application/octet-stream");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
