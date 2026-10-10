import { AlertTriangle, ArrowLeft, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { applyIndustryAction } from "@/app/admin/industry-actions";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { requireOperator } from "@/lib/auth";
import { ITEM_KINDS, type ItemKind } from "@/modules/industries/catalog";
import { IndustryError, previewApply, studioTemplateStatuses } from "@/modules/industries/server";
import { validateTemplateForStudioAction } from "@/app/admin/rubro-validation-actions";

export const metadata: Metadata = { title: "Aplicar rubro" };

/** Vista previa de lo que la plantilla va a crear en la organización, antes de confirmar */
export default async function PreviewRubro({ params, searchParams }: { params: Promise<{ id: string; key: string }>; searchParams: Promise<{ error?: string; nueva?: string; ok?: string }> }) {
  const { id, key } = await params;
  const sp = await searchParams;
  const me = await requireOperator();
  let p;
  try {
    p = await previewApply(me.studioId, id, key);
  } catch (e) {
    if (e instanceof IndustryError) notFound();
    throw e;
  }
  const status = (await studioTemplateStatuses(me.studioId))[key];
  const kinds = Object.keys(ITEM_KINDS) as ItemKind[];
  const fresh = p.items.filter((i) => !i.exists);
  return (
    <div className="max-w-4xl">
      {sp.nueva && <Notice>Organización creada. Revisá lo que trae el rubro antes de aplicarlo.</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      {sp.ok && <Notice>{sp.ok}</Notice>}
      <Link href={`/admin/organizaciones/${p.organization.id}?tab=rubro`} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> {p.organization.name}
      </Link>
      <PageHeader className="mt-4" title={`Rubro: ${p.template.nombre}`} description={`Vista previa de lo que se va a crear en ${p.organization.name}. Todo queda editable.`} />
      {status.state === "en_revision" && (
        <div role="note" className="mb-6 flex flex-wrap items-start gap-3 rounded-lg border border-[#e3cf9f] bg-[#fbf5e6] p-4 text-[14px] text-[#7a5410]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Plantilla en revisión por el estudio.</strong> Esta plantilla (versión {p.template.version}) es una sugerencia: todavía nadie del estudio la revisó. Los datos normativos marcados &quot;a validar&quot; dependen de la
            jurisdicción o del caso.
          </p>
          {(me.role === "dueno" || me.role === "contador") && (
            <form action={validateTemplateForStudioAction}>
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="back" value={`/admin/organizaciones/${p.organization.id}/rubro/${key}`} />
              <button type="submit" className="h-9 rounded-md border border-[#c9a54f] bg-surface px-3 text-[13px] font-medium text-ink">
                Marcar como validada
              </button>
            </form>
          )}
        </div>
      )}
      {status.state !== "en_revision" && <p className="mb-4 text-[14px] text-muted">{status.label}.</p>}
      {p.alreadyApplied && <p className="mb-4 text-[14px] text-muted">Este rubro ya está aplicado (versión {p.alreadyApplied.version}): solo se suma lo que falta.</p>}
      <div className="grid gap-4">
        {kinds.map((k) => {
          const list = p.items.filter((i) => i.kind === k);
          if (!list.length) return null;
          return (
            <section key={k} className="rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-3 text-[16px] font-semibold">
                {ITEM_KINDS[k]} <span className="text-[13px] font-normal text-muted">· {list.filter((i) => !i.exists).length} nuevos</span>
              </h2>
              <ul className="divide-y divide-line">
                {list.map((i) => (
                  <li key={i.key} className="flex gap-3 px-5 py-2.5 text-[14px]">
                    <Check className={i.exists ? "mt-0.5 size-4 shrink-0 text-muted" : "mt-0.5 size-4 shrink-0 text-[#1f5f36]"} aria-hidden />
                    <div className="min-w-0">
                      <p className={i.exists ? "text-muted line-through" : "text-ink"}>{i.label}</p>
                      {i.detail && <p className="text-[13px] text-muted">{i.detail}</p>}
                      {i.validar && <p className="mt-0.5 text-[12px] text-[#7a5410]">A validar: {i.validar}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <form action={applyIndustryAction} className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 py-4 backdrop-blur">
        <input type="hidden" name="organization" value={p.organization.id} />
        <input type="hidden" name="industry" value={p.template.clave} />
        <SubmitButton pendingText="Aplicando…">{fresh.length ? `Confirmar y crear ${fresh.length} ítems` : "Confirmar"}</SubmitButton>
        <Link href={`/admin/organizaciones/${p.organization.id}?tab=rubro`} className="text-[14px] text-muted underline-offset-4 hover:underline">
          Cancelar
        </Link>
      </form>
    </div>
  );
}
