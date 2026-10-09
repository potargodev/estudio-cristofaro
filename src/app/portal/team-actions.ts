"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth";
import {
  changeMemberRole,
  inviteMember,
  reactivateMember,
  resendInvitation,
  revokeInvitation,
  revokeMember,
  type TeamActor,
  type TeamResult,
} from "@/lib/team";

// "Mi equipo" del portal. Solo para quien tiene equipo.gestionar en la
// organización ACTIVA de su sesión: el organization_id nunca sale del
// formulario. Las reglas de roles y límites se validan en src/lib/team.ts.

const v = (fd: FormData, k: string) => {
  const x = fd.get(k);
  return typeof x === "string" && x.trim() ? x.trim() : null;
};

async function ctx() {
  const me = await requireMember("equipo.gestionar");
  return { orgId: me.organizationId, actor: { kind: "miembro", user: me, role: me.orgRole } as TeamActor };
}

function done(r: TeamResult) {
  revalidatePath("/portal", "layout");
  return r;
}

export async function memberInvite(_prev: TeamResult | null, fd: FormData) {
  const { orgId, actor } = await ctx();
  return done(await inviteMember(actor, { organizationId: orgId, email: v(fd, "email"), name: v(fd, "name"), role: v(fd, "role") }));
}

export async function memberResend(_prev: TeamResult | null, fd: FormData) {
  const { orgId, actor } = await ctx();
  return done(await resendInvitation(actor, orgId, v(fd, "invitation_id")));
}

export async function memberRevokeInvitation(_prev: TeamResult | null, fd: FormData) {
  const { orgId, actor } = await ctx();
  return done(await revokeInvitation(actor, orgId, v(fd, "invitation_id")));
}

export async function memberChangeRole(_prev: TeamResult | null, fd: FormData) {
  const { orgId, actor } = await ctx();
  return done(await changeMemberRole(actor, orgId, v(fd, "membership_id"), v(fd, "role")));
}

export async function memberRevoke(_prev: TeamResult | null, fd: FormData) {
  const { orgId, actor } = await ctx();
  return done(await revokeMember(actor, orgId, v(fd, "membership_id")));
}

export async function memberReactivate(_prev: TeamResult | null, fd: FormData) {
  const { orgId, actor } = await ctx();
  return done(await reactivateMember(actor, orgId, v(fd, "membership_id")));
}
