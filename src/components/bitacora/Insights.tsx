import { BellRing, Lightbulb, X } from "lucide-react";
import { dismissInsightAction } from "@/app/bitacora/plus-actions";

const ICON: Record<string, typeof Lightbulb> = { resumen_semanal: BellRing };

/** Avisos de Bitácora (fugas, fijos que vencen, aumentos, sobres y el resumen semanal), descartables */
export function Insights({ items, volver }: { items: { id: string; kind: string; title: string; body: string }[]; volver: string }) {
  if (!items.length) return null;
  return (
    <section aria-label="Avisos de tu Bitácora" className="grid gap-2">
      {items.map((i) => {
        const Icon = ICON[i.kind] ?? Lightbulb;
        return (
          <div key={i.id} className="flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-3">
            <Icon className="mt-0.5 size-4 shrink-0 text-rose-deep" strokeWidth={1.6} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-ui font-medium text-ink">{i.title}</p>
              <p className="text-meta text-muted">{i.body}</p>
            </div>
            <form action={dismissInsightAction}>
              <input type="hidden" name="id" value={i.id} />
              <input type="hidden" name="volver" value={volver} />
              <button type="submit" aria-label="Descartar el aviso" className="grid size-8 place-items-center rounded-md text-muted hover:bg-canvas hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            </form>
          </div>
        );
      })}
    </section>
  );
}
