import { AlertTriangle, ArrowUpCircle, Factory, Trash2 } from "lucide-react";
import Link from "next/link";
import { updateSetupItemAction } from "@/app/admin/industry-actions";
import { INDUSTRY_NAMES, ITEM_KINDS, type ItemKind } from "@/modules/industries/catalog";
import { organizationSetup } from "@/modules/industries/server";
import { cn } from "@/lib/utils";

const PERFIL: Record<string, string> = { impositivo: "Perfil impositivo típico", laboral: "Perfil laboral (convenios y conceptos)" };
const label = (d: Record<string, unknown>, fallback: string) => String(d.etiqueta ?? d.impuesto ?? d.item ?? d.nombre ?? d.titulo ?? d.descripcion ?? PERFIL[fallback] ?? fallback);

/** Ficha → Rubro: plantillas aplicadas, novedades y lo que dejaron (editable) */
export async function OrgIndustryTab({ orgId, studioId, canEdit, notice }: { orgId: string; studioId: string; canEdit: boolean; notice?: string | null }) {
  const s = await organizationSetup(studioId, orgId);
  const kinds = Object.keys(ITEM_KINDS) as ItemKind[];
  const available = Object.entries(INDUSTRY_NAMES).filter(([k]) => !s.industries.some((i) => i.key === k));
  return (
    <div className="grid gap-6">
      {notice && <p className="rounded-lg border border-[#a9d1b5] bg-[#ecf6ef] px-4 py-3 text-[14px] text-[#1f5f36]">{notice}</p>}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-navy text-gold">
            <Factory className="size-4" aria-hidden />
          </span>
          Rubros
        </h2>
        {s.industries.length === 0 ? (
          <p className="mt-3 text-[14px] text-muted">Todavía no tiene rubro. Elegí uno para precargar obligaciones, checklist, categorías y tareas.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {s.industries.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-4 py-3">
                <div>
                  <p className="font-medium text-ink">{i.name}</p>
                  <p className="text-[13px] text-muted">
                    Versión {i.version} aplicada el {i.appliedAt.toLocaleDateString("es-AR")} ·{" "}
                    {i.status === "validada" ? <span className="text-[#1f5f36]">validada</span> : <span className="text-[#7a5410]">sugerencia a revisar</span>}
                  </p>
                </div>
                {i.latest > i.version && canEdit && (
                  <Link href={`/admin/organizaciones/${orgId}/rubro/${i.key}/actualizar`} className="inline-flex items-center gap-1.5 rounded-md bg-navy px-3 py-2 text-[13px] text-paper hover:bg-navy-deep" data-testid="rubro-actualizar">
                    <ArrowUpCircle className="size-4" aria-hidden /> Hay una versión nueva ({i.latest})
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && available.length > 0 && (
          <form action={`/admin/organizaciones/${orgId}/rubro/elegir`} className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="pick-industry" className="sr-only">
              Rubro
            </label>
            <select id="pick-industry" name="rubro" required className="h-10 min-w-56 rounded-md border border-line bg-surface px-3 text-[14px]" defaultValue="">
              <option value="" disabled>
                Agregar un rubro…
              </option>
              {available.map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
            <button className="h-10 rounded-md bg-navy px-4 text-[14px] text-paper hover:bg-navy-deep">Ver qué trae</button>
          </form>
        )}
      </section>

      {kinds.map((k) => {
        const list = s.items.filter((i) => i.kind === k);
        if (!list.length) return null;
        return (
          <section key={k} className="rounded-lg border border-line bg-surface">
            <h3 className="border-b border-line px-5 py-3 text-[15px] font-semibold">
              {ITEM_KINDS[k]} <span className="text-[13px] font-normal text-muted">· {list.length}</span>
            </h3>
            <ul className="divide-y divide-line">
              {list.map((it) => {
                const d = it.data as Record<string, unknown>;
                return (
                  <li key={it.id} className="flex items-start gap-3 px-5 py-2.5 text-[14px]">
                    {k === "checklist" ? (
                      <form action={updateSetupItemAction}>
                        <input type="hidden" name="organization" value={orgId} />
                        <input type="hidden" name="item" value={it.id} />
                        <input type="hidden" name="op" value="done" />
                        <input type="hidden" name="done" value={it.done ? "0" : "1"} />
                        <button aria-label={it.done ? "Marcar como pendiente" : "Marcar como recibido"} className={cn("mt-0.5 grid size-5 place-items-center rounded border", it.done ? "border-[#1f5f36] bg-[#1f5f36] text-white" : "border-line")}>
                          {it.done && "✓"}
                        </button>
                      </form>
                    ) : (
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-rose" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-ink", it.done && "text-muted line-through")}>{label(d, it.key)}</p>
                      {typeof d.vencimiento === "string" && <p className="text-[13px] text-muted">{String(d.frecuencia)} · {d.vencimiento}</p>}
                      {typeof d.validar === "string" && <p className="text-[12px] text-[#7a5410]">A validar: {d.validar}</p>}
                      {it.customized && <p className="text-[12px] text-muted">Con cambios del estudio</p>}
                    </div>
                    {canEdit && (
                      <form action={updateSetupItemAction}>
                        <input type="hidden" name="organization" value={orgId} />
                        <input type="hidden" name="item" value={it.id} />
                        <input type="hidden" name="op" value="remove" />
                        <button aria-label="Quitar" className="p-1 text-muted hover:text-danger">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {s.items.some((i) => typeof (i.data as Record<string, unknown>).validar === "string") && (
        <p className="flex gap-2 text-[13px] text-muted">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#7a5410]" aria-hidden /> Lo marcado &quot;a validar&quot; es normativo y depende de la jurisdicción o del caso.
        </p>
      )}
    </div>
  );
}
