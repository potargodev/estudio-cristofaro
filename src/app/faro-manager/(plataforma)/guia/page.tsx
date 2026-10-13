import type { Metadata } from "next";
import { guideCheckAction } from "@/app/simuladores/actions";
import { Feedback } from "@/components/app/Feedback";
import { Card, PageHeader, SectionTitle, SubmitButton, ToneBadge, fieldClass } from "@/components/ds";
import { requireFaro } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GAPS, GUIDE, GUIDE_STATUS, type GuideStatus } from "@/modules/simuladores/guia";
import { guideChecks } from "@/modules/simuladores/server";

export const metadata: Metadata = { title: "Guía de prueba" };

const TONE = { pendiente: "neutral", ok: "ok", falla: "danger", duda: "gold" } as const;

/** Parte C · C7 · Checklist de la guía de prueba para la contadora: recorridos cortos con su estado y comentario */
export default async function GuiaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireFaro();
  const sp = await searchParams;
  const checks = new Map((await guideChecks()).map((c) => [c.item_key, c]));
  const areas = [...new Set(GUIDE.map((g) => g.area))];
  const count = (st: GuideStatus) => GUIDE.filter((g) => (checks.get(g.key)?.status ?? "pendiente") === st).length;
  return (
    <div className="grid gap-5">
      <PageHeader
        level={2}
        title="Guía de prueba"
        description={`${GUIDE.length} recorridos cortos para probar Faro de punta a punta sobre la demo, con todo en Simulador. Cada uno dice con qué usuario entrar («Ver como…» en Demo), qué hacer y qué tiene que pasar. Guardá cómo te fue y un comentario: queda para el equipo.`}
        className="mb-0"
      />
      <Feedback sp={sp} />
      <p className="flex flex-wrap gap-2 text-ui" aria-label="Avance">
        {(Object.keys(GUIDE_STATUS) as GuideStatus[]).map((st) => (
          <ToneBadge key={st} tone={TONE[st]}>
            {GUIDE_STATUS[st]}: <span className="num">{count(st)}</span>
          </ToneBadge>
        ))}
      </p>
      {areas.map((area) => (
        <section key={area} aria-label={area} className="grid gap-3">
          <SectionTitle>{area}</SectionTitle>
          {GUIDE.filter((g) => g.area === area).map((g) => {
            const c = checks.get(g.key);
            const status = (c?.status ?? "pendiente") as GuideStatus;
            return (
              <Card key={g.key} as="article" id={g.key} className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-ui font-semibold">{g.title}</h3>
                  <ToneBadge tone={TONE[status]}>{GUIDE_STATUS[status]}</ToneBadge>
                </div>
                <p className="text-meta text-muted">Con: {g.who}</p>
                <ol className="grid list-decimal gap-1 pl-5 text-ui">
                  {g.steps.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                <p className="text-ui">
                  <span className="font-semibold">Tiene que pasar:</span> {g.expect}
                </p>
                <form action={guideCheckAction} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                  <input type="hidden" name="key" value={g.key} />
                  <label className="text-meta text-muted">
                    Cómo te fue
                    <select name="status" defaultValue={status} className={cn(fieldClass, "mt-1")}>
                      {(Object.keys(GUIDE_STATUS) as GuideStatus[]).map((st) => (
                        <option key={st} value={st}>
                          {GUIDE_STATUS[st]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-meta text-muted">
                    Comentario
                    <input name="comment" defaultValue={c?.comment ?? ""} placeholder="Qué viste, qué falta o qué harías distinto" className={cn(fieldClass, "mt-1")} />
                  </label>
                  <SubmitButton variant="secondary">Guardar</SubmitButton>
                </form>
                {c?.updated_at && <p className="text-caption text-muted">Guardado el {formatDate(c.updated_at, "shortTime")}</p>}
              </Card>
            );
          })}
        </section>
      ))}
      <Card as="section" aria-label="Lo que todavía no está">
        <h2 className="text-title font-semibold">Lo que Faro todavía no hace (para charlar)</h2>
        <p className="mt-2 text-ui text-muted">La lista de huecos de docs/cobertura-tareas-contables.md. La pregunta es una sola: ¿qué tarea que hacés todos los meses con un cliente no está?</p>
        <ol className="mt-3 grid list-decimal gap-1 pl-5 text-ui">
          {GAPS.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
