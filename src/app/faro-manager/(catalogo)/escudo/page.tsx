import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/kit/PageHeader";
import { SubmitButton } from "@/components/admin/ui";
import { Feedback } from "@/components/app/Feedback";
import { requireFaro } from "@/lib/auth";
import { NO_REEMPLAZA } from "@/modules/escudo/catalog";
import { getDerivationRules, getProfessionalTasks } from "@/modules/escudo/server";
import { saveLegendAction, saveRuleAction, saveTaskAction } from "../../escudo-actions";
import { CONDITIONS, LEGEND_STATUS, type LegendStatus } from "@/modules/leyendas/catalog";
import { getLegendRules } from "@/modules/leyendas/server";
import { fieldClass } from "@/components/ds/primitives";

export const metadata: Metadata = { title: "Escudo de responsabilidad" };

const input = `mt-1 disabled:opacity-70 ${fieldClass}`;
const area = `mt-1 py-2 disabled:opacity-70 ${fieldClass}`;

function Validation({ state, by }: { state: string; by: string | null }) {
  return state === "validada" ? (
    <span className="rounded-md bg-[#ecf6ef] px-2 py-0.5 text-caption text-[#1f5f36]">Validada por {by}</span>
  ) : (
    <span className="rounded-md bg-[#fbf5e6] px-2 py-0.5 text-caption text-[#7a5410]">A validar por un contador</span>
  );
}

function LegendBadge({ status }: { status: LegendStatus }) {
  const tone = status === "vigente" ? "bg-[#ecf6ef] text-[#1f5f36]" : status === "derogada" ? "bg-canvas text-muted" : "bg-[#fbf5e6] text-[#7a5410]";
  return <span className={`rounded-md px-2 py-0.5 text-caption ${tone}`}>{LEGEND_STATUS[status]}</span>;
}

function ValidationFields({ state, by, disabled }: { state: string; by: string | null; disabled: boolean }) {
  return (
    <>
      <label className="text-meta text-muted">
        Validación
        <select name="validation" defaultValue={state} disabled={disabled} className={input}>
          <option value="a_validar">A validar por un contador</option>
          <option value="validada">Validada por un contador</option>
        </select>
      </label>
      <label className="text-meta text-muted">
        Contador que la validó (nombre y matrícula)
        <input name="validated_by" defaultValue={by ?? ""} disabled={disabled} placeholder="Ej.: C.P. Nombre Apellido · T. 1 F. 2" className={input} />
      </label>
    </>
  );
}

