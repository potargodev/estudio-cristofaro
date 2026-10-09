import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { portalSignOut } from "@/app/portal/actions";
import { AuthShell } from "@/components/auth/AuthShell";
import { PortalAccess } from "@/components/auth/PortalAccess";
import { getCurrentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/auth-server";
import { ORG_ROLE_LABELS } from "@/lib/permissions";
import { acceptInvitationsFor, invitationByToken } from "@/lib/team";

export const metadata: Metadata = { title: "Invitación", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <AuthShell title={title} subtitle="Estudio Cristofaro">
      <p className="text-[15px] leading-relaxed text-muted">{text}</p>
      <Link href="/portal/login" className="mt-6 inline-block text-rose-deep hover:underline">
        Ir al portal
      </Link>
    </AuthShell>
  );
}

/**
 * Página del enlace de invitación. Muestra a qué organización y con qué rol;
 * para aceptarla hay que entrar con Google o con un enlace por mail con el
 * MISMO email invitado (si no coincide, no se activa).
 */
export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await invitationByToken(token);
  if (!found)
    return (
      <Problem
        title="Invitación inválida"
        text="El enlace no es válido o ya se reemplazó por uno nuevo. Pedile a quien te invitó que te la reenvíe."
      />
    );
  const { inv, orgName, inviter } = found;
  if (inv.status === "aceptada") redirect(`/portal/cambiar?org=${inv.organization_id}`);
  if (inv.status === "revocada")
    return (
      <Problem
        title="Invitación revocada"
        text="Esta invitación ya no está vigente. Si necesitás acceso, pedile a quien administra tu organización que te invite de nuevo."
      />
    );
  if (inv.status === "vencida" || inv.expires_at < new Date())
    return <Problem title="La invitación venció" text="Las invitaciones duran 7 días. Pedile a quien te invitó que te la reenvíe." />;
  if (inv.needs_approval && !inv.approved_at)
    return (
      <Problem
        title="Invitación en revisión"
        text="El estudio todavía tiene que confirmar esta invitación. Te avisamos por mail cuando esté lista."
      />
    );

  const user = await getCurrentUser();
  if (user) {
    if (user.role === "cliente" && user.email === inv.email) {
      await acceptInvitationsFor(user);
      redirect(`/portal/cambiar?org=${inv.organization_id}`);
    }
    return (
      <AuthShell title="Esta invitación es para otra cuenta" subtitle={orgName}>
        <p className="text-[15px] leading-relaxed text-muted">
          Entraste como <strong className="text-ink">{user.email}</strong>, pero la invitación es para{" "}
          <strong className="text-ink">{inv.email}</strong>. Cerrá la sesión y entrá con el email invitado.
        </p>
        <form action={portalSignOut} className="mt-6">
          <button type="submit" className="rounded-md border border-line px-4 py-2 hover:bg-surface">
            Cerrar sesión
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Te invitaron a ${orgName}`}
      subtitle="Portal de clientes · Estudio Cristofaro"
      footer={<p>No hay contraseñas: entrás con Google o con un enlace a tu mail.</p>}
    >
      <p className="mb-5 text-[15px] leading-relaxed text-muted">
        {inviter ?? "El estudio"} te invitó con el rol <strong className="text-ink">{ORG_ROLE_LABELS[inv.role]}</strong>. Entrá con{" "}
        <strong className="text-ink">{inv.email}</strong> para aceptar.
      </p>
      <PortalAccess google={googleEnabled()} email={inv.email} next={`/portal/cambiar?org=${inv.organization_id}`} />
    </AuthShell>
  );
}
