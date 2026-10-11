import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { GuidePreference } from "@/components/app/GuidePreference";
import { InstallPanel } from "@/components/app/InstallApp";
import { requireMember } from "@/lib/auth";
import { can, ORG_ROLE_LABELS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Mi cuenta" };

/** Mi cuenta en el portal: la configuración de la organización que el rol puede usar, la app y la guía */
export default async function MasPage() {
  const me = await requireMember();
  const links = [
    can(me.orgRole, "equipo.gestionar") && { href: "/portal/equipo", label: "Mi equipo", hint: "Quién entra al portal de la organización y con qué rol" },
    can(me.orgRole, "agenda.reservar") && { href: "/portal/agendar", label: "Agendar una llamada", hint: "Con tu contador, en los horarios del estudio" },
    (me.orgRole === "administrador" || me.orgRole === "direccion") && { href: "/portal/resena", label: "Reseñar al estudio", hint: "Tu opinión en la Red de estudios" },
    { href: "/legal/terminos", label: "Términos y privacidad", hint: "Textos legales y lo que aceptaste" },
  ].filter((l): l is { href: string; label: string; hint: string } => !!l);
  return (
    <>
      <PageHeader title="Mi cuenta" description={`${me.name || me.email} · ${me.organizationName} · tu rol: ${ORG_ROLE_LABELS[me.orgRole]}`} />
      <ul className="divide-y divide-line rounded-md border border-line bg-surface">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-canvas">
              <span className="min-w-0">
                <span className="block text-[15px] text-ink">{item.label}</span>
                <span className="block text-[13px] text-muted">{item.hint}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <section aria-labelledby="instalar" className="mt-10">
        <h2 id="instalar" className="text-[18px] font-semibold">
          Instalá la app
        </h2>
        <p className="mt-1 text-[15px] text-muted">Tené tu portal a un toque, con su ícono, en el celular o la computadora.</p>
        <InstallPanel tone="light" className="mt-5" />
      </section>
      <div className="mt-10">
        <GuidePreference />
      </div>
    </>
  );
}
