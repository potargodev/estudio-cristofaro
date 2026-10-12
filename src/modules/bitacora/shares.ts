import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { bitacora_shares, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { esc, sendMail } from "@/lib/email";
import { mailLayout } from "@/lib/notify";
import { getSiteUrl } from "@/lib/runtime-config";
import { notify } from "@/modules/notifications/server";
import { crossesWorld, userIsDemo, WORLD_MESSAGE } from "@/lib/demo-world";
import { UUID } from "@/lib/ids";
import { EMAIL_RE } from "@/lib/ids";

// Bitácora compartida (hogar o pareja): quien comparte elige con quién y con
// qué permiso (ver o también cargar). Es explícito y revocable por cualquiera
// de las dos personas en cualquier momento. Queda en la auditoría.

const db = () => getDb();
export class ShareError extends Error {}
type Who = { id: string; name: string; email: string; studioId: string };

export async function createShare(owner: Who, email: string, permission: "ver" | "cargar") {
  const to = email.trim().toLowerCase();
  if (!EMAIL_RE.test(to)) throw new ShareError("Revisá el mail.");
  if (to === owner.email.toLowerCase()) throw new ShareError("No te podés invitar a vos.");
  if (crossesWorld(await userIsDemo(owner.id), to)) throw new ShareError(WORLD_MESSAGE);
  const active = await db().select({ id: bitacora_shares.id }).from(bitacora_shares).where(and(eq(bitacora_shares.owner_id, owner.id), eq(bitacora_shares.invited_email, to), inArray(bitacora_shares.status, ["invitada", "activa"])));
  if (active.length) throw new ShareError("Ya compartiste tu Bitácora con esa persona.");
  const token = randomBytes(24).toString("base64url");
  const [s] = await db().insert(bitacora_shares).values({ owner_id: owner.id, invited_email: to, token, permission }).returning();
  const link = `${getSiteUrl()}/bitacora/compartida/aceptar/${token}`;
  await sendMail({ to, subject: `${owner.name} quiere compartir su Bitácora con vos`, html: mailLayout("Bitácora compartida", `<p>${esc(owner.name)} te invitó a ver ${permission === "cargar" ? "y cargar movimientos en" : ""} su Bitácora de Faro (finanzas del hogar).</p><p>Entrá con este mail (${esc(to)}) para aceptar.</p>`, { href: link, label: "Aceptar" }, "Faro") });
  const [existing] = await db().select({ id: users.id }).from(users).where(eq(users.email, to));
  if (existing) await notify([existing.id], { kind: "aviso", title: `${owner.name} quiere compartir su Bitácora con vos`, href: `/bitacora/compartida/aceptar/${token}` });
  await audit({ studioId: owner.studioId, actor: owner, action: "bitacora.compartir", entityType: "bitacora_compartida", entityId: s.id, metadata: { con: to, permiso: permission } });
  return { share: s, link };
}

export async function acceptShare(member: Who, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ShareError("Invitación inválida.");
  const [s] = await db().select().from(bitacora_shares).where(eq(bitacora_shares.token, token));
  if (!s || s.status === "revocada") throw new ShareError("La invitación ya no está vigente.");
  if (s.invited_email !== member.email.toLowerCase()) throw new ShareError(`La invitación es para ${s.invited_email}. Entrá con ese mail para aceptarla.`);
  if (s.owner_id === member.id) throw new ShareError("Es tu propia Bitácora.");
  await db().update(bitacora_shares).set({ member_id: member.id, status: "activa", accepted_at: new Date() }).where(eq(bitacora_shares.id, s.id));
  await audit({ studioId: member.studioId, actor: member, action: "bitacora.compartida_aceptada", entityType: "bitacora_compartida", entityId: s.id });
  return s.id;
}

export async function revokeShare(user: Who, id: string) {
  if (!UUID.test(id)) return;
  const [s] = await db().update(bitacora_shares).set({ status: "revocada", revoked_at: new Date() }).where(and(eq(bitacora_shares.id, id), or(eq(bitacora_shares.owner_id, user.id), eq(bitacora_shares.member_id, user.id)))).returning({ id: bitacora_shares.id });
  if (s) await audit({ studioId: user.studioId, actor: user, action: "bitacora.compartida_revocada", entityType: "bitacora_compartida", entityId: id });
}

export async function mySharing(userId: string) {
  const [mine, withMe] = await Promise.all([
    db().select({ id: bitacora_shares.id, email: bitacora_shares.invited_email, permission: bitacora_shares.permission, status: bitacora_shares.status, member: users.name }).from(bitacora_shares).leftJoin(users, eq(users.id, bitacora_shares.member_id)).where(and(eq(bitacora_shares.owner_id, userId), inArray(bitacora_shares.status, ["invitada", "activa"]))),
    db().select({ id: bitacora_shares.id, permission: bitacora_shares.permission, owner: users.name, ownerId: users.id }).from(bitacora_shares).innerJoin(users, eq(users.id, bitacora_shares.owner_id)).where(and(eq(bitacora_shares.member_id, userId), eq(bitacora_shares.status, "activa"))),
  ]);
  return { mine, withMe };
}

/** Acceso a la Bitácora de otra persona: solo con una invitación aceptada y vigente */
export async function sharedAccess(memberId: string, shareId: string) {
  if (!UUID.test(shareId)) return null;
  const [s] = await db().select({ id: bitacora_shares.id, ownerId: bitacora_shares.owner_id, permission: bitacora_shares.permission, owner: users.name }).from(bitacora_shares).innerJoin(users, eq(users.id, bitacora_shares.owner_id)).where(and(eq(bitacora_shares.id, shareId), eq(bitacora_shares.member_id, memberId), eq(bitacora_shares.status, "activa")));
  return s ?? null;
}
