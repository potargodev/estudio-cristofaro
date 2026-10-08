import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth-server";
import type { UserRole } from "./types";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studioId: string;
}

/** Sesión válida del pedido actual (consulta la base) o null. */
export const getCurrentUser = cache(async (): Promise<StaffUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string; studioId?: string; active?: boolean };
  if (!u.studioId || u.active === false) return null;
  return { id: u.id, name: u.name, email: u.email, role: (u.role ?? "contador") as UserRole, studioId: u.studioId };
});

/**
 * Usuario del estudio (admin o contador). Si no hay sesión lo manda al login;
 * si es un cliente, a /admin/sin-acceso. Toda query del backoffice tiene que
 * filtrar por el studioId que devuelve.
 */
export async function requireStaff(): Promise<StaffUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin" && user.role !== "contador") redirect("/admin/sin-acceso");
  return user;
}

/** Solo administradores del estudio. */
export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/admin");
  return user;
}
