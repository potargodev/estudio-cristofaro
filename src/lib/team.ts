import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, inArray, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { invitations, memberships, organizations, users } from "@/db/schema";
import { audit } from "./audit";
import type { StaffUser } from "./auth";
import { esc, sendMail } from "./email";
import { mailLayout, notifyStudio } from "./notify";
import { checkLimit, getOrgLimits, usableInvitation } from "./organizations";
import { ORG_ROLE_LABELS, SENSITIVE_ROLES, canGrant, isOrgRole, type OrgRole } from "./permissions";
import { getSiteUrl } from "./runtime-config";

// Lógica de miembros e invitaciones, compartida por el backoffice (el estudio)
// y por "Mi equipo" del portal (el administrador de la organización). Las
// reglas se validan acá, en el servidor, para los dos:
// - un miembro nunca otorga un rol superior al propio (canGrant);
// - las invitaciones con rol sensible que hace la organización esperan la
//   confirmación del estudio;
// - los límites de usuarios del plan se respetan al invitar y al reactivar;
// - siempre queda al menos un administrador activo.

export const INVITATION_DAYS = 7;

/** Quién actúa: alguien del estudio, o un miembro de la organización con su rol */
export type TeamActor = { kind: "estudio"; user: StaffUser } | { kind: "miembro"; user: StaffUser; role: OrgRole };

export type TeamResult = { ok: true; message: string; link?: string; mailed?: boolean } | { ok: false; message: string };

const fail = (message: string): TeamResult => ({ ok: false, message });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), expires: new Date(Date.now() + INVITATION_DAYS * 86400000) };
};
export const invitationLink = (token: string) => `${getSiteUrl()}/invitacion/${token}`;

function actorCanGrant(actor: TeamActor, role: OrgRole) {
  return actor.kind === "estudio" || (actor.role === "administrador" && canGrant(actor.role, role));
}

async function orgOf(organizationId: string, studioId: string) {
  const [org] = await getDb()
    .select({ id: organizations.id, name: organizations.name, status: organizations.status })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), eq(organizations.studio_id, studioId)));
  return org ?? null;
}

async function denied(actor: TeamActor, organizationId: string, action: string, motivo: string, extra: Record<string, unknown> = {}) {
  await audit({ studioId: actor.user.studioId, organizationId, actor: actor.user, action, result: "denegado", metadata: { motivo, ...extra } });
  return fail(motivo);
}

async function mailInvitation(email: string, orgName: string, role: OrgRole, inviter: string, token: string) {
  const link = invitationLink(token);
  const mailed = await sendMail({
    to: email,
    subject: `Te invitaron a ${orgName} en la plataforma del Estudio Cristofaro`,
    html: mailLayout(
      `Te invitaron a ${orgName}`,
      `<p>${esc(inviter)} te invitó a sumarte a <strong>${esc(orgName)}</strong> con el rol <strong>${esc(ORG_ROLE_LABELS[role])}</strong>.</p>
<p>Entrá con tu cuenta de Google o pedí un enlace por mail. Tiene que ser con esta misma dirección: <strong>${esc(email)}</strong>.</p>
<p style="color:#5a6176;font-size:13px">La invitación vence en ${INVITATION_DAYS} días. Si no esperabas este mail, ignoralo.</p>`,
      { href: link, label: "Aceptar invitación" },
    ),
  });
  return { link, mailed };
}

/** Marca como vencidas las invitaciones pendientes que pasaron su fecha */
export async function expireInvitations(organizationId?: string) {
  await getDb()
    .update(invitations)
    .set({ status: "vencida" })
    .where(
      and(
        eq(invitations.status, "pendiente"),
        lt(invitations.expires_at, new Date()),
        organizationId ? eq(invitations.organization_id, organizationId) : undefined,
      ),
    );
}

async function activeAdmins(organizationId: string) {
  const [row] = await getDb()
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.organization_id, organizationId), eq(memberships.role, "administrador"), eq(memberships.status, "activa")));
  return row.n;
}

// ───────────── invitaciones ─────────────

