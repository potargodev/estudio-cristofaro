import type { Metadata } from "next";
import { PageTitle } from "@/components/portal/ui";
import { TeamPanel } from "@/components/team/TeamPanel";
import { requireMember } from "@/lib/auth";
import { getOrgLimits } from "@/lib/organizations";
import { memberChangeRole, memberInvite, memberReactivate, memberResend, memberRevoke, memberRevokeInvitation } from "../../team-actions";

export const metadata: Metadata = { title: "Mi equipo" };

export default async function EquipoPage() {
  const me = await requireMember("equipo.gestionar");
  const limits = await getOrgLimits(me.organizationId);
  const usersText = limits.max
    ? `${limits.used.users} de ${limits.max.users} usuarios de tu plan (incluye invitaciones pendientes)`
    : "Tu plan todavía no tiene límite de usuarios asignado";
  return (
    <>
      <PageTitle title="Mi equipo" intro={`Quiénes acceden a ${me.organizationName} y con qué rol.`} />
      <TeamPanel
        organizationId={me.organizationId}
        actorRole={me.orgRole}
        selfUserId={me.id}
        usersText={usersText}
        actions={{
          invite: memberInvite,
          resend: memberResend,
          revokeInvitation: memberRevokeInvitation,
          changeRole: memberChangeRole,
          revoke: memberRevoke,
          reactivate: memberReactivate,
        }}
      />
    </>
  );
}
