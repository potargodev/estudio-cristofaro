import { BadgeCheck, Factory } from "lucide-react";
import type { Metadata } from "next";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { Panel } from "@/components/admin/kit/Panel";
import { StatusBadge } from "@/components/admin/kit/StatusBadge";
import { SubmitButton } from "@/components/admin/ui";
import { requireStaff } from "@/lib/auth";
import { listTemplates, studioTemplateStatuses } from "@/modules/industries/server";
import { validateTemplateForStudioAction } from "../../rubro-validation-actions";

export const metadata: Metadata = { title: "Rubros" };

const day = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" });

/** Plantillas de rubro y su validación por el estudio */
export default async function RubrosPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const canValidate = me.role === "dueno" || me.role === "contador";
  const [templates, statuses] = await Promise.all([listTemplates(), studioTemplateStatuses(me.studioId)]);
  return (
    <div className="max-w-5xl">
      {sp.ok && <Notice>{sp.ok}</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <PageHeader
        title="Rubros"
        description="Plantillas con las obligaciones, documentos y tareas típicas de cada rubro. Son sugerencias: hasta que un profesional del estudio las revise y las marque como validadas, se muestran como «Plantilla en revisión por el estudio»."
      />
      <Panel title="Plantillas" icon={Factory} bodyClassName="p-0">
        <ul className="divide-y divide-line">
          {templates.map((t) => {
            const st = statuses[t.clave];
            return (
              <li key={t.clave} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                    {t.nombre} <span className="text-[12px] font-normal text-muted">versión {t.version}</span>
                    {st.state === "en_revision" ? <StatusBadge status="pendiente" label={st.label} /> : <StatusBadge status="activa" label={st.label} />}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {t.descripcion}
                    {st.at && ` · ${day.format(st.at)}`}
                  </p>
                </div>
                {canValidate && st.state !== "validada_faro" && (
                  <form action={validateTemplateForStudioAction} className="flex items-center gap-2">
                    <input type="hidden" name="key" value={t.clave} />
                    {st.state === "validada_estudio" ? (
                      <>
                        <input type="hidden" name="undo" value="1" />
                        <button type="submit" className="h-9 rounded-md border border-line px-3 text-[13px] hover:border-muted">
                          Quitar validación
                        </button>
                      </>
                    ) : (
                      <SubmitButton pendingText="…">
                        <BadgeCheck className="size-4" aria-hidden /> Marcar como validada
                      </SubmitButton>
                    )}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      <p className="mt-4 text-[13px] text-muted">La validación es para la versión vigente: si Faro publica una versión nueva, vuelve a «en revisión» hasta que la revisen. Cada validación queda en la auditoría.</p>
    </div>
  );
}
