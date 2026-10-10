import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/admin/AdminField";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { requireFaro } from "@/lib/auth";
import { ITEM_KINDS, templateItems, type ItemKind } from "@/modules/industries/catalog";
import { getTemplate, templateHistory } from "@/modules/industries/server";
import { saveTemplateAction, validateTemplateAction } from "../../template-actions";

export const metadata: Metadata = { title: "Plantilla" };

export default async function PlantillaPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ guardado?: string; validada?: string; error?: string }> }) {
  const { key } = await params;
  const sp = await searchParams;
  const me = await requireFaro();
  const t = await getTemplate(key);
  if (!t) notFound();
  const history = await templateHistory(key);
  const owner = me.faroRole === "faro_owner";
  const items = templateItems(t);
  const toValidate = items.filter((i) => i.validar).length;
  // Lo editable: todo menos la identidad, la versión y la validación (las maneja Faro)
  const editable = Object.fromEntries(Object.entries(t).filter(([k]) => !["clave", "version", "estado", "validado_por", "validado_el", "actualizado_el"].includes(k)));
  return (
    <>
      {sp.guardado && <Notice>{`Guardamos la versión ${sp.guardado}. Quedó en borrador hasta que la validen.`}</Notice>}
      {sp.validada && <Notice>Plantilla validada.</Notice>}
      {sp.error && <Notice tone="error">{sp.error}</Notice>}
      <Link href="/faro-manager/plantillas" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Plantillas
      </Link>
      <PageHeader className="mt-4" title={t.nombre} description={`${t.descripcion} · Versión ${t.version} · ${t.estado === "validada" ? `validada por ${t.validado_por?.nombre} (${t.validado_por?.matricula}) el ${t.validado_el}` : "borrador"}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid content-start gap-6">
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-[16px] font-semibold">Qué trae</h2>
            <ul className="mt-3 grid gap-1.5 text-[14px] sm:grid-cols-2">
              {(Object.keys(ITEM_KINDS) as ItemKind[]).map((k) => (
                <li key={k} className="flex justify-between gap-3 border-b border-line py-1.5">
                  <span className="text-muted">{ITEM_KINDS[k]}</span>
                  <span className="tabular-nums">{items.filter((i) => i.kind === k).length}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] text-[#7a5410]">{toValidate} datos normativos marcados &quot;a validar&quot;.</p>
          </section>
          {owner && (
            <form action={saveTemplateAction} className="grid gap-3 rounded-lg border border-line bg-surface p-5">
              <h2 className="text-[16px] font-semibold">Editar (crea la versión {t.version + 1})</h2>
              <input type="hidden" name="key" value={t.clave} />
              <label htmlFor="content" className="text-[13px] text-muted">
                Contenido en JSON (se valida con el esquema; versión, estado y validación los maneja Faro)
              </label>
              <textarea id="content" name="content" rows={24} spellCheck={false} defaultValue={JSON.stringify(editable, null, 2)} className="w-full rounded-md border border-line bg-canvas p-3 font-mono text-[12px] leading-relaxed" />
              <input name="note" maxLength={300} placeholder="Qué cambió (opcional)" aria-label="Qué cambió" className="h-10 rounded-md border border-line bg-surface px-3 text-[14px]" />
              <div>
                <SubmitButton pendingText="Guardando…">Guardar versión nueva</SubmitButton>
              </div>
            </form>
          )}
        </div>
        <div className="grid content-start gap-6">
          {owner && t.estado !== "validada" && (
            <form action={validateTemplateAction} className="grid gap-3 rounded-lg border border-line bg-surface p-5">
              <h2 className="flex items-center gap-2 text-[16px] font-semibold">
                <ShieldCheck className="size-4 text-gold-ink" aria-hidden /> Marcar como validada
              </h2>
              <p className="text-[13px] text-muted">Un contador revisó alícuotas, convenios y regímenes de esta versión.</p>
              <input type="hidden" name="key" value={t.clave} />
              <input name="name" required minLength={3} placeholder="Nombre y apellido" aria-label="Nombre de quien valida" className="h-10 rounded-md border border-line bg-surface px-3 text-[14px]" />
              <input name="license" required minLength={2} placeholder="Matrícula (ej. CPCECABA T° 300 F° 12)" aria-label="Matrícula" className="h-10 rounded-md border border-line bg-surface px-3 text-[14px]" />
              <div>
                <SubmitButton pendingText="Validando…">Validar versión {t.version}</SubmitButton>
              </div>
            </form>
          )}
          <section className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-[16px] font-semibold">Historial de versiones</h2>
            <ul className="mt-3 grid gap-2 text-[14px]">
              {history.map((h) => (
                <li key={`${h.version}-${h.source}`} className="border-b border-line pb-2">
                  <p className="font-medium">
                    Versión {h.version} · {h.status === "validada" ? "validada" : "borrador"}
                  </p>
                  <p className="text-[13px] text-muted">
                    {h.source === "repo" ? "Repositorio" : h.createdAt?.toLocaleDateString("es-AR")}
                    {h.validatedBy && ` · validó ${h.validatedBy}`}
                    {h.note && ` · ${h.note}`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
