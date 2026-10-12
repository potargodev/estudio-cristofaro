import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { getSessionUser, getMemberships } from "@/lib/auth";
import { can, type OrgRole } from "@/lib/permissions";
import { isStudioRole } from "@/lib/roles";

/**
 * Quién es la persona frente a una organización: alguien del estudio (ve
 * todo lo del estudio), un miembro con su rol, y su legajo si es empleado.
 */
export async function viewerFor(organizationId: string, studioId: string) {
  const user = await getSessionUser();
  if (!user || user.studioId !== studioId) return null;
  if (isStudioRole(user.role) && (!user.tenantSuspended || user.assisted)) return { user, studio: true, role: null as OrgRole | null, employeeId: null as string | null };
  const m = (await getMemberships(user.id, user.studioId)).find((x) => x.organizationId === organizationId);
  if (!m) return null;
  const [e] = await getDb().select({ id: employees.id }).from(employees).where(and(eq(employees.organization_id, organizationId), eq(employees.user_id, user.id)));
  return { user, studio: false, role: m.role as OrgRole, employeeId: e?.id ?? null };
}

export const canSeePayroll = (v: NonNullable<Awaited<ReturnType<typeof viewerFor>>>) => v.studio || (!!v.role && can(v.role, "sueldos.ver"));