export async function inviteMember(
  actor: TeamActor,
  input: { organizationId: string; email: string | null; name: string | null; role: string | null },
): Promise<TeamResult> {
  const studioId = actor.user.studioId;
  const org = await orgOf(input.organizationId, studioId);
  if (!org) return fail("Organización inexistente.");
  const email = input.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return fail("Revisá el email.");
  if (!isOrgRole(input.role)) return fail("Elegí un rol.");
  const role = input.role;
  if (!actorCanGrant(actor, role)) {
    return denied(actor, org.id, "invitacion.crear", "No podés invitar con un rol superior al tuyo.", { rol: role, email });
  }
  const db = getDb();
  // Las cuentas del estudio no pueden ser miembros de una organización
  const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));
  if (existing && existing.role !== "cliente") return fail("Ese email es de una cuenta del estudio. Usá una dirección personal de la empresa.");
  if (existing) {
    const [m] = await db
      .select({ status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.organization_id, org.id), eq(memberships.user_id, existing.id)));
    if (m?.status === "activa") return fail("Esa persona ya es miembro de la organización.");
  }
  await expireInvitations(org.id);
  const [pending] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(and(eq(invitations.organization_id, org.id), eq(invitations.email, email), eq(invitations.status, "pendiente")));
  if (pending) return fail("Ya hay una invitación pendiente para ese email. Podés reenviarla o revocarla.");
  const limitError = checkLimit(await getOrgLimits(org.id), "users");
  if (limitError) return denied(actor, org.id, "invitacion.crear", limitError, { email });

  const needsApproval = actor.kind === "miembro" && SENSITIVE_ROLES.includes(role);
  const { token, hash, expires } = newToken();
  const [inv] = await db
    .insert(invitations)
    .values({
      studio_id: studioId,
      organization_id: org.id,
      email,
      name: input.name?.trim() || null,
      role,
      token_hash: hash,
      expires_at: expires,
      invited_by: actor.user.id,
      needs_approval: needsApproval,
    })
    .returning({ id: invitations.id });
  await audit({
    studioId,
    organizationId: org.id,
    actor: actor.user,
    action: "invitacion.crear",
    entityType: "invitacion",
    entityId: inv.id,
    metadata: { email, rol: role, por: actor.kind, requiere_confirmacion: needsApproval },
  });
  if (needsApproval) {
    await notifyStudio({
      kind: "aprobacion",
      organizationId: org.id,
      organizationName: org.name,
      email,
      role: ORG_ROLE_LABELS[role],
      invitedBy: actor.user.name,
    });
    return {
      ok: true,
      message: `La invitación a ${email} como ${ORG_ROLE_LABELS[role]} queda pendiente hasta que la confirme el estudio (es un rol sensible).`,
    };
  }
  const sent = await mailInvitation(email, org.name, role, actor.user.name, token);
  return {
    ok: true,
    link: sent.link,
    mailed: sent.mailed,
    message: sent.mailed
      ? `Le mandamos la invitación a ${email}.`
      : `Invitación creada. El mail no salió (SMTP sin configurar): pasale este enlace a ${email}.`,
  };
}

/** Invitación de la organización (y de su estudio) */
async function findInvitation(id: string | null, organizationId: string, studioId: string) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [inv] = await getDb()
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.organization_id, organizationId), eq(invitations.studio_id, studioId)));
  return inv ?? null;
}

/** Reenviar: genera un enlace nuevo (el anterior deja de servir) y extiende el vencimiento */
export async function resendInvitation(actor: TeamActor, organizationId: string, invitationId: string | null): Promise<TeamResult> {
  const inv = await findInvitation(invitationId, organizationId, actor.user.studioId);
  if (!inv || (inv.status !== "pendiente" && inv.status !== "vencida")) return fail("Invitación inexistente.");
  if (!actorCanGrant(actor, inv.role))
    return denied(actor, organizationId, "invitacion.reenviar", "No podés reenviar una invitación con un rol superior al tuyo.");
  if (inv.needs_approval && !inv.approved_at) return fail("Esta invitación todavía espera la confirmación del estudio.");
  if (inv.status === "vencida") {
    const limitError = checkLimit(await getOrgLimits(organizationId), "users");
    if (limitError) return denied(actor, organizationId, "invitacion.reenviar", limitError);
  }
  const org = await orgOf(organizationId, actor.user.studioId);
  const { token, hash, expires } = newToken();
  await getDb().update(invitations).set({ token_hash: hash, expires_at: expires, status: "pendiente" }).where(eq(invitations.id, inv.id));
  await audit({
    studioId: actor.user.studioId,
    organizationId,
    actor: actor.user,
    action: "invitacion.reenviar",
    entityType: "invitacion",
    entityId: inv.id,
    metadata: { email: inv.email },
  });
  const sent = await mailInvitation(inv.email, org!.name, inv.role, actor.user.name, token);
  return {
    ok: true,
    link: sent.link,
    mailed: sent.mailed,
    message: sent.mailed ? `Reenviamos la invitación a ${inv.email}.` : `Enlace nuevo generado (el anterior ya no sirve). Pasáselo a ${inv.email}.`,
  };
}

export async function revokeInvitation(actor: TeamActor, organizationId: string, invitationId: string | null): Promise<TeamResult> {
  const inv = await findInvitation(invitationId, organizationId, actor.user.studioId);
  if (!inv || inv.status !== "pendiente") return fail("Invitación inexistente.");
  if (!actorCanGrant(actor, inv.role))
    return denied(actor, organizationId, "invitacion.revocar", "No podés revocar una invitación con un rol superior al tuyo.");
  await getDb().update(invitations).set({ status: "revocada", revoked_at: new Date() }).where(eq(invitations.id, inv.id));
  await audit({
    studioId: actor.user.studioId,
    organizationId,
    actor: actor.user,
    action: "invitacion.revocar",
    entityType: "invitacion",
    entityId: inv.id,
    metadata: { email: inv.email, rol: inv.role },
  });
  return { ok: true, message: `Invitación a ${inv.email} revocada.` };
}

