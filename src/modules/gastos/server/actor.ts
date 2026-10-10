import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expense_groups, group_members } from "@/db/schema";
import type { AuditEvent } from "@/lib/audit";
import { homeFor } from "@/lib/roles";
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

