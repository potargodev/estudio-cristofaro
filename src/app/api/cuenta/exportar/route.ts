import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounting_expenses,
  agreement_payments,
  expense_groups,
  expenses,
  fleet_members,
  legal_acceptances,
  legal_entities,
  obligations,
  organizations,
  requests,
  service_agreements,
  studios,
  users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";

// Exportación de los datos propios (Ley 25.326, derecho de acceso). Solo la
// sesión decide qué se exporta: la cuenta personal, o el estudio entero si
// quien pide es su dueño. Los archivos no van: se descargan desde la app.

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.assisted) return new Response("No autorizado", { status: 401 });
  const db = getDb();
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.id, me.id));
  const out: Record<string, unknown> = { exportado: new Date().toISOString(), usuario: user };
  out.aceptaciones_legales = await db.select().from(legal_acceptances).where(eq(legal_acceptances.user_id, me.id));
  const owner = me.role === "titular" || me.role === "dueno";
  if (owner) {
    const [t] = await db.select().from(studios).where(eq(studios.id, me.studioId));
    out.cuenta = { nombre: t?.name, tipo: t?.kind, plan: t?.plan_key, cuit: t?.cuit, regimen: t?.tax_regime, domicilio_fiscal: t?.fiscal_address, creada: t?.created_at };
    const orgs = await db.select().from(organizations).where(eq(organizations.studio_id, me.studioId));
    const ids = orgs.map((o) => o.id);
    out.organizaciones = orgs;
    if (ids.length) {
      out.razones_sociales = await db.select().from(legal_entities).where(inArray(legal_entities.organization_id, ids));
      out.vencimientos = await db.select().from(obligations).where(eq(obligations.studio_id, me.studioId));
      out.solicitudes = await db.select().from(requests).where(eq(requests.studio_id, me.studioId));
    }
    out.gastos_contables = await db.select().from(accounting_expenses).where(eq(accounting_expenses.studio_id, me.studioId));
  }
  const groups = await db.select().from(expense_groups).where(and(eq(expense_groups.studio_id, me.studioId), eq(expense_groups.created_by, me.id)));
  out.grupos_de_gastos = groups;
  out.gastos_cargados = await db.select().from(expenses).where(eq(expenses.created_by, me.id));
  out.flotas = await db.select({ flota: fleet_members.fleet_id, perfil: fleet_members.profile, rol: fleet_members.role, estado: fleet_members.status }).from(fleet_members).where(eq(fleet_members.user_id, me.id));
  const agreements = await db.select().from(service_agreements).where(eq(service_agreements.user_id, me.id));
  out.acuerdos_de_servicio = agreements;
  out.pagos_de_acuerdos = agreements.length ? await db.select().from(agreement_payments).where(inArray(agreement_payments.agreement_id, agreements.map((a) => a.id))) : [];
  await audit({ studioId: me.studioId, actor: me, action: "cuenta.exportar", entityType: "usuario", entityId: me.id, metadata: { completo: owner } });
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="faro-mis-datos-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