/** Solo el estudio: confirma una invitación con rol sensible y recién ahí sale el mail */
export async function approveInvitation(staff: StaffUser, organizationId: string, invitationId: string | null): Promise<TeamResult> {
  const actor: TeamActor = { kind: "estudio", user: staff };
  const inv = await findInvitation(invitationId, organizationId, staff.studioId);
  if (!inv || inv.status !== "pendiente" || !inv.needs_approval || inv.approved_at) return fail("No hay nada para confirmar.");
  const org = await orgOf(organizationId, staff.studioId);
  const { token, hash, expires } = newToken();
  await getDb()
    .update(invitations)
    .set({ approved_at: new Date(), approved_by: staff.id, token_hash: hash, expires_at: expires })
    .where(eq(invitations.id, inv.id));
  await audit({
    studioId: staff.studioId,
    organizationId,
    actor: staff,
    action: "invitacion.aprobar",
    entityType: "invitacion",
    entityId: inv.id,
    metadata: { email: inv.email, rol: inv.role },
  });
  const [inviter] = inv.invited_by ? await getDb().select({ name: users.name }).from(users).where(eq(users.id, inv.invited_by)) : [];
  const sent = await mailInvitation(inv.email, org!.name, inv.role, inviter?.name ?? actor.user.name, token);
  return {
    ok: true,
    link: sent.link,
    mailed: sent.mailed,
    message: sent.mailed
      ? `Confirmada. Le mandamos la invitación a ${inv.email}.`
      : `Confirmada. El mail no salió: pasale este enlace a ${inv.email}.`,
  };
}

// ───────────── miembros ─────────────

async function findMembership(id: string | null, organizationId: string, studioId: string) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [m] = await getDb()
    .select({ id: memberships.id, role: memberships.role, status: memberships.status, userId: memberships.user_id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.user_id))
    .where(and(eq(memberships.id, id), eq(memberships.organization_id, organizationId), eq(memberships.studio_id, studioId)));
  return m ?? null;
}

export async function changeMemberRole(
  actor: TeamActor,
  organizationId: string,
  membershipId: string | null,
  newRole: string | null,
): Promise<TeamResult> {
  const m = await findMembership(membershipId, organizationId, actor.user.studioId);
  if (!m || m.status !== "activa") return fail("Miembro inexistente.");
  if (!isOrgRole(newRole)) return fail("Elegí un rol.");
  if (m.role === newRole) return { ok: true, message: "Sin cambios." };
  // No se toca a alguien de rol superior ni se otorga un rol superior al propio
  if (!actorCanGrant(actor, newRole) || !actorCanGrant(actor, m.role)) {
    return denied(actor, organizationId, "miembro.rol", "No podés otorgar un rol superior al tuyo.", { email: m.email, de: m.role, a: newRole });
  }
  if (m.role === "administrador" && (await activeAdmins(organizationId)) <= 1) {
    return fail("Tiene que quedar al menos un administrador. Designá otro antes de cambiar este rol.");
  }
  await getDb().update(memberships).set({ role: newRole }).where(eq(memberships.id, m.id));
  await audit({
    studioId: actor.user.studioId,
    organizationId,
    actor: actor.user,
    action: newRole === "administrador" ? "miembro.admin" : "miembro.rol",
    entityType: "membresia",
    entityId: m.id,
    metadata: { email: m.email, de: m.role, a: newRole },
  });
  return { ok: true, message: `${m.email} ahora es ${ORG_ROLE_LABELS[newRole]}.` };
}

export async function revokeMember(actor: TeamActor, organizationId: string, membershipId: string | null): Promise<TeamResult> {
  const m = await findMembership(membershipId, organizationId, actor.user.studioId);
  if (!m || m.status === "revocada") return fail("Miembro inexistente.");
  if (!actorCanGrant(actor, m.role))
    return denied(actor, organizationId, "miembro.revocar", "No podés quitarle el acceso a alguien con un rol superior al tuyo.", { email: m.email });
  if (m.role === "administrador" && m.status === "activa" && (await activeAdmins(organizationId)) <= 1) {
    return fail("Es el único administrador. Designá otro antes de quitarle el acceso.");
  }
  await getDb().update(memberships).set({ status: "revocada" }).where(eq(memberships.id, m.id));
  await audit({
    studioId: actor.user.studioId,
    organizationId,
    actor: actor.user,
    action: "miembro.revocar",
    entityType: "membresia",
    entityId: m.id,
    metadata: { email: m.email, rol: m.role },
  });
  return { ok: true, message: `Se le quitó el acceso a ${m.email}.` };
}

