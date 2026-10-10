import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { incorporateIndustryAction } from "@/app/admin/industry-actions";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { requireOperator } from "@/lib/auth";
import { ITEM_KINDS, type ItemKind } from "@/modules/industries/catalog";
import { IndustryError, diffForOrganization } from "@/modules/industries/server";

export const metadata: Metadata = { title: "Actualizar rubro" };

const CHANGE = { nuevo: "Nuevo", cambiado: "Cambió", quitado: "Ya no está en la plantilla" } as const;

/** Diferencias entre la versión aplicada y la vigente: el estudio elige qué incorporar */
export default async function ActualizarRubro({ params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  const me = await requireOperator();
  let d;
  try {
    d = await diffForOrganization(me.studioId, id, key);
  } catch (e) {
    if (e instanceof IndustryError) notFound();
    throw e;
  }
  if (!d) notFound();
  return (
    <div className="max-w-4xl">
      <Link href={`/admin/organizaciones/${d.organization.id}?tab=rubro`} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {d.organization.name}
      </Link>
      <PageHeader
        className="mt-4"
        title="Novedades de la plantilla"
        description={`Aplicaste la versión ${d.applied.version}; la vigente es la ${d.current.version}${d.current.status === "validada" ? " (validada)" : " (sugerencia a revisar)"}. Elegí qué incorporar: lo que cambiaste vos nunca se pisa.`}
      />
      {d.entries.length === 0 ? (
        <p className="text-muted">No hay diferencias con lo que tiene la organización.</p>
      ) : (
        <form action={incorporateIndustryAction} className="grid gap-4">
          <input type="hidden" name="organization" value={d.organization.id} />
          <input type="hidden" name="industry" value={key} />
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {d.entries.map((e) => (
              <li key={`${e.kind}:${e.key}`}>
                <label className="flex cursor-pointer gap-3 px-5 py-3 text-[14px]">
                  <input type="checkbox" name="item" value={`${e.kind}:${e.key}`} defaultChecked={e.change === "nuevo"} disabled={e.customized} className="mt-1 size-4 accent-navy" data-testid="diff-item" />
                  <span className="min-w-0">
                    <span className="block text-ink">
                      {e.label} <span className="ml-1 text-[12px] text-muted">· {ITEM_KINDS[e.kind as ItemKind]}</span>
                    </span>
                    {e.detail && <span className="block text-[13px] text-muted">{e.detail}</span>}
                    <span className={e.customized ? "mt-0.5 block text-[12px] text-[#7a5410]" : "mt-0.5 block text-[12px] text-rose-deep"}>
                      {CHANGE[e.change]}
                      {e.customized && " · tenés cambios propios: se mantienen"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div>
            <SubmitButton pendingText="Incorporando…">Incorporar lo elegido</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
