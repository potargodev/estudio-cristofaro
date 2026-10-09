import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { client_users, clients } from "@/db/schema";
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
  // Un cliente nunca entra al backoffice: va a su portal
  if (user.role === "cliente") redirect("/portal");
  if (user.role !== "admin" && user.role !== "contador") redirect("/admin/sin-acceso");
  return user;
}

/** Solo administradores del estudio. */
export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/admin");
  return user;
}

export interface PortalUser extends StaffUser {
  clientId: string;
  clientName: string;
}

/**
 * Usuario cliente del portal y el cliente al que está vinculado (client_users).
 * El staff va al backoffice. Toda query del portal tiene que filtrar por el
 * clientId (y el studioId) que devuelve: nunca por un id que venga del navegador.
 */
export async function requireClient(): Promise<PortalUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");
  if (user.role !== "cliente") redirect("/admin");
  const [link] = await getDb()
    .select({ clientId: clients.id, clientName: clients.business_name })
    .from(client_users)
    .innerJoin(clients, eq(clients.id, client_users.client_id))
    .where(and(eq(client_users.user_id, user.id), eq(clients.studio_id, user.studioId)))
    .orderBy(asc(clients.business_name))
    .limit(1);
  if (!link) redirect("/portal/sin-acceso");
  return { ...user, ...link };
}
