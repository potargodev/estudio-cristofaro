import { HandHeart, X } from "lucide-react";
import Link from "next/link";
import { dismissSuggestionAction } from "@/app/escudo-actions";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { activeSuggestions, evaluateDerivations } from "@/modules/escudo/server";

type Me = { id: string; role: string; studioId: string; tenantKind: string };

/**
 * Disparador de derivación (principios §1.c): sugerencias amables de sumar un
 * contador cuando la cuenta cruza un umbral. Se descartan y vuelven más
 * adelante; el botón lleva a la Red con el contexto armado.
 */
export async function Derivaciones({ me, volver, max = 2 }: { me: Me; volver: string; max?: number }) {
  await evaluateDerivations(me).catch((e) => console.error("[escudo] evaluar", (e as Error).message));
  const list = (await activeSuggestions(me.id)).slice(0, max);
  if (!list.length) return null;
  return (
    <section aria-label="Sugerencias de sumar un contador" className="grid gap-2">
      {list.map((s) => (
        <article key={s.id} data-derivacion={s.rule_key} className="flex gap-3 rounded-md border border-rose/40 bg-rose-soft p-4">
          <HandHeart className="mt-0.5 size-5 shrink-0 text-rose-deep" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">{s.rule.message}</p>
            <p className="mt-1 text-meta text-muted">
              {s.context.why} {NO_REEMPLAZA}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/red-contable?derivacion=${s.id}`} className="inline-flex h-9 items-center rounded-md bg-navy px-3 text-ui font-medium text-paper hover:bg-night">
                Sumar un contador
              </Link>
              <form action={dismissSuggestionAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="volver" value={volver} />
                <button type="submit" className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-meta text-muted hover:text-ink">
                  <X className="size-4" aria-hidden /> Ahora no
                </button>
              </form>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

/** «Esto no reemplaza el criterio de un contador», en una línea y con naturalidad */
export function NoReemplaza({ className = "" }: { className?: string }) {
  return (
    <p className={`text-meta text-muted ${className}`}>
      Faro te muestra datos según lo que cargaste; no revisa ni valida tu situación. {NO_REEMPLAZA}{" "}
      <Link href="/red-contable" className="underline underline-offset-4">
        Buscar un contador
      </Link>
    </p>
  );
}
