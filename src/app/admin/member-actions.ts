"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { studioOrganization } from "@/lib/organizations";
import {
  approveInvitation,
  changeMemberRole,
  inviteMember,
  reactivateMember,
  resendInvitation,
  revokeInvitation,
  revokeMember,
  type TeamActor,
  type TeamResult,
} from "@/lib/team";

// Miembros e invitaciones desde el backoffice: el estudio puede asistir a la
// organización (invitar, revocar, cambiar roles, designar un nuevo
// administrador) y confirmar las invitaciones con rol sensible.

const v = (fd: FormData, k: string) => {
  const x = fd.get(k);
  return typeof x === "string" && x.trim() ? x.trim() : null;
};

async function ctx(fd: FormData) {
  const staff = await requireStaff();
  const org = await studioOrganization(v(fd, "organization_id"), staff.studioId);
  return { staff, org, actor: { kind: "estudio", user: staff } as TeamActor };
}

function done(orgId: string, r: TeamResult) {
  revalidatePath(`/admin/organizaciones/${orgId}`);
  revalidatePath("/admin/organizaciones");
  revalidatePath("/portal", "layout");
  return r;
}

const missing: TeamResult = { ok: false, message: "Organización inexistente." };

export async function staffInvite(_prev: TeamResult | null, fd: FormData) {
  const { org, actor } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await inviteMember(actor, { organizationId: org.id, email: v(fd, "email"), name: v(fd, "name"), role: v(fd, "role") }));
}

export async function staffResend(_prev: TeamResult | null, fd: FormData) {
  const { org, actor } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await resendInvitation(actor, org.id, v(fd, "invitation_id")));
}

export async function staffRevokeInvitation(_prev: TeamResult | null, fd: FormData) {
  const { org, actor } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await revokeInvitation(actor, org.id, v(fd, "invitation_id")));
}

export async function staffApproveInvitation(_prev: TeamResult | null, fd: FormData) {
  const { org, staff } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await approveInvitation(staff, org.id, v(fd, "invitation_id")));
}

export async function staffChangeRole(_prev: TeamResult | null, fd: FormData) {
  const { org, actor } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await changeMemberRole(actor, org.id, v(fd, "membership_id"), v(fd, "role")));
}

export async function staffRevokeMember(_prev: TeamResult | null, fd: FormData) {
  const { org, actor } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await revokeMember(actor, org.id, v(fd, "membership_id")));
}

export async function staffReactivateMember(_prev: TeamResult | null, fd: FormData) {
  const { org, actor } = await ctx(fd);
  if (!org) return missing;
  return done(org.id, await reactivateMember(actor, org.id, v(fd, "membership_id")));
}
