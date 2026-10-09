import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { ORG_ROLE_LABELS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Sin permiso" };

export default async function SinPermisoPage() {
  const me = await requireMember();
  return (
    <Card className="mx-auto max-w-lg text-center">
      <h1 className="font-display text-3xl">Esta sección no está habilitada para tu rol</h1>
      <p className="mt-3 leading-relaxed text-muted">
        En {me.organizationName} tenés el rol <strong>{ORG_ROLE_LABELS[me.orgRole]}</strong>. Si necesitás acceder, pedíselo a quien administra tu
        organización en la plataforma.
      </p>
      <Link href="/portal" className="link-underline mt-6 inline-block text-rose-deep">
        Volver al inicio
      </Link>
    </Card>
  );
}
