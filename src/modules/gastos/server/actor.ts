import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { expense_groups, group_members } from "@/db/schema";
import type { AuditEvent } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { homeFor, isStudioRole } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

// Quién usa gastos compartidos en este pedido. Siempre sale del servidor:
// - un usuario de Faro con sesión (estudio, autónomo o cliente del portal);
// - un invitado sin cuenta, por la cookie de su link mágico, que solo vale
//   para SU grupo.
// Nunca se confía en un id de grupo o de integrante que mande el navegador:
// todo pasa por memberOf(), que cruza el grupo con el tenant y el integrante.

export const GUEST_COOKIE = "faro_invitado";

export type GastosActor =
  | { kind: "user"; studioId: string; userId: string; name: string; email: string; role: UserRole }
  | { kind: "guest"; studioId: string; memberId: string; groupId: string; name: string; email: string | null };

export const hashGuestToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newGuestToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashGuestToken(token) };
};

/** Busca el integrante invitado por su token (link mágico) */
export async function guestByToken(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null;
  const [row] = await getDb()
    .select({ memberId: group_members.id, groupId: group_members.group_id, name: group_members.name, email: group_members.email, studioId: expense_groups.studio_id, archived: expense_groups.archived_at })
    .from(group_members)
    .innerJoin(expense_groups, eq(expense_groups.id, group_members.group_id))
    .where(and(eq(group_members.guest_token_hash, hashGuestToken(token)), eq(group_members.active, true)));
  return row && !row.archived ? row : null;
}

/** Actor del pedido actual o null (sin sesión válida ni invitación vigente) */
export const getGastosActor = cache(async (): Promise<GastosActor | null> => {
  const user = await getCurrentUser();
  if (user) {
    // El estudio entra con su seguridad completa (contraseña definitiva y 2FA)
    if (isStudioRole(user.role) && (user.mustChangePassword || !user.twoFactorEnabled)) return null;
    if (user.tenantSuspended && !user.assisted) return null;
    // En acceso asistido el equipo de Faro no opera gastos de personas
    if (user.assisted) return null;
    return { kind: "user", studioId: user.studioId, userId: user.id, name: user.name, email: user.email, role: user.role };
  }
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const g = await guestByToken(token);
  if (!g) return null;
  return { kind: "guest", studioId: g.studioId, memberId: g.memberId, groupId: g.groupId, name: g.name, email: g.email };
});

/** Para la auditoría: el usuario, o una etiqueta para el invitado */
export function auditActor(actor: GastosActor): Pick<AuditEvent, "actor" | "actorLabel"> {
  return actor.kind === "user" ? { actor: { id: actor.userId, email: actor.email } } : { actorLabel: `invitado: ${actor.email ?? actor.name}` };
}

/** A dónde vuelve el actor ("Volver a tu panel") */
export function homeOf(actor: GastosActor) {
  return actor.kind === "user" ? homeFor(actor.role) : null;
}

export type GroupRow = typeof expense_groups.$inferSelect;
export type MemberRow = typeof group_members.$inferSelect;

/**
 * El grupo y el integrante que es el actor, o null si no es integrante activo
 * (o el grupo es de otro tenant). Es la única forma de entrar a un grupo.
 */
export async function memberOf(actor: GastosActor, groupId: string): Promise<{ group: GroupRow; me: MemberRow } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) return null;
  if (actor.kind === "guest" && actor.groupId !== groupId) return null;
  const db = getDb();
  const [group] = await db
    .select()
    .from(expense_groups)
    .where(and(eq(expense_groups.id, groupId), eq(expense_groups.studio_id, actor.studioId)));
  if (!group) return null;
  const [me] = await db
    .select()
    .from(group_members)
    .where(
      and(
        eq(group_members.group_id, groupId),
        eq(group_members.active, true),
        actor.kind === "user" ? eq(group_members.user_id, actor.userId) : eq(group_members.id, actor.memberId),
      ),
    );
  return me ? { group, me } : null;
}

/** Para las páginas de /gastos: actor o a la pantalla de ingreso */
export async function requireGastos(): Promise<GastosActor> {
  const a = await getGastosActor();
  if (!a) redirect("/gastos/entrar");
  return a;
}
