import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { GuidePreference } from "@/components/app/GuidePreference";
import Link from "next/link";
import { InstallPanel } from "@/components/app/InstallApp";
import { PageTitle } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { ORG_ROLE_LABELS } from "@/lib/permissions";
import { buildPortalNav } from "@/lib/portal-nav";

export const metadata: Metadata = { title: "Más" };

/** Menú del celular con las secciones que no entran en la barra inferior */
export default async function MasPage() {
  const me = await requireMember();
  const { extra } = buildPortalNav(me.orgRole, me.modules);
  return (
    <>
      <PageTitle title="Más secciones" intro={`${me.organizationName} · tu rol: ${ORG_ROLE_LABELS[me.orgRole]}`} />
      {extra.length === 0 ? (
        <p className="text-muted">No hay más secciones habilitadas.</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {extra.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex items-center justify-between gap-3 px-4 py-4 text-[15px] hover:bg-canvas">
                {item.label}
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="instalar" className="mt-10">
        <h2 id="instalar" className="font-display text-[22px]">Instalá la app</h2>
        <p className="mt-1 text-[15px] text-muted">Tené tu portal a un toque, con su ícono, en el celular o la computadora.</p>
        <InstallPanel tone="light" className="mt-5" />
      </section>
      <div className="mt-10">
        <GuidePreference />
      </div>
    </>
  );
}
