import { Blocks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MODULE_SCREENS } from "@/components/portal/modules/registry";
import { Card } from "@/components/portal/ui";
import { requireMember } from "@/lib/auth";
import { getModule } from "@/lib/modules/catalog";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Módulo" };

/**
 * Portada de cada módulo. Valida en el servidor que el módulo exista, esté
 * activo en la organización y que el rol tenga permiso para verlo.
 */
export default async function ModuloPage({ params }: { params: Promise<{ key: string; path?: string[] }> }) {
  const { key, path = [] } = await params;
  const mod = getModule(key);
  if (!mod) notFound();
  const me = await requireMember();
  if (!me.modules.includes(mod.key)) notFound();
  if (!can(me.orgRole, mod.permissions.view)) redirect("/portal/sin-permiso");
  const Screen = MODULE_SCREENS[mod.key];
  if (Screen) return <Screen me={me} path={path} />;
  return (
    <Card className="mx-auto max-w-xl text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-rose-soft text-rose-deep">
        <Blocks className="size-7" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-medium uppercase tracking-wider text-rose-deep">Próximamente</p>
      <h1 className="mt-1 font-display text-3xl">{mod.name}</h1>
      <p className="mt-3 leading-relaxed text-muted">{mod.description}</p>
      <p className="mt-3 text-sm text-muted">El módulo ya está habilitado para {me.organizationName}. Te avisamos cuando esté listo para usar.</p>
      <Link href="/portal" className="link-underline mt-6 inline-block text-rose-deep">
        Volver al inicio
      </Link>
    </Card>
  );
}