export async function reactivateMember(actor: TeamActor, organizationId: string, membershipId: string | null): Promise<TeamResult> {
  const m = await findMembership(membershipId, organizationId, actor.user.studioId);
  if (!m || m.status === "activa") return fail("Miembro inexistente.");
  if (!actorCanGrant(actor, m.role))
    return denied(actor, organizationId, "miembro.reactivar", "No podés reactivar a alguien con un rol superior al tuyo.");
  const limitError = checkLimit(await getOrgLimits(organizationId), "users");
  if (limitError) return denied(actor, organizationId, "miembro.reactivar", limitError, { email: m.email });
  await getDb().update(memberships).set({ status: "activa" }).where(eq(memberships.id, m.id));
  await audit({
    studioId: actor.user.studioId,
    organizationId,
    actor: actor.user,
    action: "miembro.reactivar",
    entityType: "membresia",
    entityId: m.id,
    metadata: { email: m.email },
  });
  return { ok: true, message: `${m.email} vuelve a tener acceso.` };
}

// ───────────── aceptación ─────────────

/** Invitación vigente por token (para la página /invitacion/[token]) */
export async function invitationByToken(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await getDb()
    .select({ inv: invitations, orgName: organizations.name, orgStatus: organizations.status, inviter: users.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organization_id))
    .leftJoin(users, eq(users.id, invitations.invited_by))
    .where(eq(invitations.token_hash, hashToken(token)));
  return row ?? null;
}

/** ¿Este email tiene una invitación utilizable o una membresía activa? (para dejarlo entrar) */
export async function hasAccessByEmail(email: string) {
  const db = getDb();
  const e = email.trim().toLowerCase();
  const [inv] = await db
    .select({ id: invitations.id, studioId: invitations.studio_id })
    .from(invitations)
    .where(and(eq(invitations.email, e), usableInvitation()))
    .limit(1);
  if (inv) return { invitation: true, studioId: inv.studioId };
  const [mem] = await db
    .select({ id: memberships.id, studioId: memberships.studio_id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.user_id))
    .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
    .where(and(eq(users.email, e), eq(memberships.status, "activa"), ne(organizations.status, "baja"), eq(users.active, true)))
    .limit(1);
  if (mem) return { invitation: false, studioId: mem.studioId };
  return null;
}

/**
 * Activa las membresías de todas las invitaciones vigentes del email del
 * usuario (el email autenticado tiene que coincidir con el invitado). Se llama
 * al iniciar sesión y desde /invitacion/[token]. Respeta el límite de usuarios
 * (la invitación ya ocupaba su lugar).
 */
export async function acceptInvitationsFor(user: { id: string; email: string; studioId: string }) {
  const db = getDb();
  const pending = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.email, user.email.toLowerCase()), eq(invitations.studio_id, user.studioId), usableInvitation()));
  const accepted: string[] = [];
  for (const inv of pending) {
    await db.transaction(async (tx) => {
      await tx
        .insert(memberships)
        .values({
          studio_id: inv.studio_id,
          organization_id: inv.organization_id,
          user_id: user.id,
          role: inv.role,
          status: "activa",
          invited_by: inv.invited_by,
        })
        .onConflictDoUpdate({
          target: [memberships.organization_id, memberships.user_id],
          set: { role: inv.role, status: "activa", invited_by: inv.invited_by },
        });
      await tx.update(invitations).set({ status: "aceptada", accepted_at: new Date(), accepted_by: user.id }).where(eq(invitations.id, inv.id));
    });
    await audit({
      studioId: inv.studio_id,
      organizationId: inv.organization_id,
      actor: user,
      action: "invitacion.aceptar",
      entityType: "invitacion",
      entityId: inv.id,
      metadata: { rol: inv.role },
    });
    accepted.push(inv.organization_id);
  }
  return accepted;
}

/** Miembros e invitaciones de una organización (backoffice y Mi equipo) */
export async function getTeam(organizationId: string) {
  await expireInvitations(organizationId);
  const db = getDb();
  const [members, invites] = await Promise.all([
    db
      .select({
        id: memberships.id,
        role: memberships.role,
        status: memberships.status,
        createdAt: memberships.created_at,
        userId: users.id,
        name: users.name,
        email: users.email,
        userActive: users.active,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.user_id))
      .where(eq(memberships.organization_id, organizationId))
      .orderBy(memberships.status, users.name),
    db
      .select()
      .from(invitations)
      .where(and(eq(invitations.organization_id, organizationId), inArray(invitations.status, ["pendiente", "vencida"])))
      .orderBy(invitations.created_at),
  ]);
  return { members, invites };
}