/** Lista de tareas que requieren un matriculado (§1.b) y reglas del disparador de derivación (§1.c) */
export default async function EscudoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await requireFaro();
  const owner = me.faroRole === "faro_owner";
  const [tasks, rules, legends] = await Promise.all([getProfessionalTasks(), getDerivationRules(), getLegendRules()]);
  const toValidate = legends.filter((l) => l.status === "a_validar" && l.active).length;
  return (
    <div className="grid gap-8">
      <PageHeader
        level={2}
        title="Escudo de responsabilidad"
        description={`Faro ayuda a hacer y a ordenar, pero nunca dice que algo está bien. ${NO_REEMPLAZA} Esta lista y estos umbrales los tiene que validar un contador (Estudio Cristofaro, cliente cero).`}
        className="mb-0"
      />
      <Feedback sp={sp} />

      <section aria-labelledby="tareas" className="grid gap-3">
        <h2 id="tareas" className="text-title font-semibold text-ink">
          Tareas que requieren un matriculado
        </h2>
        <p className="text-ui text-muted">Cuando la persona o el Vigía tocan una de estas tareas, Faro no la acompaña: explica que la tiene que hacer un profesional matriculado y ofrece sumar un contador. Las frases se buscan en lo que escribe la persona (sin tildes).</p>
        {[...tasks, null].map((t) => (
          <form key={t?.key ?? "nueva"} id={t ? `tarea-${t.key}` : "tarea-nueva"} action={saveTaskAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="text-body font-medium text-ink">{t ? t.title : "Nueva tarea"}</p>
              {t && <Validation state={t.validation} by={t.validatedBy} />}
            </div>
            {t ? <input type="hidden" name="key" value={t.key} /> : (
              <label className="text-meta text-muted">
                Clave
                <input name="key" required disabled={!owner} placeholder="ej.: sucesiones" className={input} />
              </label>
            )}
            <label className="text-meta text-muted">
              Título
              <input name="title" required defaultValue={t?.title} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Descripción
              <textarea name="description" rows={2} defaultValue={t?.description} disabled={!owner} className={area} />
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Frases que la identifican (separadas por coma)
              <textarea name="keywords" rows={2} defaultValue={t?.keywords.join(", ")} disabled={!owner} className={area} />
            </label>
            <ValidationFields state={t?.validation ?? "a_validar"} by={t?.validatedBy ?? null} disabled={!owner} />
            <label className="flex items-center gap-2 text-ui text-ink">
              <input type="checkbox" name="active" defaultChecked={t?.active ?? true} disabled={!owner} className="size-4 accent-navy" /> Activa
            </label>
            {owner && (
              <div className="sm:text-right">
                <SubmitButton variant="secondary" pendingText="…">{t ? "Guardar" : "Agregar tarea"}</SubmitButton>
              </div>
            )}
          </form>
        ))}
      </section>

      <section aria-labelledby="leyendas" className="grid gap-3">
        <h2 id="leyendas" className="text-title font-semibold text-ink">
          Leyendas obligatorias en los comprobantes
        </h2>
        <p className="text-ui text-muted">
          Cada emisor carga una vez su perfil de leyendas y Faro las imprime solas en el PDF. Cuando cambia una norma, editá la regla: sube la versión, queda la historia y, si marcás el aviso, les llega a los dueños de los tenants a los que les puede tocar.
          {toValidate > 0 && <strong className="font-semibold text-ink"> {toValidate} {toValidate === 1 ? "regla está" : "reglas están"} a validar con la norma oficial.</strong>}
        </p>
        {[...legends, null].map((l) => (
          <form key={l?.key ?? "nueva"} id={l ? `leyenda-${l.key}` : "leyenda-nueva"} action={saveLegendAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="text-body font-medium text-ink">
                {l ? `${l.title} · ${l.jurisdiction}` : "Nueva leyenda"}
                {l && <span className="num ml-2 text-meta text-muted">v{l.version}</span>}
              </p>
              {l && <LegendBadge status={l.status} />}
            </div>
            {l ? <input type="hidden" name="key" value={l.key} /> : (
              <label className="text-meta text-muted">
                Clave
                <input name="key" required disabled={!owner} placeholder="ej.: isib_cordoba" className={input} />
              </label>
            )}
            <label className="text-meta text-muted">
              Título
              <input name="title" required defaultValue={l?.title} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted">
              Jurisdicción
              <input name="jurisdiction" defaultValue={l?.jurisdiction ?? "Nacional"} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted">
              Cuándo se aplica
              <select name="condition" defaultValue={l?.condition ?? "transparencia"} disabled={!owner} className={input}>
                {Object.entries(CONDITIONS).map(([k, c]) => (
                  <option key={k} value={k}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Texto (una línea por renglón; marcadores: {"{iva_contenido}"}, {"{otros_nacionales}"}, {"{alicuota}"})
              <textarea name="template" rows={3} required defaultValue={l?.template} disabled={!owner} className={area} />
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Norma (fuente)
              <textarea name="source" rows={2} defaultValue={l?.source} disabled={!owner} className={area} />
            </label>
            <label className="text-meta text-muted">
              Enlace a la norma
              <input name="source_url" type="url" defaultValue={l?.sourceUrl ?? ""} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted">
              Estado
              <select name="status" defaultValue={l?.status ?? "a_validar"} disabled={!owner} className={input}>
                {Object.entries(LEGEND_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-meta text-muted">
              Vigente desde
              <input name="valid_from" type="date" required defaultValue={l?.validFrom} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted">
              Hasta (opcional)
              <input name="valid_to" type="date" defaultValue={l?.validTo ?? ""} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Nota interna
              <input name="note" defaultValue={l?.note ?? ""} disabled={!owner} className={input} />
            </label>
            {owner && (
              <label className="text-meta text-muted sm:col-span-2">
                Qué cambió (va en la historia y en el aviso)
                <input name="change" placeholder="Ej.: AGIP prorrogó la adecuación hasta el 30/09/2026" className={input} />
              </label>
            )}
            <label className="flex items-center gap-2 text-ui text-ink">
              <input type="checkbox" name="active" defaultChecked={l?.active ?? true} disabled={!owner} className="size-4 accent-navy" /> Activa
            </label>
            {owner && (
              <label className="flex items-center gap-2 text-ui text-ink">
                <input type="checkbox" name="notify" className="size-4 accent-navy" /> Avisar a los afectados
              </label>
            )}
            {l && l.history.length > 0 && (
              <details className="text-meta text-muted sm:col-span-2">
                <summary className="cursor-pointer">Versiones anteriores ({l.history.length})</summary>
                <ul className="mt-1 grid gap-1">
                  {[...l.history].reverse().map((h, i) => (
                    <li key={i}>
                      v{String(h.version)} · {LEGEND_STATUS[h.status as LegendStatus] ?? String(h.status)} · desde {String(h.valid_from)}
                      {h.change ? ` · ${String(h.change)}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {owner && (
              <div className="sm:col-span-2 sm:text-right">
                <SubmitButton variant="secondary" pendingText="…">{l ? "Guardar" : "Agregar leyenda"}</SubmitButton>
              </div>
            )}
          </form>
        ))}
      </section>

      <section aria-labelledby="reglas" className="grid gap-3">
        <h2 id="reglas" className="text-title font-semibold text-ink">
          Disparador de derivación
        </h2>
        <p className="text-ui text-muted">Cuando se cumple una regla, la persona ve una sugerencia amable de sumar un contador que lleva a la Red con el contexto armado. Si la descarta, vuelve a aparecer pasados los días indicados.</p>
        {rules.map((r) => (
          <form key={r.key} id={`regla-${r.key}`} action={saveRuleAction} className="grid gap-3 rounded-md border border-line bg-surface p-4 sm:grid-cols-2">
            <input type="hidden" name="key" value={r.key} />
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              <p className="text-body font-medium text-ink">{r.title}</p>
              <Validation state={r.validation} by={r.validatedBy} />
            </div>
            <p className="text-meta text-muted sm:col-span-2">{r.description}</p>
            <label className="text-meta text-muted">
              Título
              <input name="title" defaultValue={r.title} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted">
              Qué necesita (contexto para la Red)
              <input name="need" defaultValue={r.need} disabled={!owner} className={input} />
            </label>
            <label className="text-meta text-muted sm:col-span-2">
              Texto que ve la persona
              <textarea name="message" rows={2} defaultValue={r.message} disabled={!owner} className={area} />
            </label>
            {r.threshold != null ? (
              <label className="text-meta text-muted">
                Umbral · {r.thresholdLabel}
                <input name="threshold" inputMode="decimal" defaultValue={String(r.threshold)} disabled={!owner} className={input} />
              </label>
            ) : (
              <p className="self-end pb-2 text-meta text-muted">Se dispara por un momento, sin umbral.</p>
            )}
            <label className="text-meta text-muted">
              Vuelve a aparecer a los (días)
              <input name="snooze_days" type="number" min={1} max={365} defaultValue={r.snoozeDays} disabled={!owner} className={input} />
            </label>
            <ValidationFields state={r.validation} by={r.validatedBy} disabled={!owner} />
            <label className="flex items-center gap-2 text-ui text-ink">
              <input type="checkbox" name="active" defaultChecked={r.active} disabled={!owner} className="size-4 accent-navy" /> Activa
            </label>
            {owner && (
              <div className="sm:text-right">
                <SubmitButton variant="secondary" pendingText="…">Guardar</SubmitButton>
              </div>
            )}
          </form>
        ))}
      </section>
    </div>
  );
}
